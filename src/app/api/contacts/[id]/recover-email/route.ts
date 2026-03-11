import { NextResponse } from 'next/server';

import { sendEmail } from '@/lib/email-sender';
import { startBulkEnrichment, getEnrichmentResult } from '@/lib/fullenrich';
import { createServerClient } from '@/lib/supabase-server';
import { getServiceSupabase } from '@/lib/supabase';
import { getWorkspaceContext } from '@/lib/workspace';

export const maxDuration = 120;

/**
 * POST /api/contacts/[id]/recover-email
 *
 * Attempts to recover a bounced email:
 * 1. Marks the current email as bounced (if not already)
 * 2. Tries FullEnrich to find a new email
 * 3. If found, updates contact and optionally auto-resends the last failed email
 * 4. If not found, keeps the contact as bounced
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: contactId } = await params;
    const { supabase, error: clientError } = await createServerClient();
    if (clientError || !supabase) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const wsId = request.headers.get('x-workspace-id');
    const ctx = await getWorkspaceContext(supabase, user.id, wsId);
    if (!ctx) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

    // Get contact
    const { data: contact } = await supabase
      .from('contacts')
      .select('id, first_name, last_name, email, company_name, company_domain, linkedin_url, job_title, email_bounced, email_recovery_count, workspace_id')
      .eq('id', contactId)
      .eq('workspace_id', ctx.workspaceId)
      .maybeSingle();

    if (!contact) return NextResponse.json({ error: 'Contact not found' }, { status: 404 });

    // Rate limit: max 3 recovery attempts
    if ((contact.email_recovery_count || 0) >= 3) {
      return NextResponse.json({
        recovered: false,
        message: 'Maximum recovery attempts reached (3)',
      });
    }

    const failedEmail = contact.email;

    // Mark recovery as attempted
    await supabase
      .from('contacts')
      .update({
        email_recovery_attempted: true,
        email_recovery_count: (contact.email_recovery_count || 0) + 1,
      })
      .eq('id', contactId);

    // Get workspace's FullEnrich API key
    const serviceSupabase = getServiceSupabase();
    const { data: workspace } = await serviceSupabase
      .from('workspaces')
      .select('fullenrich_api_key_encrypted')
      .eq('id', ctx.workspaceId)
      .single();

    if (!workspace?.fullenrich_api_key_encrypted) {
      // Log failed recovery
      await supabase.from('contact_timeline').insert({
        contact_id: contactId,
        workspace_id: ctx.workspaceId,
        event_type: 'email_recovery_failed',
        title: 'Récupération email échouée',
        description: 'Pas de clé API FullEnrich configurée',
        metadata: { failed_email: failedEmail, reason: 'no_api_key' },
        created_by: user.id,
      });

      return NextResponse.json({
        recovered: false,
        message: 'FullEnrich API key not configured',
      });
    }

    const contactName = [contact.first_name, contact.last_name].filter(Boolean).join(' ');

    // Start FullEnrich enrichment
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL;
    const webhookUrl = `${appUrl}/api/webhooks/fullenrich`;

    let newEmail: string | null = null;
    let emailStatus: string | null = null;

    try {
      const enrichmentId = await startBulkEnrichment(
        workspace.fullenrich_api_key_encrypted,
        [{
          contact_id: contactId,
          workspace_id: ctx.workspaceId,
          firstname: contact.first_name || '',
          lastname: contact.last_name || '',
          domain: contact.company_domain || undefined,
          company_name: contact.company_name || undefined,
          linkedin_url: contact.linkedin_url || undefined,
        }],
        webhookUrl
      );

      // Poll for result (max 60 seconds)
      let attempts = 0;
      const maxAttempts = 12;
      while (attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        attempts++;

        try {
          const result = await getEnrichmentResult(workspace.fullenrich_api_key_encrypted, enrichmentId);

          if (result.status === 'FINISHED' || result.status === 'COMPLETED') {
            const data = result.datas?.[0];
            if (data?.contact?.most_probable_email && data.contact.most_probable_email !== failedEmail) {
              newEmail = data.contact.most_probable_email;
              emailStatus = data.contact.most_probable_email_status || null;
            }
            break;
          }
        } catch {
          // Continue polling
        }
      }
    } catch (enrichError) {
      console.error('FullEnrich recovery error:', enrichError);
    }

    if (newEmail) {
      // Update contact with new email
      await supabase
        .from('contacts')
        .update({
          email: newEmail,
          original_email: failedEmail,
          email_bounced: false,
          bounce_reason: null,
          email_verified_status: emailStatus || null,
          enriched_at: new Date().toISOString(),
          enrichment_source: 'fullenrich_recovery',
        })
        .eq('id', contactId);

      // Log recovery success
      await supabase.from('contact_timeline').insert({
        contact_id: contactId,
        workspace_id: ctx.workspaceId,
        event_type: 'email_recovered',
        title: 'Email récupéré avec succès',
        description: `${failedEmail} → ${newEmail} (${emailStatus || 'unknown'})`,
        metadata: {
          old_email: failedEmail,
          new_email: newEmail,
          email_status: emailStatus,
          source: 'fullenrich',
        },
        created_by: user.id,
      });

      // Try to auto-resend the last bounced email
      let resent = false;
      try {
        resent = await autoResendLastEmail(supabase, serviceSupabase, contactId, ctx.workspaceId, user.id, newEmail);
      } catch (resendError) {
        console.error('Auto-resend failed:', resendError);
      }

      return NextResponse.json({
        recovered: true,
        newEmail,
        emailStatus,
        resent,
        source: 'fullenrich',
      });
    }

    // Recovery failed
    await supabase.from('contact_timeline').insert({
      contact_id: contactId,
      workspace_id: ctx.workspaceId,
      event_type: 'email_recovery_failed',
      title: 'Récupération email échouée',
      description: `Aucun email valide trouvé pour ${contactName || failedEmail}`,
      metadata: {
        failed_email: failedEmail,
        attempts: (contact.email_recovery_count || 0) + 1,
      },
      created_by: user.id,
    });

    return NextResponse.json({
      recovered: false,
      message: 'No valid email found',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to recover email';
    console.error('Email recovery error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Auto-resend the last bounced email to the new address
 */
async function autoResendLastEmail(
  supabase: any,
  serviceSupabase: any,
  contactId: string,
  workspaceId: string,
  userId: string,
  newEmail: string,
): Promise<boolean> {
  // Find the last bounced email for this contact
  const { data: bouncedEmail } = await supabase
    .from('emails_sent')
    .select('id, subject, body, sent_by, sent_by_email')
    .eq('contact_id', contactId)
    .eq('workspace_id', workspaceId)
    .eq('status', 'bounced')
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!bouncedEmail) return false;

  // Get SMTP settings for the sender
  const senderId = bouncedEmail.sent_by || userId;
  const { data: settings } = await serviceSupabase
    .from('user_settings')
    .select('smtp_host, smtp_port, smtp_user, smtp_password_encrypted, display_name, bcc_enabled')
    .eq('user_id', senderId)
    .single();

  if (!settings?.smtp_host || !settings?.smtp_password_encrypted) return false;

  const result = await sendEmail(
    {
      host: settings.smtp_host,
      port: settings.smtp_port || 587,
      user: settings.smtp_user,
      passwordEncrypted: settings.smtp_password_encrypted,
      bccEnabled: settings.bcc_enabled,
    },
    {
      to: newEmail,
      subject: bouncedEmail.subject,
      html: bouncedEmail.body,
      from: settings.display_name || settings.smtp_user,
    }
  );

  if (result.success) {
    // Create new emails_sent record for the resend
    await supabase.from('emails_sent').insert({
      contact_id: contactId,
      workspace_id: workspaceId,
      subject: bouncedEmail.subject,
      body: bouncedEmail.body,
      status: 'sent',
      sent_at: new Date().toISOString(),
      sent_by: senderId,
      sent_by_email: settings.smtp_user,
      message_id: result.messageId,
    });

    // Timeline event for resend
    await supabase.from('contact_timeline').insert({
      contact_id: contactId,
      workspace_id: workspaceId,
      event_type: 'email_sent',
      title: 'Email renvoyé après récupération',
      description: `"${bouncedEmail.subject}" → ${newEmail}`,
      metadata: {
        original_bounced_email_id: bouncedEmail.id,
        new_email: newEmail,
        auto_resend: true,
      },
      created_by: senderId,
    });

    return true;
  }

  return false;
}
