import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { sendEmail, type EmailData } from '@/lib/email-sender';
import { sendGmailMessage } from '@/lib/gmail-mail';
import { sendMicrosoftMail } from '@/lib/outlook-mail';
import type { MailAccount } from '@/lib/mail-accounts';

export interface MailAccountSendResult {
  success: boolean;
  messageId?: string;
  providerMessageId?: string | null;
  providerThreadId?: string | null;
  error?: string;
}

export async function sendWithMailAccount(
  supabase: SupabaseClient,
  account: MailAccount,
  emailData: EmailData,
  options?: {
    threadId?: string | null;
  }
): Promise<MailAccountSendResult> {
  try {
    if (account.provider === 'gmail') {
      const sent = await sendGmailMessage({
        supabase,
        account,
        to: Array.isArray(emailData.to) ? emailData.to.join(', ') : emailData.to,
        subject: emailData.subject,
        html: emailData.html,
        text: emailData.text,
        inReplyTo: emailData.inReplyTo,
        references: emailData.references,
        threadId: options?.threadId,
      });
      return {
        success: true,
        messageId: sent.messageId,
        providerMessageId: sent.providerMessageId,
        providerThreadId: sent.providerThreadId,
      };
    }

    if (account.provider === 'outlook') {
      const sent = await sendMicrosoftMail({
        supabase,
        account,
        to: Array.isArray(emailData.to) ? emailData.to.join(', ') : emailData.to,
        subject: emailData.subject,
        html: emailData.html,
        text: emailData.text,
      });
      return {
        success: true,
        messageId: sent.messageId,
        providerMessageId: sent.providerMessageId,
        providerThreadId: sent.providerThreadId,
      };
    }

    if (!account.smtp_host || !account.smtp_user || !account.smtp_password_encrypted) {
      return { success: false, error: 'SMTP settings are missing for this mailbox.' };
    }

    return sendEmail(
      {
        host: account.smtp_host,
        port: account.smtp_port || 587,
        user: account.smtp_user,
        passwordEncrypted: account.smtp_password_encrypted,
        bccEnabled: account.bcc_enabled !== false,
      },
      emailData
    );
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send email',
    };
  }
}
