import { NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';
import { sendEmail } from '@/lib/email-sender';
import { renderTemplate } from '@/lib/template-renderer';
import { buildTrackingPixelHtml } from '@/lib/email-tracking';
import { extractPlainText } from '@/lib/email-content';
import { finalizeSentEmail } from '@/lib/outbound-email';

// NO maxDuration constraint for cron jobs
export const dynamic = 'force-dynamic';

interface PendingSequenceEmail {
  enrollment_id: string;
  step_id: string;
  workspace_id: string;
  contact_id: string;
  contact_email: string;
  contact_first_name: string | null;
  contact_last_name: string | null;
  contact_company_name: string | null;
  contact_company_domain: string | null;
  contact_job_title: string | null;
  contact_linkedin_url: string | null;
  contact_location: string | null;
  contact_education: string | null;
  contact_phone: string | null;
  contact_notes: string | null;
  contact_ai_score: number | null;
  contact_ai_score_label: string | null;
  contact_ai_personalized_line: string | null;
  user_id: string;
  user_email: string;
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_password_encrypted: string;
  bcc_enabled: boolean;
  template_subject: string;
  template_html_content: string;
  delay_days: number;
  step_order: number;
  sequence_id: string;
  retry_count: number;
  max_retries: number;
}

interface NextStep {
  step_id: string;
  delay_days: number;
}

export async function POST(request: Request) {
  try {
    // Verify service key
    const serviceKey = request.headers.get('x-service-key');
    if (serviceKey !== process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getServiceSupabase();

    // Get all pending sequence emails that are ready to send
    // Join campaign_enrollments, campaign_sequence_steps, templates, contacts, user_settings
    const { data: pendingEmails, error: fetchError } = await supabase
      .rpc('get_pending_sequence_emails');

    if (fetchError) {
      console.error('Error fetching pending sequence emails:', fetchError);
      throw fetchError;
    }

    if (!pendingEmails || (pendingEmails as PendingSequenceEmail[]).length === 0) {
      return NextResponse.json({
        processed: 0,
        sent: 0,
        failed: 0,
        message: 'No pending sequence emails',
      });
    }

    let sentCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    // Group by user_id and take only the FIRST pending email per user
    // This ensures proper spacing between emails (via cron running every 5 min)
    const emailsByUser = new Map<string, PendingSequenceEmail>();
    for (const email of (pendingEmails as PendingSequenceEmail[])) {
      if (!emailsByUser.has(email.user_id)) {
        emailsByUser.set(email.user_id, email);
      }
    }

    // Process one email per user
    for (const [userId, email] of emailsByUser) {
      try {
        // Double-check that contact hasn't replied
        const { data: contact } = await supabase
          .from('contacts')
          .select('replied_at')
          .eq('id', email.contact_id)
          .single();

        if (contact?.replied_at) {
          // Contact has replied, mark enrollment as completed
          await supabase
            .from('campaign_enrollments')
            .update({ status: 'completed', completed_at: new Date().toISOString() })
            .eq('id', email.enrollment_id);
          continue;
        }

        // Build template variables from contact fields
        const variables: Record<string, string> = {
          first_name: email.contact_first_name || '',
          last_name: email.contact_last_name || '',
          email: email.contact_email || '',
          phone: email.contact_phone || '',
          company_name: email.contact_company_name || '',
          company_domain: email.contact_company_domain || '',
          job_title: email.contact_job_title || '',
          linkedin_url: email.contact_linkedin_url || '',
          location: email.contact_location || '',
          education: email.contact_education || '',
          notes: email.contact_notes || '',
          ai_score: email.contact_ai_score != null ? String(email.contact_ai_score) : '',
          ai_score_label: email.contact_ai_score_label || '',
          ai_personalized_line: email.contact_ai_personalized_line || '',
        };

        // Render subject and body
        const renderedSubject = renderTemplate(email.template_subject || '', variables);
        const renderedHtml = renderTemplate(email.template_html_content || '', variables);

        // Insert emails_sent record first to get an ID for tracking pixel
        const { data: emailRecord, error: insertError } = await supabase
          .from('emails_sent')
          .insert({
            contact_id: email.contact_id,
            sent_by: email.user_id,
            sent_by_email: email.user_email,
            status: 'pending',
            workspace_id: email.workspace_id,
            enrollment_id: email.enrollment_id,
            step_id: email.step_id,
          })
          .select('id')
          .single();

        if (insertError || !emailRecord) {
          throw new Error(insertError?.message || 'Failed to create email record');
        }

        const trackingPixel = buildTrackingPixelHtml(emailRecord.id);
        const finalHtml = `${renderedHtml}\n${trackingPixel}`;
        const plainText = extractPlainText(undefined, renderedHtml);

        // Send email via SMTP
        const result = await sendEmail(
          {
            host: email.smtp_host,
            port: email.smtp_port,
            user: email.smtp_user,
            passwordEncrypted: email.smtp_password_encrypted,
            bccEnabled: email.bcc_enabled,
          },
          {
            to: email.contact_email,
            subject: renderedSubject,
            html: finalHtml,
            text: plainText,
            from: email.user_email || email.smtp_user,
          }
        );

        if (!result.success) {
          // Increment retry count
          const newRetryCount = email.retry_count + 1;

          if (newRetryCount > email.max_retries) {
            // Max retries exceeded, mark as bounced
            await supabase
              .from('emails_sent')
              .update({ status: 'bounced', error_message: result.error || 'Max retries exceeded' })
              .eq('id', emailRecord.id);

            await supabase
              .from('campaign_enrollments')
              .update({ status: 'bounced' })
              .eq('id', email.enrollment_id);

            throw new Error(result.error || 'Email sending failed - max retries exceeded');
          } else {
            // Update retry count and reschedule
            await supabase
              .from('emails_sent')
              .update({ status: 'failed', error_message: result.error || 'Email sending failed' })
              .eq('id', emailRecord.id);

            await supabase
              .from('campaign_enrollments')
              .update({
                retry_count: newRetryCount,
                next_send_at: new Date(Date.now() + 3600000).toISOString(), // Retry in 1 hour
              })
              .eq('id', email.enrollment_id);

            throw new Error(result.error || 'Email sending failed');
          }
        }

        try {
          await finalizeSentEmail({
            supabase,
            workspaceId: email.workspace_id,
            userId: email.user_id,
            contactId: email.contact_id,
            emailSentId: emailRecord.id,
            rawMessageId: result.messageId!,
            subject: renderedSubject,
            htmlBody: renderedHtml,
            textBody: plainText,
            to: email.contact_email,
            from: {
              email: email.smtp_user,
              name: email.user_email || email.smtp_user,
            },
            enrollmentId: email.enrollment_id,
            stepId: email.step_id,
            metadata: {
              enrollment_id: email.enrollment_id,
              step_id: email.step_id,
              sequence_id: email.sequence_id,
            },
          });
        } catch (finalizeErr) {
          console.error('finalizeSentEmail error (email was still sent):', finalizeErr instanceof Error ? finalizeErr.message : finalizeErr);
          await supabase.from('emails_sent').update({ status: 'sent', message_id: result.messageId, sent_at: new Date().toISOString() }).eq('id', emailRecord.id);
        }

        // Update contact status if this is first email in sequence
        if (email.step_order === 0) {
          await supabase
            .from('contacts')
            .update({ status: 'contacted' })
            .eq('id', email.contact_id)
            .in('status', ['new']);
        }

        // Get next step in sequence
        const { data: nextSteps } = await supabase
          .from('campaign_sequence_steps')
          .select('id, delay_days')
          .eq('sequence_id', email.sequence_id)
          .gt('step_order', email.step_order)
          .order('step_order', { ascending: true })
          .limit(1)
          .returns<NextStep[]>();

        if (nextSteps && nextSteps.length > 0) {
          // Calculate next_send_at based on delay_days
          const nextStep = nextSteps[0];
          const nextSendAt = new Date();
          nextSendAt.setDate(nextSendAt.getDate() + nextStep.delay_days);

          // Update enrollment with next step
          await supabase
            .from('campaign_enrollments')
            .update({
              current_step_id: nextStep.step_id,
              next_send_at: nextSendAt.toISOString(),
              retry_count: 0, // Reset retry count for next step
            })
            .eq('id', email.enrollment_id);
        } else {
          // No more steps, mark enrollment as completed
          await supabase
            .from('campaign_enrollments')
            .update({
              status: 'completed',
              completed_at: new Date().toISOString(),
            })
            .eq('id', email.enrollment_id);
        }

        sentCount++;
      } catch (error: any) {
        console.error('Sequence email send error:', error instanceof Error ? error.message : error);
        errors.push(`${email.contact_email}: ${error.message || 'Send failed'}`);
        failedCount++;
      }
    }

    return NextResponse.json({
      processed: (pendingEmails as PendingSequenceEmail[]).length,
      sent: sentCount,
      failed: failedCount,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error('Process sequences error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
