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

  const { error: updateError } = await supabase
    .from('emails_sent')
    .update({ status: 'sent', message_id: rawMessageId, sent_at: timestamp })
    .eq('id', emailSentId);

  if (updateError) throw updateError;

  return persistOutboundMailboxMessage({
    supabase,
    userId,
    workspaceId,
    contactId,
    emailSentId,
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
