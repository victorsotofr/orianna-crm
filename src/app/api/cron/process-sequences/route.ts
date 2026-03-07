import { NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';
import { sendEmail } from '@/lib/email-sender';
import { renderTemplate } from '@/lib/template-renderer';
import { buildTrackingPixelHtml } from '@/lib/email-tracking';
import { extractPlainText } from '@/lib/email-content';
import { finalizeSentEmail } from '@/lib/outbound-email';

// POST /api/cron/process-sequences - Process pending sequence emails (called by cron)
export async function POST(request: Request) {
  try {
    // Verify this is called by an authorized service (cron, webhook, etc.)
    const serviceKey = request.headers.get('x-service-key');
    if (serviceKey !== process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getServiceSupabase();
    const startTime = Date.now();

    console.log('[cron] Starting sequence processing...');

    // Use the RPC function from migration 013 to get pending emails
    const { data: pendingEmails, error: rpcError } = await supabase
      .rpc('get_pending_sequence_emails');

    if (rpcError) {
      console.error('[cron] Error fetching pending emails:', rpcError);
      throw rpcError;
    }

    console.log(`[cron] Found ${pendingEmails?.length || 0} pending emails`);

    if (!pendingEmails || pendingEmails.length === 0) {
      return NextResponse.json({
        success: true,
        processed: 0,
        message: 'No pending emails to send',
      });
    }

    const results = {
      sent: 0,
      failed: 0,
      errors: [] as any[],
    };

    // Process each pending email
    for (const pending of pendingEmails) {
      try {
        console.log(`[cron] Processing enrollment ${pending.enrollment_id} for ${pending.contact_email}`);

        // Render template
        const rendered = renderTemplate(pending.template_html_content, {
          first_name: pending.contact_first_name || '',
          last_name: pending.contact_last_name || '',
          company_name: pending.contact_company_name || '',
          job_title: pending.contact_job_title || '',
          location: pending.contact_location || '',
          ai_personalized_line: pending.contact_ai_personalized_line || '',
        });

        const renderedSubject = renderTemplate(pending.template_subject, {
          first_name: pending.contact_first_name || '',
          last_name: pending.contact_last_name || '',
          company_name: pending.contact_company_name || '',
        });

        const { data: emailRecord, error: emailRecordError } = await supabase
          .from('emails_sent')
          .insert({
            workspace_id: pending.workspace_id,
            contact_id: pending.contact_id,
            template_id: pending.step_id,
            user_id: pending.user_id,
            sent_by: pending.user_id,
            sent_by_email: pending.user_email,
            status: 'pending',
            enrollment_id: pending.enrollment_id,
            step_id: pending.step_id,
          })
          .select('id')
          .single();

        if (emailRecordError || !emailRecord) {
          throw new Error(emailRecordError?.message || 'Failed to create email record');
        }

        const emailConfig = {
          host: pending.smtp_host,
          port: pending.smtp_port,
          user: pending.smtp_user,
          passwordEncrypted: pending.smtp_password_encrypted,
          bccEnabled: pending.bcc_enabled,
        };

        const trackingPixel = buildTrackingPixelHtml(emailRecord.id);
        const finalHtml = `${rendered}\n${trackingPixel}`;
        const plainText = extractPlainText(undefined, rendered);

        const emailData = {
          to: pending.contact_email,
          subject: renderedSubject,
          html: finalHtml,
          text: plainText,
          from: pending.user_email || 'CRM',
        };

        const result = await sendEmail(emailConfig, emailData);

        if (!result.success) {
          await supabase
            .from('emails_sent')
            .update({ status: 'failed', error_message: result.error || 'Failed to send email' })
            .eq('id', emailRecord.id);
          throw new Error(result.error || 'Failed to send email');
        }

        console.log(`[cron] Email sent successfully to ${pending.contact_email}`);

        await finalizeSentEmail({
          supabase,
          workspaceId: pending.workspace_id,
          userId: pending.user_id,
          contactId: pending.contact_id,
          emailSentId: emailRecord.id,
          rawMessageId: result.messageId!,
          subject: renderedSubject,
          htmlBody: rendered,
          textBody: plainText,
          to: pending.contact_email,
          from: {
            email: pending.smtp_user,
            name: pending.user_email || 'CRM',
          },
          enrollmentId: pending.enrollment_id,
          stepId: pending.step_id,
          metadata: {
            sequence_id: pending.sequence_id,
            legacy_cron: true,
          },
        });

        // Get sequence info to find next step
        const { data: sequence } = await supabase
          .from('campaign_sequences')
          .select(`
            id,
            name,
            steps:campaign_sequence_steps(id, step_order, delay_days)
          `)
          .eq('id', pending.sequence_id)
          .single();

        if (!sequence) {
          throw new Error('Sequence not found');
        }

        const sortedSteps = sequence.steps.sort((a: any, b: any) => a.step_order - b.step_order);
        const currentStepIndex = sortedSteps.findIndex((s: any) => s.id === pending.step_id);
        const nextStep = sortedSteps[currentStepIndex + 1];

        if (nextStep) {
          // Move to next step
          const nextSendAt = new Date();
          nextSendAt.setDate(nextSendAt.getDate() + nextStep.delay_days);

          await supabase
            .from('campaign_enrollments')
            .update({
              current_step_id: nextStep.id,
              next_send_at: nextSendAt.toISOString(),
            })
            .eq('id', pending.enrollment_id);

          console.log(`[cron] Moved to step ${nextStep.step_order}, next send: ${nextSendAt.toISOString()}`);
        } else {
          // Sequence completed
          await supabase
            .from('campaign_enrollments')
            .update({
              status: 'completed',
              completed_at: new Date().toISOString(),
            })
            .eq('id', pending.enrollment_id);

          console.log(`[cron] Sequence completed for enrollment ${pending.enrollment_id}`);
        }

        // Add timeline event
        await supabase.from('contact_timeline').insert({
          contact_id: pending.contact_id,
          event_type: 'email_sent',
          title: `Email envoyé automatiquement`,
          description: `Étape ${pending.step_order + 1} de la séquence "${sequence.name}"`,
          metadata: {
            sequence_id: pending.sequence_id,
            step_id: pending.step_id,
            enrollment_id: pending.enrollment_id,
            automated: true,
          },
          created_by: pending.user_id,
          workspace_id: pending.workspace_id,
        });

        results.sent++;
      } catch (error: any) {
        console.error(`[cron] Error processing enrollment ${pending.enrollment_id}:`, error);

        results.failed++;
        results.errors.push({
          enrollment_id: pending.enrollment_id,
          contact_email: pending.contact_email,
          error: error.message,
        });

        // Increment retry count or mark as failed
        const newRetryCount = (pending.retry_count || 0) + 1;
        if (newRetryCount >= pending.max_retries) {
          // Max retries reached, pause enrollment
          await supabase
            .from('campaign_enrollments')
            .update({ status: 'paused' })
            .eq('id', pending.enrollment_id);

          console.log(`[cron] Max retries reached for enrollment ${pending.enrollment_id}, paused`);
        } else {
          // Increment retry count and try again next run
          await supabase
            .from('campaign_enrollments')
            .update({ retry_count: newRetryCount })
            .eq('id', pending.enrollment_id);
        }
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[cron] Completed in ${duration}ms. Sent: ${results.sent}, Failed: ${results.failed}`);

    return NextResponse.json({
      success: true,
      processed: pendingEmails.length,
      sent: results.sent,
      failed: results.failed,
      duration_ms: duration,
      errors: results.errors.length > 0 ? results.errors : undefined,
    });
  } catch (error: any) {
    console.error('[cron] Process sequences error:', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: error.message || 'Failed to process sequences' },
      { status: 500 }
    );
  }
}

// GET endpoint for manual testing (no auth required in dev)
export async function GET(request: Request) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Use POST in production' }, { status: 405 });
  }

  console.log('[cron] Manual trigger via GET (dev only)');

  // In dev, allow GET without service key for testing
  const mockRequest = new Request(request.url, {
    method: 'POST',
    headers: {
      'x-service-key': process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    },
  });

  return POST(mockRequest);
}
