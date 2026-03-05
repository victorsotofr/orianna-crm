import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { getWorkspaceContext } from '@/lib/workspace';
import { sendEmail } from '@/lib/email-sender';
import { renderTemplate } from '@/lib/template-renderer';

// POST /api/campaigns/sequences/[id]/send-now - Send pending emails immediately (for testing)
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

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

    // Verify sequence exists and belongs to workspace
    const { data: sequence, error: sequenceError } = await supabase
      .from('campaign_sequences')
      .select(`
        id,
        name,
        status,
        steps:campaign_sequence_steps(
          id,
          template_id,
          step_order,
          delay_days
        )
      `)
      .eq('id', id)
      .eq('workspace_id', ctx.workspaceId)
      .single();

    if (sequenceError || !sequence) {
      return NextResponse.json({ error: 'Sequence not found' }, { status: 404 });
    }

    // Get pending enrollments (next_send_at in the past or null)
    const { data: pendingEnrollments, error: enrollError } = await supabase
      .from('campaign_enrollments')
      .select(`
        id,
        contact_id,
        current_step_id,
        next_send_at,
        contact:contacts(
          id,
          email,
          first_name,
          last_name,
          company_name,
          company_domain,
          job_title,
          location,
          ai_personalized_line,
          assigned_to
        )
      `)
      .eq('sequence_id', id)
      .eq('workspace_id', ctx.workspaceId)
      .eq('status', 'active')
      .or('next_send_at.is.null,next_send_at.lte.' + new Date().toISOString());

    if (enrollError) {
      throw enrollError;
    }

    if (!pendingEnrollments || pendingEnrollments.length === 0) {
      return NextResponse.json({
        message: 'No pending emails to send',
        sent: 0,
      });
    }

    // Get current user's SMTP settings (for testing, use sender's settings instead of contact.assigned_to)
    const { data: currentUserSettings, error: currentUserSettingsError } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    console.log('[send-now] Current user settings:', {
      found: !!currentUserSettings,
      hasSmtp: !!currentUserSettings?.smtp_host,
      error: currentUserSettingsError?.message,
    });

    if (!currentUserSettings || !currentUserSettings.smtp_host) {
      return NextResponse.json({
        error: 'Vous devez configurer votre SMTP dans Paramètres avant d\'envoyer des emails',
        sent: 0,
      }, { status: 400 });
    }

    const results = [];
    const sortedSteps = sequence.steps.sort((a: any, b: any) => a.step_order - b.step_order);

    for (const enrollment of pendingEnrollments) {
      const contact = enrollment.contact as any;
      console.log(`[send-now] Processing enrollment ${enrollment.id}:`, {
        hasContact: !!contact,
        email: contact?.email,
      });

      if (!contact || !contact.email) {
        console.log(`[send-now] Skipping enrollment ${enrollment.id}: missing contact data`);
        results.push({
          enrollment_id: enrollment.id,
          contact_email: contact?.email || 'unknown',
          success: false,
          error: 'Contact missing email',
        });
        continue;
      }

      // Find current step
      const currentStep = sortedSteps.find((s: any) => s.id === enrollment.current_step_id);
      if (!currentStep) {
        console.log(`[send-now] Skipping enrollment ${enrollment.id}: step not found`);
        continue;
      }

      // Get template
      const { data: template } = await supabase
        .from('templates')
        .select('id, name, subject, html_content')
        .eq('id', currentStep.template_id)
        .eq('workspace_id', ctx.workspaceId)
        .single();

      if (!template) {
        console.log(`[send-now] Skipping enrollment ${enrollment.id}: template not found`);
        continue;
      }

      // Use current user's SMTP settings for sending
      const userSettings = currentUserSettings;

      // Render template
      const rendered = renderTemplate(template.html_content, {
        first_name: contact.first_name || '',
        last_name: contact.last_name || '',
        company_name: contact.company_name || '',
        job_title: contact.job_title || '',
        location: contact.location || '',
        ai_personalized_line: contact.ai_personalized_line || '',
      });

      const renderedSubject = renderTemplate(template.subject, {
        first_name: contact.first_name || '',
        last_name: contact.last_name || '',
        company_name: contact.company_name || '',
      });

      // Send email
      try {
        const emailConfig = {
          host: userSettings.smtp_host,
          port: userSettings.smtp_port,
          user: userSettings.smtp_user,
          passwordEncrypted: userSettings.smtp_password_encrypted,
          bccEnabled: userSettings.bcc_enabled,
        };

        const emailData = {
          to: contact.email,
          subject: renderedSubject,
          html: rendered,
          from: contact.first_name && contact.last_name
            ? `${contact.first_name} ${contact.last_name}`
            : userSettings.user_email || 'CRM',
        };

        const result = await sendEmail(emailConfig, emailData);

        if (!result.success) {
          throw new Error(result.error || 'Failed to send email');
        }

        // Record email sent
        await supabase.from('emails_sent').insert({
          workspace_id: ctx.workspaceId,
          contact_id: contact.id,
          template_id: template.id,
          user_id: contact.assigned_to,
          sent_by: user.id,
          sent_by_email: userSettings.user_email,
          status: 'sent',
          enrollment_id: enrollment.id,
          step_id: currentStep.id,
          sent_at: new Date().toISOString(),
        });

        // Find next step
        const currentStepIndex = sortedSteps.findIndex((s: any) => s.id === currentStep.id);
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
            .eq('id', enrollment.id);
        } else {
          // Sequence completed
          await supabase
            .from('campaign_enrollments')
            .update({
              status: 'completed',
              completed_at: new Date().toISOString(),
            })
            .eq('id', enrollment.id);
        }

        // Add timeline event
        await supabase.from('contact_timeline').insert({
          contact_id: contact.id,
          event_type: 'email_sent',
          title: `Email envoyé: ${template.name}`,
          description: `Étape ${currentStep.step_order + 1} de la séquence "${sequence.name}"`,
          metadata: {
            sequence_id: sequence.id,
            step_id: currentStep.id,
            template_id: template.id,
          },
          created_by: user.id,
          workspace_id: ctx.workspaceId,
        });

        results.push({
          enrollment_id: enrollment.id,
          contact_email: contact.email,
          success: true,
        });
      } catch (error: any) {
        console.error(`[send-now] Error sending to ${contact.email}:`, error);
        results.push({
          enrollment_id: enrollment.id,
          contact_email: contact.email,
          success: false,
          error: error.message,
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const errors = results.filter(r => !r.success).map(r => ({
      email: r.contact_email,
      error: r.error,
    }));

    console.log('[send-now] Results:', { successCount, total: results.length, errors });

    return NextResponse.json({
      message: `Sent ${successCount}/${results.length} emails`,
      sent: successCount,
      results,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error('Send now error:', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: error.message || 'Failed to send emails' },
      { status: 500 }
    );
  }
}
