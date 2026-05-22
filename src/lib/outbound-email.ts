import type { SupabaseClient } from '@supabase/supabase-js';

import { extractPlainText } from '@/lib/email-content';
import { persistOutboundMailboxMessage } from '@/lib/mailbox-store';
import { addressesFromStrings, type MailboxAddress } from '@/lib/mailbox-utils';

interface FinalizeSentEmailInput {
  supabase: SupabaseClient;
  workspaceId: string;
  userId: string;
  contactId: string | null;
  emailSentId: string;
  mailAccountId?: string | null;
  provider?: string | null;
  providerMessageId?: string | null;
  providerThreadId?: string | null;
  rawMessageId: string;
  subject: string;
  htmlBody: string;
  textBody?: string | null;
  to: string | string[];
  cc?: string[];
  bcc?: string[];
  from: MailboxAddress;
  sentAt?: string;
  threadId?: string | null;
  inReplyTo?: string | null;
  references?: string[];
  enrollmentId?: string | null;
  stepId?: string | null;
  metadata?: Record<string, unknown>;
}

export async function finalizeSentEmail({
  supabase,
  workspaceId,
  userId,
  contactId,
  emailSentId,
  mailAccountId,
  provider,
  providerMessageId,
  providerThreadId,
  rawMessageId,
  subject,
  htmlBody,
  textBody,
  to,
  cc,
  bcc,
  from,
  sentAt,
  threadId,
  inReplyTo,
  references,
  enrollmentId,
  stepId,
  metadata,
}: FinalizeSentEmailInput) {
  const timestamp = sentAt || new Date().toISOString();
  const updatePayload = {
    status: 'sent',
    message_id: rawMessageId,
    sent_at: timestamp,
    mail_account_id: mailAccountId || null,
    provider: provider || null,
    provider_message_id: providerMessageId || null,
    provider_thread_id: providerThreadId || null,
    sent_from_email: from.email,
  };

  let { error: updateError } = await supabase
    .from('emails_sent')
    .update(updatePayload)
    .eq('id', emailSentId);

  if ((updateError as { code?: string } | null)?.code === '42703') {
    const legacyPayload = { ...updatePayload };
    for (const key of ['mail_account_id', 'provider', 'provider_message_id', 'provider_thread_id', 'sent_from_email']) {
      delete legacyPayload[key as keyof typeof legacyPayload];
    }
    const legacy = await supabase
      .from('emails_sent')
      .update(legacyPayload)
      .eq('id', emailSentId);
    updateError = legacy.error;
  }

  if (updateError) throw updateError;

  return persistOutboundMailboxMessage({
    supabase,
    userId,
    workspaceId,
    contactId,
    emailSentId,
    mailAccountId,
    provider,
    providerMessageId,
    providerThreadId,
    threadId,
    internetMessageId: rawMessageId,
    inReplyTo,
    references,
    subject,
    from,
    to: addressesFromStrings(Array.isArray(to) ? to : [to]),
    cc: addressesFromStrings(cc || []),
    bcc: addressesFromStrings(bcc || []),
    textBody: extractPlainText(textBody, htmlBody),
    htmlBody,
    messageAt: timestamp,
    sentAt: timestamp,
    metadata,
  });
}
