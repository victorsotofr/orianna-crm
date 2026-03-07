import { NextResponse } from 'next/server';
// import * as Sentry from '@sentry/nextjs';
import { createServerClient } from '@/lib/supabase-server';
import { sendEmail } from '@/lib/email-sender';
import { renderTemplate } from '@/lib/template-renderer';
import { getWorkspaceContext } from '@/lib/workspace';
import { buildTrackingPixelHtml } from '@/lib/email-tracking';
import { extractPlainText } from '@/lib/email-content';
import { finalizeSentEmail } from '@/lib/outbound-email';


export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    const { supabase, error: clientError } = await createServerClient();
    if (!supabase || clientError) {
      return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const wsId = request.headers.get('x-workspace-id');
    const ctx = await getWorkspaceContext(supabase, user.id, wsId);
    if (!ctx) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

    const { contactIds, templateId, stage } = await request.json();

    if (!contactIds || !Array.isArray(contactIds) || contactIds.length === 0) {
      return NextResponse.json({ error: 'No contacts selected' }, { status: 400 });
    }
    if (!templateId) {
      return NextResponse.json({ error: 'No template selected' }, { status: 400 });
    }
    if (!['first', 'second', 'third'].includes(stage)) {
      return NextResponse.json({ error: 'Invalid stage' }, { status: 400 });
    }

    // Fetch template
    const { data: template, error: templateError } = await supabase
      .from('templates')
      .select('*')
      .eq('id', templateId)
      .single();

    if (templateError || !template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    // Fetch contacts
    const { data: contacts, error: contactsError } = await supabase
      .from('contacts')
      .select('*')
      .in('id', contactIds);

    if (contactsError || !contacts) {
      return NextResponse.json({ error: 'Contacts not found' }, { status: 404 });
    }

    // Get user settings for SMTP
    const { data: userSettings } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (!userSettings?.smtp_host || !userSettings?.smtp_user || !userSettings?.smtp_password_encrypted) {
      return NextResponse.json({
        error: 'Configuration SMTP manquante. Allez dans Paramètres pour configurer votre email.',
      }, { status: 400 });
    }

    // Atomic daily send limit check
    const { data: canSend } = await supabase.rpc('check_daily_send_limit', {
      p_user_id: user.id,
      p_limit: userSettings.daily_send_limit || 50,
    });

    if (!canSend) {
      return NextResponse.json({
        error: `Limite d'envoi journalière (${userSettings.daily_send_limit || 50}) atteinte. Réessayez demain.`,
      }, { status: 429 });
    }

    let sentCount = 0;
    const errors: string[] = [];

    for (const contact of contacts) {
      try {
        // Build template variables from all contact fields
        const variables: Record<string, string> = {
          first_name: contact.first_name || '',
          last_name: contact.last_name || '',
          email: contact.email || '',
          phone: contact.phone || '',
          company_name: contact.company_name || '',
          company_domain: contact.company_domain || '',
          job_title: contact.job_title || '',
          linkedin_url: contact.linkedin_url || '',
          location: contact.location || '',
          education: contact.education || '',
          status: contact.status || '',
          notes: contact.notes || '',
          first_contact: contact.first_contact || '',
          second_contact: contact.second_contact || '',
          third_contact: contact.third_contact || '',
          last_contacted_at: contact.last_contacted_at || '',
          replied_at: contact.replied_at || '',
          ai_score: contact.ai_score != null ? String(contact.ai_score) : '',
          ai_score_label: contact.ai_score_label || '',
          ai_personalized_line: contact.ai_personalized_line || '',
        };

        // Render subject and body
        const renderedSubject = renderTemplate(template.subject || '', variables);
        const renderedHtml = renderTemplate(template.html_content || '', variables);

        const followUpStage = stage === 'first' ? 0 : stage === 'second' ? 1 : 2;

        // Insert emails_sent record first to get an ID for tracking pixel
        const { data: emailRecord, error: insertError } = await supabase
          .from('emails_sent')
          .insert({
            contact_id: contact.id,
            template_id: templateId,
            sent_by: user.id,
            sent_by_email: user.email,
            status: 'pending',
            follow_up_stage: followUpStage,
            workspace_id: ctx.workspaceId,
          })
          .select('id')
          .single();

        // Unique constraint violation = already sent by concurrent request
        if (insertError?.code === '23505') {
          errors.push(`${contact.email}: déjà envoyé`);
          continue;
        }

        if (insertError || !emailRecord) {
          throw new Error(insertError?.message || 'Failed to create email record');
        }

        const composedHtml = userSettings.signature_html
          ? `${renderedHtml}\n\n${userSettings.signature_html}`
          : renderedHtml;
        const trackingPixel = buildTrackingPixelHtml(emailRecord.id);
        const finalHtml = `${composedHtml}\n${trackingPixel}`;
        const plainText = extractPlainText(undefined, composedHtml);

        // Send email via SMTP
        const result = await sendEmail(
          {
            host: userSettings.smtp_host,
            port: userSettings.smtp_port || 587,
            user: userSettings.smtp_user,
            passwordEncrypted: userSettings.smtp_password_encrypted,
            bccEnabled: userSettings.bcc_enabled !== false,
          },
          {
            to: contact.email,
            subject: renderedSubject,
            html: finalHtml,
            text: plainText,
            from: userSettings.user_email || user.email || 'CRM',
          }
        );

        if (!result.success) {
          // Update record to failed
          await supabase
            .from('emails_sent')
            .update({ status: 'failed', error_message: result.error || 'Email sending failed' })
            .eq('id', emailRecord.id);
          throw new Error(result.error || 'Email sending failed');
        }

        await finalizeSentEmail({
          supabase,
          workspaceId: ctx.workspaceId,
          userId: user.id,
          contactId: contact.id,
          emailSentId: emailRecord.id,
          rawMessageId: result.messageId!,
          subject: renderedSubject,
          htmlBody: composedHtml,
          textBody: plainText,
          to: contact.email,
          from: {
            email: userSettings.smtp_user,
            name: userSettings.user_email || user.email || 'CRM',
          },
          metadata: {
            template_id: templateId,
            template_name: template.name,
            stage,
          },
        });

        // Update contact date field
        const dateField = stage === 'first' ? 'first_contact'
          : stage === 'second' ? 'second_contact'
          : 'third_contact';

        await supabase
          .from('contacts')
          .update({
            [dateField]: new Date().toISOString().split('T')[0],
            status: 'contacted',
          })
          .eq('id', contact.id);

        // Log timeline event
        await supabase.from('contact_timeline').insert({
          contact_id: contact.id,
          event_type: 'email_sent',
          title: `Email envoyé (${stage === 'first' ? 'Premier contact' : stage === 'second' ? 'Relance 1' : 'Relance 2'})`,
          description: renderedSubject,
          metadata: {
            template_id: templateId,
            template_name: template.name,
            stage,
            message_id: result.messageId,
          },
          created_by: user.id,
          workspace_id: ctx.workspaceId,
        });

        sentCount++;
      } catch (error: any) {
        console.error('Campaign email send error:', error instanceof Error ? error.message : error);
        errors.push(error.message || 'Send failed');
      }
    }

    return NextResponse.json({
      sent: sentCount,
      total: contacts.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error('Campaign send error:', error instanceof Error ? error.message : error);
    // Sentry.captureException(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
