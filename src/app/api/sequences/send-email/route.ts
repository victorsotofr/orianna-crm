import { NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';
import { sendEmail } from '@/lib/email-sender';
import { renderTemplate } from '@/lib/template-renderer';

export async function POST(request: Request) {
  try {
    // Validate service key
    const serviceKey = request.headers.get('x-service-key');
    if (!serviceKey || serviceKey !== process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      enrollment_id,
      contact,
      template,
      user_settings,
      sequence_id,
      step_order,
      variant,
      html_override,
    } = body;

    if (!contact?.email || !template || !user_settings) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Build template variables from contact data
    const variables: Record<string, string> = {
      first_name: contact.first_name || '',
      last_name: contact.last_name || '',
      email: contact.email || '',
      company_name: contact.company_name || '',
      company_domain: contact.company_domain || '',
      job_title: contact.job_title || '',
      industry: contact.industry || '',
    };

    // Render subject and body
    const renderedSubject = renderTemplate(template.subject || '', variables);
    const htmlContent = html_override || renderTemplate(template.html_content || '', variables);

    // Append signature if present
    const finalHtml = user_settings.signature_html
      ? `${htmlContent}<br/><br/>${user_settings.signature_html}`
      : htmlContent;

    // Send email via SMTP
    const result = await sendEmail(
      {
        host: user_settings.smtp_host,
        port: user_settings.smtp_port || 587,
        user: user_settings.smtp_user,
        passwordEncrypted: user_settings.smtp_password_encrypted,
      },
      {
        to: contact.email,
        subject: renderedSubject,
        html: finalHtml,
        from: user_settings.smtp_user,
      }
    );

    // Update email_stats with result
    const supabase = getServiceSupabase();
    if (enrollment_id) {
      const updateData: Record<string, any> = {};
      if (result.success) {
        updateData.message_id = result.messageId;
        updateData.sent_at = new Date().toISOString();
      } else {
        updateData.error = result.error;
      }

      // Find the email_stats row for this enrollment + step_order
      const { data: stat } = await supabase
        .from('email_stats')
        .select('id')
        .eq('enrollment_id', enrollment_id)
        .order('sent_at', { ascending: false })
        .limit(1)
        .single();

      if (stat) {
        await supabase
          .from('email_stats')
          .update(updateData)
          .eq('id', stat.id);
      }
    }

    if (result.success) {
      return NextResponse.json({ success: true, messageId: result.messageId });
    } else {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }
  } catch (error: any) {
    console.error('Send email error:', error);
    return NextResponse.json({ error: error.message || 'Failed to send email' }, { status: 500 });
  }
}
