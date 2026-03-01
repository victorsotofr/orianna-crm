import 'server-only';
import nodemailer from 'nodemailer';
import { getServiceSupabase } from '@/lib/supabase';

const ALERT_EMAIL = process.env.ALERT_EMAIL_TO || '';
const ALERT_SMTP_HOST = process.env.ALERT_SMTP_HOST || '';
const ALERT_SMTP_PORT = parseInt(process.env.ALERT_SMTP_PORT || '587');
const ALERT_SMTP_USER = process.env.ALERT_SMTP_USER || '';
const ALERT_SMTP_PASS = process.env.ALERT_SMTP_PASS || '';

const alertingConfigured = !!(ALERT_EMAIL && ALERT_SMTP_HOST && ALERT_SMTP_USER && ALERT_SMTP_PASS);

export async function reportError(
  route: string,
  errorMessage: string,
  details?: { workspaceId?: string; [key: string]: unknown }
) {
  // Log to DB
  try {
    const supabase = getServiceSupabase();
    await supabase.from('error_logs').insert({
      route,
      error_message: errorMessage,
      error_details: details || {},
      workspace_id: details?.workspaceId || null,
      notified: alertingConfigured,
    });
  } catch (e) {
    console.error('Failed to log error to DB:', e);
  }

  // Send email alert
  if (!alertingConfigured) return;

  try {
    const transport = nodemailer.createTransport({
      host: ALERT_SMTP_HOST,
      port: ALERT_SMTP_PORT,
      secure: ALERT_SMTP_PORT === 465,
      auth: { user: ALERT_SMTP_USER, pass: ALERT_SMTP_PASS },
    });

    await transport.sendMail({
      from: ALERT_SMTP_USER,
      to: ALERT_EMAIL,
      subject: `[Orianna] Error in ${route}`,
      html: `
        <h3>Error in <code>${route}</code></h3>
        <p><strong>Message:</strong> ${errorMessage}</p>
        <p><strong>Time:</strong> ${new Date().toISOString()}</p>
        ${details?.workspaceId ? `<p><strong>Workspace:</strong> ${details.workspaceId}</p>` : ''}
        ${details ? `<pre>${JSON.stringify(details, null, 2)}</pre>` : ''}
      `,
    });
  } catch (e) {
    console.error('Failed to send error alert email:', e);
  }
}
