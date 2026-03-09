import 'server-only';

import { ImapFlow, type MessageStructureObject } from 'imapflow';
import type { SupabaseClient } from '@supabase/supabase-js';

import { extractReplyText } from '@/lib/email-content';
import { decrypt } from '@/lib/encryption';
import { persistInboundMailboxMessage } from '@/lib/mailbox-store';
import {
  addressesFromEnvelope,
  createMessageSnippet,
  detectAutoReply,
  extractPrimaryEmail,
  formatMessageId,
  normalizeEmail,
  normalizeMessageId,
  parseHeadersBuffer,
  parseMessageIdHeader,
  type MailboxAddress,
} from '@/lib/mailbox-utils';

export interface MailboxSyncUserSettings {
  user_id: string;
  user_email: string | null;
  smtp_user: string | null;
  imap_host: string | null;
  imap_port: number | null;
  imap_user: string | null;
  imap_password_encrypted: string | null;
}

export interface MailboxSyncResult {
  userId: string;
  scanned: number;
  stored: number;
  repliesDetected: number;
  lastSeenUid: number;
}

interface SentEmailRow {
  id: string;
  contact_id: string;
  workspace_id: string | null;
  enrollment_id: string | null;
  step_id: string | null;
  message_id: string | null;
  replied_at: string | null;
}

interface ContactMatch {
  id: string;
  workspace_id: string | null;
  email: string | null;
}

function pickPreferredParts(node?: MessageStructureObject | null): { textPart?: string; htmlPart?: string } {
  if (!node) return {};

  const plain: string[] = [];
  const html: string[] = [];

  const walk = (current: MessageStructureObject) => {
    if (current.childNodes?.length) {
      for (const child of current.childNodes) {
        walk(child);
      }
      return;
    }

    const contentType = current.type?.toLowerCase();
    if (current.disposition === 'attachment') return;

    const part = current.part || '1';
    if (contentType === 'text/plain') plain.push(part);
    if (contentType === 'text/html') html.push(part);
  };

  walk(node);

  return {
    textPart: plain[0],
    htmlPart: html[0],
  };
}

async function streamToString(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8').trim();
}

async function downloadPartAsString(client: ImapFlow, uid: number, part?: string): Promise<string | null> {
  if (!part) return null;
  const { content } = await client.download(uid, part, { uid: true, maxBytes: 512 * 1024 });
  return streamToString(content);
}

async function getSyncState(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from('mailbox_sync_state')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function upsertSyncState(
  supabase: SupabaseClient,
  {
    userId,
    folder,
    uidValidity,
    lastSeenUid,
    lastError,
  }: {
    userId: string;
    folder: string;
    uidValidity?: bigint | number | null;
    lastSeenUid: number;
    lastError?: string | null;
  }
) {
  const { error } = await supabase
    .from('mailbox_sync_state')
    .upsert(
      {
        user_id: userId,
        folder,
        uid_validity: uidValidity != null ? String(uidValidity) : null,
        last_seen_uid: lastSeenUid,
        last_synced_at: new Date().toISOString(),
        last_error: lastError || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );

  if (error) throw error;
}

async function getSentEmailLookup(supabase: SupabaseClient, userId: string): Promise<Map<string, SentEmailRow>> {
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

async function findContactBySender(
  supabase: SupabaseClient,
  userId: string,
  senderEmail: string,
  cache: Map<string, ContactMatch | null>
): Promise<ContactMatch | null> {
  if (cache.has(senderEmail)) return cache.get(senderEmail) || null;

  const { data, error } = await supabase
    .from('contacts')
    .select('id, workspace_id, email')
    .eq('assigned_to', userId)
    .ilike('email', senderEmail)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  const match = (data as ContactMatch | null) || null;
  cache.set(senderEmail, match);
  return match;
}

async function markEmailReplied(
  supabase: SupabaseClient,
  {
    email,
    workspaceId,
    repliedAt,
    threadId,
    mailboxMessageId,
    snippet,
    isAutoReply,
  }: {
    email: SentEmailRow;
    workspaceId: string;
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

function buildMailboxIdentitySet(settings: MailboxSyncUserSettings): Set<string> {
  return new Set(
    [settings.user_email, settings.smtp_user, settings.imap_user]
      .map((value) => normalizeEmail(value))
      .filter((value): value is string => Boolean(value))
  );
}

export async function syncMailboxForUser(
  supabase: SupabaseClient,
  settings: MailboxSyncUserSettings
): Promise<MailboxSyncResult> {
  if (!settings.imap_host || !settings.imap_user || !settings.imap_password_encrypted) {
    throw new Error('IMAP is not configured for this user');
  }

  const password = decrypt(settings.imap_password_encrypted);
  if (!password) {
    throw new Error('Failed to decrypt IMAP password');
  }

  const client = new ImapFlow({
    host: settings.imap_host,
    port: settings.imap_port || 993,
    secure: (settings.imap_port || 993) === 993,
    doSTARTTLS: (settings.imap_port || 993) === 143 ? true : undefined,
    auth: {
      user: settings.imap_user,
      pass: password,
    },
    tls: {
      rejectUnauthorized: true,
      minVersion: 'TLSv1.2',
    },
    greetingTimeout: 15000,
    socketTimeout: 30000,
    logger: false,
  });

  const selfEmails = buildMailboxIdentitySet(settings);
  const sentEmailLookup = await getSentEmailLookup(supabase, settings.user_id);
  const contactCache = new Map<string, ContactMatch | null>();

  let scanned = 0;
  let stored = 0;
  let repliesDetected = 0;
  let lastSeenUid = 0;

  try {
    await client.connect();
    const mailbox = await client.mailboxOpen('INBOX', { readOnly: true });
    const syncState = await getSyncState(supabase, settings.user_id);

    const uidValidityChanged =
      syncState?.uid_validity != null &&
      mailbox.uidValidity != null &&
      String(syncState.uid_validity) !== String(mailbox.uidValidity);

    const initialStartUid =
      uidValidityChanged || !syncState
        ? Math.max(1, mailbox.uidNext - Math.min(mailbox.exists || 0, 200))
        : Number(syncState.last_seen_uid || 0) + 1;

    lastSeenUid = Math.max(Number(syncState?.last_seen_uid || 0), initialStartUid - 1);

    if (!mailbox.exists || initialStartUid >= mailbox.uidNext) {
      await upsertSyncState(supabase, {
        userId: settings.user_id,
        folder: 'INBOX',
        uidValidity: mailbox.uidValidity,
        lastSeenUid,
        lastError: null,
      });

      await client.logout();
      return {
        userId: settings.user_id,
        scanned,
        stored,
        repliesDetected,
        lastSeenUid,
      };
    }

    const messages = client.fetch(
      `${initialStartUid}:*`,
      {
        uid: true,
        envelope: true,
        bodyStructure: true,
        internalDate: true,
        flags: true,
        headers: [
          'message-id',
          'in-reply-to',
          'references',
          'auto-submitted',
          'precedence',
          'x-autoreply',
          'x-autorespond',
          'x-auto-response-suppress',
        ],
      },
      { uid: true }
    );

    console.log('[mailbox-sync] Starting scan from UID', initialStartUid, 'to', mailbox.uidNext, '| mailbox.exists:', mailbox.exists);

    // Phase 1: scan headers and collect matched messages (no body downloads during fetch loop)
    interface MatchedMessage {
      uid: number;
      incomingMessageId: string;
      from: MailboxAddress[];
      to: MailboxAddress[];
      cc: MailboxAddress[];
      senderEmail: string;
      inReplyTo: string | null;
      references: string[];
      matchedSentEmail: SentEmailRow | undefined;
      workspaceId: string;
      contactId: string | null;
      subject: string | null;
      receivedAt: string;
      isAutoReply: boolean;
      flags: string[];
      textPart?: string;
      htmlPart?: string;
    }

    const matchedMessages: MatchedMessage[] = [];

    for await (const message of messages) {
      scanned++;
      lastSeenUid = Math.max(lastSeenUid, message.uid);

      const headers = parseHeadersBuffer(message.headers);
      const incomingMessageId =
        normalizeMessageId(headers['message-id']) ||
        normalizeMessageId(message.envelope?.messageId) ||
        `imap-${settings.user_id}-${message.uid}`;

      const from = addressesFromEnvelope(message.envelope?.from);
      const to = addressesFromEnvelope(message.envelope?.to);
      const cc = addressesFromEnvelope(message.envelope?.cc);
      const senderEmail = extractPrimaryEmail(from);

      console.log(`[mailbox-sync] UID=${message.uid} from=${senderEmail} subject="${message.envelope?.subject}" msgId=${incomingMessageId}`);

      if (!senderEmail || selfEmails.has(senderEmail)) {
        console.log(`[mailbox-sync] UID=${message.uid} SKIPPED: self-email`);
        continue;
      }

      const inReplyTo =
        parseMessageIdHeader(headers['in-reply-to'] || message.envelope?.inReplyTo || '')[0] || null;
      const msgReferences = Array.from(
        new Set([
          ...(inReplyTo ? [inReplyTo] : []),
          ...parseMessageIdHeader(headers['references'] || ''),
        ])
      );

      const matchedSentEmail = msgReferences
        .map((reference) => sentEmailLookup.get(reference))
        .find((entry): entry is SentEmailRow => Boolean(entry));

      let workspaceId = matchedSentEmail?.workspace_id || null;
      let contactId = matchedSentEmail?.contact_id || null;

      if (!workspaceId || !contactId) {
        const matchedContact = await findContactBySender(supabase, settings.user_id, senderEmail, contactCache);
        workspaceId = workspaceId || matchedContact?.workspace_id || null;
        contactId = contactId || matchedContact?.id || null;
      }

      if (!workspaceId) {
        console.log(`[mailbox-sync] UID=${message.uid} SKIPPED: no workspace found`);
        continue;
      }

      console.log(`[mailbox-sync] UID=${message.uid} MATCHED: workspace=${workspaceId} contact=${contactId}`);

      const receivedAt = (
        message.envelope?.date ||
        (message.internalDate ? new Date(message.internalDate) : new Date())
      ).toISOString();
      const isAutoReply = detectAutoReply(message.envelope?.subject, headers, '');
      const { textPart, htmlPart } = pickPreferredParts(message.bodyStructure);

      matchedMessages.push({
        uid: message.uid,
        incomingMessageId,
        from,
        to,
        cc,
        senderEmail,
        inReplyTo,
        references: msgReferences,
        matchedSentEmail,
        workspaceId,
        contactId,
        subject: message.envelope?.subject || null,
        receivedAt,
        isAutoReply,
        flags: Array.from(message.flags || []),
        textPart,
        htmlPart,
      });
    }

    // Phase 2: download bodies and persist (separate IMAP commands, no nesting)
    for (const matched of matchedMessages) {
      let textBody: string | null = null;
      let htmlBody: string | null = null;

      try {
        const [downloadedText, downloadedHtml] = await Promise.all([
          downloadPartAsString(client, matched.uid, matched.textPart),
          downloadPartAsString(client, matched.uid, matched.htmlPart),
        ]);
        textBody = downloadedText;
        htmlBody = downloadedHtml;
        console.log(`[mailbox-sync] UID=${matched.uid} body downloaded (text=${!!textBody}, html=${!!htmlBody})`);
      } catch (downloadError) {
        console.warn(`[mailbox-sync] UID=${matched.uid} body download failed:`, downloadError instanceof Error ? downloadError.message : downloadError);
      }

      const plainText = extractReplyText(textBody, htmlBody);
      // Re-check auto-reply with body content
      const isAutoReply = matched.isAutoReply || detectAutoReply(matched.subject, {}, plainText);

      const persisted = await persistInboundMailboxMessage({
        supabase,
        userId: settings.user_id,
        workspaceId: matched.workspaceId,
        contactId: matched.contactId,
        emailSentId: matched.matchedSentEmail?.id || null,
        internetMessageId: matched.incomingMessageId,
        inReplyTo: matched.inReplyTo,
        references: matched.references,
        subject: matched.subject,
        from: matched.from[0] || { email: matched.senderEmail, name: null },
        to: matched.to,
        cc: matched.cc,
        textBody: plainText,
        htmlBody: htmlBody || null,
        messageAt: matched.receivedAt,
        receivedAt: matched.receivedAt,
        folder: 'INBOX',
        imapUid: matched.uid,
        isAutoReply,
        metadata: {
          flags: matched.flags,
          raw_message_id: formatMessageId(matched.incomingMessageId) || matched.incomingMessageId,
        },
      });

      if (!persisted.created) {
        continue;
      }

      stored++;

      if (matched.matchedSentEmail && !matched.matchedSentEmail.replied_at) {
        await markEmailReplied(supabase, {
          email: matched.matchedSentEmail,
          workspaceId: matched.workspaceId,
          repliedAt: matched.receivedAt,
          threadId: persisted.threadId,
          mailboxMessageId: persisted.messageId,
          snippet: createMessageSnippet(plainText, htmlBody),
          isAutoReply,
        });
        matched.matchedSentEmail.replied_at = matched.receivedAt;
        repliesDetected++;
      } else if (matched.contactId) {
        const { error } = await supabase.from('contact_timeline').insert({
          contact_id: matched.contactId,
          workspace_id: matched.workspaceId,
          event_type: 'incoming_email',
          title: isAutoReply ? 'Réponse automatique reçue' : 'Email entrant',
          description: createMessageSnippet(plainText, htmlBody) || 'Nouveau message reçu',
          metadata: {
            thread_id: persisted.threadId,
            mailbox_message_id: persisted.messageId,
            auto_reply: isAutoReply,
          },
        });

        if (error) throw error;
      }
    }

    console.log(`[mailbox-sync] Done: scanned=${scanned} stored=${stored} replies=${repliesDetected} lastSeenUid=${lastSeenUid}`);

    await upsertSyncState(supabase, {
      userId: settings.user_id,
      folder: 'INBOX',
      uidValidity: mailbox.uidValidity,
      lastSeenUid,
      lastError: null,
    });

    await client.logout();
  } catch (error) {
    await upsertSyncState(supabase, {
      userId: settings.user_id,
      folder: 'INBOX',
      lastSeenUid,
      lastError: error instanceof Error ? error.message : 'Mailbox sync failed',
    });

    try {
      await client.logout();
    } catch {
      // ignore
    }

    throw error;
  }

  return {
    userId: settings.user_id,
    scanned,
    stored,
    repliesDetected,
    lastSeenUid,
  };
}
