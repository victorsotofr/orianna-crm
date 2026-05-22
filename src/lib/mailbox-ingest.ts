import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { createMessageSnippet, detectAutoReply, detectBounce, normalizeEmail, normalizeMessageId, type MailboxAddress } from '@/lib/mailbox-utils';
import { persistInboundMailboxMessage } from '@/lib/mailbox-store';
import { notifyBounce, notifyReply } from '@/lib/telegram-notifications';

export interface SentEmailRow {
  id: string;
  contact_id: string;
  workspace_id: string | null;
  enrollment_id: string | null;
  step_id: string | null;
  message_id: string | null;
  replied_at: string | null;
}

export interface ContactMatch {
  id: string;
  workspace_id: string | null;
  email: string | null;
}

export interface NormalizedInboundMessage {
  userId: string;
  mailAccountId?: string | null;
  provider?: string | null;
  providerMessageId?: string | null;
  providerThreadId?: string | null;
  providerLabelIds?: string[];
  internetMessageId: string;
  inReplyTo?: string | null;
  references?: string[];
  subject?: string | null;
  from: MailboxAddress;
  to: MailboxAddress[];
  cc?: MailboxAddress[];
  textBody?: string | null;
  htmlBody?: string | null;
  messageAt: string;
  receivedAt?: string | null;
  folder?: string | null;
  imapUid?: number | null;
  selfEmails?: string[];
  metadata?: Record<string, unknown>;
}

export interface IngestInboundResult {
  stored: boolean;
  replyDetected: boolean;
  bounceDetected: boolean;
  threadId?: string;
  mailboxMessageId?: string;
  detectedBounce?: {
    contactId: string;
    workspaceId: string;
    failedEmail: string;
    bounceReason: string;
    isHardBounce: boolean;
    emailSentId?: string;
  };
}

export async function getSentEmailLookup(supabase: SupabaseClient, userId: string): Promise<Map<string, SentEmailRow>> {
  const since = new Date();
  since.setDate(since.getDate() - 365);

  const { data, error } = await supabase
    .from('emails_sent')
    .select('id, contact_id, workspace_id, enrollment_id, step_id, message_id, replied_at')
    .eq('sent_by', userId)
    .not('message_id', 'is', null)
    .gte('sent_at', since.toISOString());

  if (error) throw error;

  const lookup = new Map<string, SentEmailRow>();
  for (const row of (data || []) as SentEmailRow[]) {
    const normalized = normalizeMessageId(row.message_id);
    if (normalized) lookup.set(normalized, row);
  }
  return lookup;
}

async function getPrimaryWorkspace(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();
  return data?.workspace_id || null;
}

export async function findContactByEmail(
  supabase: SupabaseClient,
  userId: string,
  email: string,
  cache?: Map<string, ContactMatch | null>
): Promise<ContactMatch | null> {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  if (cache?.has(normalized)) return cache.get(normalized) || null;

  const { data: aliasRows, error: aliasError } = await supabase
    .from('contact_email_addresses')
    .select('contact_id, workspace_id, email')
    .eq('normalized_email', normalized)
    .limit(1);

  if (aliasError && aliasError.code !== '42P01' && aliasError.code !== '42703') throw aliasError;
  const alias = aliasRows?.[0];
  if (alias?.contact_id && alias.workspace_id) {
    const match = { id: alias.contact_id, workspace_id: alias.workspace_id, email: alias.email || normalized };
    cache?.set(normalized, match);
    return match;
  }

  const { data, error } = await supabase
    .from('contacts')
    .select('id, workspace_id, email')
    .eq('assigned_to', userId)
    .ilike('email', normalized)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  const match = (data as ContactMatch | null) || null;
  cache?.set(normalized, match);
  return match;
}

export async function registerContactEmailAddress(
  supabase: SupabaseClient,
  input: {
    workspaceId: string;
    contactId: string;
    email: string;
    kind: 'primary' | 'alias' | 'reply_to' | 'discovered';
    source: string;
    confidence?: number | null;
  }
) {
  const normalized = normalizeEmail(input.email);
  if (!normalized) return;

  const { data: existing, error: selectError } = await supabase
    .from('contact_email_addresses')
    .select('id, contact_id')
    .eq('workspace_id', input.workspaceId)
    .eq('normalized_email', normalized)
    .maybeSingle();

  if (selectError && selectError.code !== '42P01') throw selectError;

  if (existing?.id) {
    if (existing.contact_id !== input.contactId) return;
    const { error } = await supabase
      .from('contact_email_addresses')
      .update({
        kind: input.kind,
        source: input.source,
        confidence: input.confidence ?? null,
        last_seen_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id);
    if (error) throw error;
    return;
  }

  const { error } = await supabase.from('contact_email_addresses').insert({
    workspace_id: input.workspaceId,
    contact_id: input.contactId,
    email: input.email,
    normalized_email: normalized,
    kind: input.kind,
    source: input.source,
    confidence: input.confidence ?? null,
  });
  if (error && error.code !== '23505' && error.code !== '42P01') throw error;
}

async function markEmailReplied(
  supabase: SupabaseClient,
  {
    email,
    repliedAt,
    threadId,
    mailboxMessageId,
    snippet,
    isAutoReply,
  }: {
    email: SentEmailRow;
    repliedAt: string;
    threadId: string;
    mailboxMessageId: string;
    snippet: string;
    isAutoReply: boolean;
  }
) {
  const { error: updateError } = await supabase
    .from('emails_sent')
    .update({ status: 'replied', replied_at: repliedAt })
    .eq('id', email.id)
    .is('replied_at', null);

  if (updateError) throw updateError;

  const { error: contactError } = await supabase
    .from('contacts')
    .update({ status: 'engaged', replied_at: repliedAt })
    .eq('id', email.contact_id)
    .in('status', ['new', 'contacted']);

  if (contactError) throw contactError;

  const { error: enrollmentError } = await supabase
    .from('campaign_enrollments')
    .update({ status: 'completed', completed_at: repliedAt })
    .eq('contact_id', email.contact_id)
    .eq('status', 'active');

  if (enrollmentError) throw enrollmentError;

  const { error: timelineError } = await supabase.from('contact_timeline').insert({
    contact_id: email.contact_id,
    workspace_id: email.workspace_id,
    event_type: 'replied',
    title: isAutoReply ? 'Réponse automatique détectée' : 'Réponse détectée',
    description: snippet || 'Le contact a répondu à un email',
    metadata: {
      emails_sent_id: email.id,
      thread_id: threadId,
      mailbox_message_id: mailboxMessageId,
      auto_reply: isAutoReply,
    },
  });

  if (timelineError) throw timelineError;
}

async function markEmailBounced(
  supabase: SupabaseClient,
  {
    contactId,
    workspaceId,
    failedEmail,
    bounceReason,
    isHardBounce,
    emailSentId,
    threadId,
    mailboxMessageId,
  }: {
    contactId: string;
    workspaceId: string;
    failedEmail: string;
    bounceReason: string;
    isHardBounce: boolean;
    emailSentId?: string;
    threadId: string;
    mailboxMessageId: string;
  }
) {
  await supabase
    .from('contacts')
    .update({
      email_bounced: true,
      bounce_reason: bounceReason,
      bounced_at: new Date().toISOString(),
    })
    .eq('id', contactId);

  if (emailSentId) {
    await supabase
      .from('emails_sent')
      .update({ status: 'bounced', error_message: `Bounce: ${bounceReason}` })
      .eq('id', emailSentId);
  }

  if (isHardBounce) {
    await supabase
      .from('campaign_enrollments')
      .update({ status: 'bounced' })
      .eq('contact_id', contactId)
      .eq('status', 'active');
  }

  await supabase.from('contact_timeline').insert({
    contact_id: contactId,
    workspace_id: workspaceId,
    event_type: isHardBounce ? 'email_bounced' : 'email_soft_bounce',
    title: isHardBounce ? 'Email bounce détecté' : 'Bounce temporaire détecté',
    description: `${failedEmail} — ${bounceReason}`,
    metadata: {
      failed_email: failedEmail,
      bounce_reason: bounceReason,
      is_hard_bounce: isHardBounce,
      emails_sent_id: emailSentId || null,
      thread_id: threadId,
      mailbox_message_id: mailboxMessageId,
    },
  });
}

export async function ingestInboundMailboxMessage(
  supabase: SupabaseClient,
  message: NormalizedInboundMessage,
  options?: {
    sentEmailLookup?: Map<string, SentEmailRow>;
    contactCache?: Map<string, ContactMatch | null>;
  }
): Promise<IngestInboundResult> {
  const senderEmail = normalizeEmail(message.from.email);
  if (!senderEmail) return { stored: false, replyDetected: false, bounceDetected: false };
  if ((message.selfEmails || []).map((value) => normalizeEmail(value)).includes(senderEmail)) {
    return { stored: false, replyDetected: false, bounceDetected: false };
  }

  const references = Array.from(
    new Set(
      [message.inReplyTo, ...(message.references || [])]
        .map((value) => normalizeMessageId(value))
        .filter((value): value is string => Boolean(value))
    )
  );
  const sentLookup = options?.sentEmailLookup || await getSentEmailLookup(supabase, message.userId);
  const matchedSentEmail = references
    .map((reference) => sentLookup.get(reference))
    .find((entry): entry is SentEmailRow => Boolean(entry));

  let workspaceId = matchedSentEmail?.workspace_id || null;
  let contactId = matchedSentEmail?.contact_id || null;

  if (!workspaceId || !contactId) {
    const matchedContact = await findContactByEmail(supabase, message.userId, senderEmail, options?.contactCache);
    workspaceId = workspaceId || matchedContact?.workspace_id || null;
    contactId = contactId || matchedContact?.id || null;
  }

  const plainText = message.textBody || '';
  const isAutoReply = detectAutoReply(message.subject, {}, plainText);
  const bounceResult = detectBounce(message.subject, senderEmail, plainText, {});
  if (!workspaceId && bounceResult.isBounce) {
    workspaceId = await getPrimaryWorkspace(supabase, message.userId);
  }

  if (!workspaceId) return { stored: false, replyDetected: false, bounceDetected: false };

  const persisted = await persistInboundMailboxMessage({
    supabase,
    userId: message.userId,
    workspaceId,
    contactId,
    emailSentId: matchedSentEmail?.id || null,
    mailAccountId: message.mailAccountId || null,
    provider: message.provider || null,
    providerMessageId: message.providerMessageId || null,
    providerThreadId: message.providerThreadId || null,
    providerLabelIds: message.providerLabelIds || [],
    internetMessageId: message.internetMessageId,
    inReplyTo: message.inReplyTo || null,
    references,
    subject: message.subject || null,
    from: message.from,
    to: message.to,
    cc: message.cc || [],
    textBody: plainText,
    htmlBody: message.htmlBody || null,
    messageAt: message.messageAt,
    receivedAt: message.receivedAt || message.messageAt,
    folder: message.folder || 'INBOX',
    imapUid: message.imapUid || null,
    isAutoReply,
    metadata: message.metadata || {},
  });

  if (!persisted.created) {
    return {
      stored: false,
      replyDetected: false,
      bounceDetected: false,
      threadId: persisted.threadId,
      mailboxMessageId: persisted.messageId,
    };
  }

  if (contactId && workspaceId) {
    await registerContactEmailAddress(supabase, {
      workspaceId,
      contactId,
      email: senderEmail,
      kind: matchedSentEmail ? 'reply_to' : 'discovered',
      source: message.provider ? `${message.provider}_inbound` : 'mailbox_inbound',
      confidence: matchedSentEmail ? 1 : 0.7,
    });
  }

  if (bounceResult.isBounce) {
    let bounceContactId = contactId;
    let bounceWorkspaceId = workspaceId;
    let bounceEmailSentId = matchedSentEmail?.id;

    if (bounceResult.originalRecipient) {
      const bouncedContact = await findContactByEmail(supabase, message.userId, bounceResult.originalRecipient, options?.contactCache);
      if (bouncedContact) {
        bounceContactId = bouncedContact.id;
        bounceWorkspaceId = bouncedContact.workspace_id || workspaceId;
      }

      if (!bounceEmailSentId && bounceContactId) {
        const { data: sentEmail } = await supabase
          .from('emails_sent')
          .select('id')
          .eq('contact_id', bounceContactId)
          .in('status', ['sent', 'pending'])
          .order('sent_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        bounceEmailSentId = sentEmail?.id;
      }
    }

    if (bounceContactId && bounceWorkspaceId) {
      await markEmailBounced(supabase, {
        contactId: bounceContactId,
        workspaceId: bounceWorkspaceId,
        failedEmail: bounceResult.originalRecipient || 'unknown',
        bounceReason: bounceResult.bounceReason || 'Unknown bounce',
        isHardBounce: bounceResult.isHardBounce,
        emailSentId: bounceEmailSentId,
        threadId: persisted.threadId,
        mailboxMessageId: persisted.messageId,
      });
      notifyBounce(message.userId, bounceResult.originalRecipient || 'unknown', bounceResult.originalRecipient || '', bounceResult.bounceReason || 'Email bounced').catch(() => {});

      return {
        stored: true,
        replyDetected: false,
        bounceDetected: true,
        threadId: persisted.threadId,
        mailboxMessageId: persisted.messageId,
        detectedBounce: {
          contactId: bounceContactId,
          workspaceId: bounceWorkspaceId,
          failedEmail: bounceResult.originalRecipient || 'unknown',
          bounceReason: bounceResult.bounceReason || 'Unknown bounce',
          isHardBounce: bounceResult.isHardBounce,
          emailSentId: bounceEmailSentId,
        },
      };
    }
  }

  if (matchedSentEmail && !matchedSentEmail.replied_at) {
    const snippet = createMessageSnippet(plainText, message.htmlBody);
    await markEmailReplied(supabase, {
      email: matchedSentEmail,
      repliedAt: message.receivedAt || message.messageAt,
      threadId: persisted.threadId,
      mailboxMessageId: persisted.messageId,
      snippet,
      isAutoReply,
    });
    matchedSentEmail.replied_at = message.receivedAt || message.messageAt;
    notifyReply(message.userId, senderEmail, message.subject || '(no subject)', snippet || '').catch(() => {});
    return {
      stored: true,
      replyDetected: true,
      bounceDetected: false,
      threadId: persisted.threadId,
      mailboxMessageId: persisted.messageId,
    };
  }

  if (contactId) {
    const { error } = await supabase.from('contact_timeline').insert({
      contact_id: contactId,
      workspace_id: workspaceId,
      event_type: 'incoming_email',
      title: isAutoReply ? 'Réponse automatique reçue' : 'Email entrant',
      description: createMessageSnippet(plainText, message.htmlBody) || 'Nouveau message reçu',
      metadata: {
        thread_id: persisted.threadId,
        mailbox_message_id: persisted.messageId,
        auto_reply: isAutoReply,
        mail_account_id: message.mailAccountId || null,
        provider: message.provider || null,
      },
    });
    if (error) throw error;
  }

  return {
    stored: true,
    replyDetected: false,
    bounceDetected: false,
    threadId: persisted.threadId,
    mailboxMessageId: persisted.messageId,
  };
}
