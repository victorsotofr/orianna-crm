import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { sendEmail } from '@/lib/email-sender';
import { renderTemplate } from '@/lib/template-renderer';

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

    const body = await request.json();
    const { contactId, templateId, campaignId, templateVariables } = body;

    if (!contactId || !templateId) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    // GLOBAL deduplication: Check if ANYONE already sent this contact + template combo
    // This prevents double-sending across all users
    const { data: existingSend } = await supabase
      .from('emails_sent')
      .select('id, sent_by_email')
      .eq('contact_id', contactId)
      .eq('template_id', templateId)
      .single();

    if (existingSend) {
      return NextResponse.json({
        success: false,
        alreadySent: true,
        message: `Email already sent to this contact with this template${existingSend.sent_by_email ? ` by ${existingSend.sent_by_email}` : ''}`,
      });
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

    // Check daily send limit (per user, using sent_by instead of user_id)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { count: todayCount } = await supabase
      .from('emails_sent')
      .select('*', { count: 'exact', head: true })
      .eq('sent_by', user.id)
      .gte('sent_at', today.toISOString());

    if (todayCount && todayCount >= settings.daily_send_limit) {
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

    // Append signature (always present as it's required)
    // Note: Templates should NOT include a signature at the end
    // The signature from settings will be automatically appended
    const finalHtml = `${renderedHtml}\n\n${settings.signature_html}`;

    // Send email
    const emailResult = await sendEmail(
      {
        host: settings.smtp_host!,
        port: settings.smtp_port,
        user: settings.smtp_user!,
        passwordEncrypted: settings.smtp_password_encrypted,
      },
      {
        to: contact.email,
        subject: renderedSubject,
        html: finalHtml,
        from: settings.user_email || user.email || 'Email Automation',
      }
    );

    if (!emailResult.success) {
      // Record failed send with audit trail
      await supabase.from('emails_sent').insert({
        contact_id: contactId,
        campaign_id: campaignId,
        template_id: templateId,
        sent_by: user.id,
        sent_by_email: user.email,
        status: 'failed',
        error_message: emailResult.error,
      });

      return NextResponse.json(
        { error: emailResult.error, success: false },
        { status: 500 }
      );
    }

    // Record successful send with audit trail
    const { error: insertError } = await supabase.from('emails_sent').insert({
      contact_id: contactId,
      campaign_id: campaignId,
      template_id: templateId,
      sent_by: user.id,
      sent_by_email: user.email,
      status: 'sent',
      message_id: emailResult.messageId,
    });

    if (insertError) {
      console.error('Error recording email send:', insertError instanceof Error ? insertError.message : insertError);
    }

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

