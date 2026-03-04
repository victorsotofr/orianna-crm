import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { sendEmail } from '@/lib/email-sender';
import { renderTemplate } from '@/lib/template-renderer';
import { getWorkspaceContext } from '@/lib/workspace';
import { buildTrackingPixelHtml } from '@/lib/email-tracking';

export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    // Get authenticated Supabase client
    const { supabase, error: clientError } = await createServerClient();

    if (clientError || !supabase) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const wsId = request.headers.get('x-workspace-id');
    const ctx = await getWorkspaceContext(supabase, user.id, wsId);
    if (!ctx) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

    const body = await request.json();
    const { contactId, templateId, campaignId, templateVariables } = body;

    if (!contactId || !templateId) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    // Fetch contact
    const { data: contact, error: contactError } = await supabase
      .from('contacts')
      .select('*')
      .eq('id', contactId)
      .single();

    if (contactError || !contact) {
      throw new Error('Contact not found');
    }

    // Fetch template
    const { data: template, error: templateError } = await supabase
      .from('templates')
      .select('*')
      .eq('id', templateId)
      .single();

    if (templateError || !template) {
      throw new Error('Template not found');
    }

    // Fetch user settings
    const { data: settings, error: settingsError } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (settingsError || !settings || !settings.smtp_password_encrypted) {
      return NextResponse.json(
        { error: 'SMTP settings not configured. Please configure them in Settings.' },
        { status: 400 }
      );
    }

    // Verify that signature is configured (REQUIRED)
    if (!settings.signature_html || settings.signature_html.trim() === '') {
      return NextResponse.json(
        { error: 'Email signature not configured. Please add your signature in Settings.' },
        { status: 400 }
      );
    }

    // Atomic daily send limit check
    const { data: canSend } = await supabase.rpc('check_daily_send_limit', {
      p_user_id: user.id,
      p_limit: settings.daily_send_limit || 50,
    });

    if (!canSend) {
      return NextResponse.json(
        {
          error: `Daily send limit (${settings.daily_send_limit}) reached. Try again tomorrow.`,
        },
        { status: 429 }
      );
    }

    // Prepare template variables from all contact fields
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
      ...templateVariables,
    };

    // Render email template
    const renderedHtml = renderTemplate(template.html_content, variables);
    const renderedSubject = renderTemplate(template.subject, variables);

    // Insert emails_sent record first to get an ID for tracking pixel
    const { data: emailRecord, error: insertError } = await supabase
      .from('emails_sent')
      .insert({
        contact_id: contactId,
        campaign_id: campaignId,
        template_id: templateId,
        sent_by: user.id,
        sent_by_email: user.email,
        status: 'pending',
        workspace_id: ctx.workspaceId,
      })
      .select('id')
      .single();

    if (insertError) {
      // Unique constraint violation = already sent (concurrent request won the race)
      if (insertError.code === '23505') {
        return NextResponse.json({
          success: false,
          alreadySent: true,
          message: 'Email already sent to this contact with this template',
        });
      }
      console.error('Error recording email send:', insertError instanceof Error ? insertError.message : insertError);
      return NextResponse.json(
        { error: 'Failed to create email record', success: false },
        { status: 500 }
      );
    }

    // Build tracking pixel and append after signature
    const trackingPixel = buildTrackingPixelHtml(emailRecord.id);
    const finalHtml = `${renderedHtml}\n\n${settings.signature_html}\n${trackingPixel}`;

    // Send email
    const emailResult = await sendEmail(
      {
        host: settings.smtp_host!,
        port: settings.smtp_port,
        user: settings.smtp_user!,
        passwordEncrypted: settings.smtp_password_encrypted,
        bccEnabled: settings.bcc_enabled !== false,
      },
      {
        to: contact.email,
        subject: renderedSubject,
        html: finalHtml,
        from: settings.user_email || user.email || 'Email Automation',
      }
    );

    if (!emailResult.success) {
      // Update record to failed
      await supabase
        .from('emails_sent')
        .update({ status: 'failed', error_message: emailResult.error })
        .eq('id', emailRecord.id);

      return NextResponse.json(
        { error: emailResult.error, success: false },
        { status: 500 }
      );
    }

    // Update record to sent with message_id
    await supabase
      .from('emails_sent')
      .update({ status: 'sent', message_id: emailResult.messageId })
      .eq('id', emailRecord.id);

    // Update campaign sent count if campaign exists
    if (campaignId) {
      await supabase.rpc('increment_campaign_sent_count', {
        campaign_id: campaignId,
      });
    }

    return NextResponse.json({
      success: true,
      messageId: emailResult.messageId,
      message: 'Email sent successfully',
    });
  } catch (error: any) {
    console.error('Email send error:', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: error.message || 'Failed to send email', success: false },
      { status: 500 }
    );
  }
}

