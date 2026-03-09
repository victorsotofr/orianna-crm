import type { SupabaseClient } from '@supabase/supabase-js';
import type { MailboxAddress } from '@/lib/mailbox-utils';
import {
  buildParticipantList,
  createMessageSnippet,
  normalizeMessageId,
  normalizeThreadSubject,
} from '@/lib/mailbox-utils';

interface ThreadRow {
  id: string;
  contact_id: string | null;
  subject: string | null;
  subject_normalized: string | null;
  unread_count: number | null;
  participants: unknown;
}

interface BaseMessageInput {
  supabase: SupabaseClient;
  userId: string;
  workspaceId: string;
  contactId?: string | null;
  emailSentId?: string | null;
  threadId?: string | null;
  internetMessageId: string;
  inReplyTo?: string | null;
  references?: string[];
  subject?: string | null;
  from: MailboxAddress;
  to: MailboxAddress[];
  cc?: MailboxAddress[];
  bcc?: MailboxAddress[];
  textBody?: string | null;
  htmlBody?: string | null;
  messageAt: string;
  sentAt?: string | null;
  receivedAt?: string | null;
  folder?: string | null;
  imapUid?: number | null;
  isAutoReply?: boolean;
  metadata?: Record<string, unknown>;
}

interface PersistResult {
  threadId: string;
  messageId: string;
  created: boolean;
}

interface MessageRow {
  id: string;
  thread_id: string;
}

function parseParticipants(value: unknown): MailboxAddress[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const maybeEntry = entry as { email?: unknown; name?: unknown };
      if (typeof maybeEntry.email !== 'string') return null;
      return {
        email: maybeEntry.email,
        name: typeof maybeEntry.name === 'string' ? maybeEntry.name : null,
      } satisfies MailboxAddress;
    })
    .filter((entry): entry is MailboxAddress => Boolean(entry));
}

async function getThreadById(supabase: SupabaseClient, threadId: string): Promise<ThreadRow | null> {
  const { data, error } = await supabase
    .from('mailbox_threads')
    .select('id, contact_id, subject, subject_normalized, unread_count, participants')
    .eq('id', threadId)
    .maybeSingle();

  if (error) throw error;
  return (data as ThreadRow | null) || null;
}

async function findThreadByMessageIds(
  supabase: SupabaseClient,
  userId: string,
  messageIds: string[]
): Promise<ThreadRow | null> {
  const normalizedIds = Array.from(
    new Set(
      messageIds
        .map((value) => normalizeMessageId(value))
        .filter((value): value is string => Boolean(value))
    )
  );

  if (normalizedIds.length === 0) return null;

  const { data, error } = await supabase
    .from('mailbox_messages')
    .select('thread_id')
    .eq('user_id', userId)
    .in('internet_message_id', normalizedIds)
    .order('message_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data?.thread_id) return null;
  return getThreadById(supabase, data.thread_id);
}

async function findThreadByContactAndSubject(
  supabase: SupabaseClient,
  userId: string,
  workspaceId: string,
  contactId: string | null | undefined,
  subject: string | null | undefined
): Promise<ThreadRow | null> {
  const normalizedSubject = normalizeThreadSubject(subject);
  if (!contactId || !normalizedSubject) return null;

  const { data, error } = await supabase
    .from('mailbox_threads')
    .select('id, contact_id, subject, subject_normalized, unread_count, participants')
    .eq('user_id', userId)
    .eq('workspace_id', workspaceId)
    .eq('contact_id', contactId)
    .eq('subject_normalized', normalizedSubject)
    .order('last_message_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data as ThreadRow | null) || null;
}

async function createThread(
  supabase: SupabaseClient,
  {
    workspaceId,
    userId,
    contactId,
    subject,
    participants,
    messageAt,
  }: {
    workspaceId: string;
    userId: string;
    contactId?: string | null;
    subject?: string | null;
    participants: MailboxAddress[];
    messageAt: string;
  }
): Promise<ThreadRow> {
  const { data, error } = await supabase
    .from('mailbox_threads')
    .insert({
      workspace_id: workspaceId,
      user_id: userId,
      contact_id: contactId || null,
      subject: subject || null,
      subject_normalized: normalizeThreadSubject(subject) || null,
      snippet: '',
      unread_count: 0,
      last_message_at: messageAt,
      participants,
      updated_at: messageAt,
    })
    .select('id, contact_id, subject, subject_normalized, unread_count, participants')
    .single();

  if (error || !data) {
    throw error || new Error('Failed to create mailbox thread');
  }

  return data as ThreadRow;
}

async function resolveThread(
  supabase: SupabaseClient,
  {
    threadId,
    userId,
    workspaceId,
    contactId,
    subject,
    references,
    participants,
    messageAt,
  }: {
    threadId?: string | null;
    userId: string;
    workspaceId: string;
    contactId?: string | null;
    subject?: string | null;
    references: string[];
    participants: MailboxAddress[];
    messageAt: string;
  }
): Promise<ThreadRow> {
  if (threadId) {
    const existing = await getThreadById(supabase, threadId);
    if (existing) return existing;
  }

  const byReference = await findThreadByMessageIds(supabase, userId, references);
  if (byReference) return byReference;

  const bySubject = await findThreadByContactAndSubject(supabase, userId, workspaceId, contactId, subject);
  if (bySubject) return bySubject;

  return createThread(supabase, {
    workspaceId,
    userId,
    contactId,
    subject,
    participants,
    messageAt,
  });
}

async function insertMailboxMessage(
  supabase: SupabaseClient,
  payload: Record<string, unknown>,
  internetMessageId: string,
  userId: string
): Promise<MessageRow & { created: boolean }> {
  const { data, error } = await supabase
    .from('mailbox_messages')
    .insert(payload)
    .select('id, thread_id')
    .single();

  if (!error && data) {
    return { ...(data as MessageRow), created: true };
  }

  if ((error as { code?: string } | null)?.code !== '23505') {
    throw error;
  }

  const { data: existing, error: existingError } = await supabase
    .from('mailbox_messages')
    .select('id, thread_id')
    .eq('user_id', userId)
    .eq('internet_message_id', internetMessageId)
    .maybeSingle();

  if (existingError || !existing) {
    throw existingError || new Error('Failed to fetch existing mailbox message');
  }

  return { ...(existing as MessageRow), created: false };
}

async function updateThreadSnapshot(
  supabase: SupabaseClient,
  thread: ThreadRow,
  {
    direction,
    messageId,
    messageAt,
    subject,
    contactId,
    participants,
    snippet,
  }: {
    direction: 'inbound' | 'outbound';
    messageId: string;
    messageAt: string;
    subject?: string | null;
    contactId?: string | null;
    participants: MailboxAddress[];
    snippet: string;
  }
) {
  const mergedParticipants = buildParticipantList(parseParticipants(thread.participants), participants);
  const unreadCount = direction === 'inbound' ? (thread.unread_count || 0) + 1 : thread.unread_count || 0;

  const { error } = await supabase
    .from('mailbox_threads')
    .update({
      contact_id: thread.contact_id || contactId || null,
      subject: thread.subject || subject || null,
      subject_normalized: thread.subject_normalized || normalizeThreadSubject(subject) || null,
      snippet,
      unread_count: unreadCount,
      last_message_id: messageId,
      last_message_at: messageAt,
      last_message_direction: direction,
      participants: mergedParticipants,
      updated_at: new Date().toISOString(),
    })
    .eq('id', thread.id);

  if (error) throw error;
}

async function persistMailboxMessage(
  {
    supabase,
    userId,
    workspaceId,
    contactId,
    emailSentId,
    threadId,
    internetMessageId,
    inReplyTo,
    references,
    subject,
    from,
    to,
    cc,
    bcc,
    textBody,
    htmlBody,
    messageAt,
    sentAt,
    receivedAt,
    folder,
    imapUid,
    isAutoReply,
    metadata,
  }: BaseMessageInput,
  direction: 'inbound' | 'outbound'
): Promise<PersistResult> {
  const normalizedMessageId = normalizeMessageId(internetMessageId);
  if (!normalizedMessageId) {
    throw new Error('internetMessageId is required');
  }

  const normalizedReferences = Array.from(
    new Set(
      [inReplyTo, ...(references || [])]
        .map((value) => normalizeMessageId(value))
        .filter((value): value is string => Boolean(value))
    )
  );

  const participants = buildParticipantList([from], to, cc || [], bcc || []);
  const thread = await resolveThread(supabase, {
    threadId,
    userId,
    workspaceId,
    contactId,
    subject,
    references: normalizedReferences,
    participants,
    messageAt,
  });

  const snippet = createMessageSnippet(textBody, htmlBody);
  const messagePayload = {
    thread_id: thread.id,
    workspace_id: workspaceId,
    user_id: userId,
    contact_id: contactId || thread.contact_id || null,
    email_sent_id: emailSentId || null,
    direction,
    internet_message_id: normalizedMessageId,
    in_reply_to: normalizeMessageId(inReplyTo) || null,
    references: normalizedReferences,
    subject: subject || null,
    from_name: from.name,
    from_email: from.email,
    to_emails: to,
    cc_emails: cc || [],
    bcc_emails: bcc || [],
    text_body: textBody || null,
    html_body: htmlBody || null,
    snippet,
    message_at: messageAt,
    sent_at: sentAt || null,
    received_at: receivedAt || null,
    folder: folder || null,
    imap_uid: imapUid || null,
    is_auto_reply: Boolean(isAutoReply),
    metadata: metadata || {},
    updated_at: new Date().toISOString(),
  };

  const inserted = await insertMailboxMessage(supabase, messagePayload, normalizedMessageId, userId);

  if (inserted.created) {
    await updateThreadSnapshot(supabase, thread, {
      direction,
      messageId: inserted.id,
      messageAt,
      subject,
      contactId,
      participants,
      snippet,
    });
  }

  return {
    threadId: inserted.thread_id,
    messageId: inserted.id,
    created: inserted.created,
  };
}

export async function persistOutboundMailboxMessage(input: BaseMessageInput): Promise<PersistResult> {
  return persistMailboxMessage(input, 'outbound');
}

export async function persistInboundMailboxMessage(input: BaseMessageInput): Promise<PersistResult> {
  return persistMailboxMessage(input, 'inbound');
}
