import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { getGmailAccessToken, gmailFetch } from '@/lib/gmail-mail';
import { graphFetch, getMicrosoftMailAccessToken } from '@/lib/outlook-mail';
import { ingestInboundMailboxMessage } from '@/lib/mailbox-ingest';
import { syncMailboxForUser, type MailboxSyncResult } from '@/lib/mailbox-sync';
import {
  addressesFromStrings,
  normalizeEmail,
  normalizeMessageId,
  parseMessageIdHeader,
  stripReplyPrefixes,
  type MailboxAddress,
} from '@/lib/mailbox-utils';
import { listMailAccounts, type LegacyMailSettings, type MailAccount } from '@/lib/mail-accounts';

export interface MailAccountSyncResult {
  accountId: string;
  provider: MailAccount['provider'];
  email: string;
  scanned: number;
  stored: number;
  repliesDetected: number;
  bouncesDetected: number;
  error?: string;
}

interface SyncStateRow {
  id: string;
  provider_cursor: string | null;
  history_id: string | null;
  delta_link: string | null;
}

interface GmailMessageList {
  messages?: Array<{ id: string; threadId?: string }>;
  history?: Array<{ messagesAdded?: Array<{ message?: { id?: string; threadId?: string } }> }>;
  historyId?: string;
  nextPageToken?: string;
}

interface GmailMessage {
  id: string;
  threadId?: string;
  labelIds?: string[];
  snippet?: string;
  historyId?: string;
  internalDate?: string;
  payload?: {
    mimeType?: string;
    headers?: Array<{ name: string; value: string }>;
    body?: { data?: string };
    parts?: GmailMessage['payload'][];
  };
}

interface OutlookDeltaPage {
  value?: OutlookMessage[];
  '@odata.nextLink'?: string;
  '@odata.deltaLink'?: string;
}

interface OutlookMessage {
  id: string;
  conversationId?: string;
  internetMessageId?: string;
  subject?: string;
  from?: { emailAddress?: { name?: string; address?: string } };
  toRecipients?: Array<{ emailAddress?: { name?: string; address?: string } }>;
  ccRecipients?: Array<{ emailAddress?: { name?: string; address?: string } }>;
  body?: { contentType?: string; content?: string };
  bodyPreview?: string;
  receivedDateTime?: string;
  sentDateTime?: string;
  '@removed'?: unknown;
}

function emptyResult(account: MailAccount): MailAccountSyncResult {
  return {
    accountId: account.id,
    provider: account.provider,
    email: account.email,
    scanned: 0,
    stored: 0,
    repliesDetected: 0,
    bouncesDetected: 0,
  };
}

async function getProviderSyncState(
  supabase: SupabaseClient,
  account: MailAccount,
  folder = 'INBOX'
): Promise<SyncStateRow | null> {
  const { data, error } = await supabase
    .from('mail_account_sync_state')
    .select('id, provider_cursor, history_id, delta_link')
    .eq('mail_account_id', account.id)
    .eq('folder', folder)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') throw error;
  return (data as SyncStateRow | null) || null;
}

async function upsertProviderSyncState(
  supabase: SupabaseClient,
  account: MailAccount,
  values: Partial<Pick<SyncStateRow, 'provider_cursor' | 'history_id' | 'delta_link'>> & {
    folder?: string;
    lastError?: string | null;
  }
) {
  const folder = values.folder || 'INBOX';
  const payload = {
    mail_account_id: account.id,
    user_id: account.user_id,
    folder,
    provider_cursor: values.provider_cursor ?? null,
    history_id: values.history_id ?? null,
    delta_link: values.delta_link ?? null,
    last_synced_at: new Date().toISOString(),
    last_error: values.lastError ?? null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('mail_account_sync_state')
    .upsert(payload, { onConflict: 'mail_account_id,folder' });
  if (error) throw error;
}

async function markAccountSync(
  supabase: SupabaseClient,
  account: MailAccount,
  errorMessage: string | null
) {
  await supabase
    .from('mail_accounts')
    .update({
      status: errorMessage ? 'error' : 'active',
      last_synced_at: new Date().toISOString(),
      last_error: errorMessage,
      updated_at: new Date().toISOString(),
    })
    .eq('id', account.id);
}

function decodeBase64Url(value?: string) {
  if (!value) return null;
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  return Buffer.from(padded, 'base64').toString('utf8');
}

function gmailHeaders(message: GmailMessage) {
  const headers = new Map<string, string>();
  for (const header of message.payload?.headers || []) {
    headers.set(header.name.toLowerCase(), header.value);
  }
  return headers;
}

function findGmailBody(
  payload: GmailMessage['payload'] | undefined,
  mimeType: 'text/plain' | 'text/html'
): string | null {
  if (!payload) return null;
  if (payload.mimeType === mimeType) return decodeBase64Url(payload.body?.data);
  for (const part of payload.parts || []) {
    const body = findGmailBody(part, mimeType);
    if (body) return body;
  }
  return null;
}

function addressFromGraph(value: OutlookMessage['from']): MailboxAddress | null {
  const email = normalizeEmail(value?.emailAddress?.address);
  if (!email) return null;
  return { email, name: value?.emailAddress?.name || null };
}

function addressesFromGraph(values?: OutlookMessage['toRecipients']): MailboxAddress[] {
  return (values || [])
    .map((entry) => addressFromGraph(entry as OutlookMessage['from']))
    .filter((entry): entry is MailboxAddress => Boolean(entry));
}

function mergeResults(target: MailAccountSyncResult, next: { stored: boolean; replyDetected: boolean; bounceDetected: boolean }) {
  if (next.stored) target.stored++;
  if (next.replyDetected) target.repliesDetected++;
  if (next.bounceDetected) target.bouncesDetected++;
}

async function syncGmailAccount(supabase: SupabaseClient, account: MailAccount): Promise<MailAccountSyncResult> {
  const result = emptyResult(account);
  const accessToken = await getGmailAccessToken(supabase, account);
  const state = await getProviderSyncState(supabase, account);
  const selfEmails = [account.email].map(normalizeEmail).filter((email): email is string => Boolean(email));
  const messageIds = new Map<string, string | undefined>();
  let nextHistoryId = state?.history_id || null;

  try {
    if (state?.history_id) {
      try {
        const history = await gmailFetch<GmailMessageList>(
          accessToken,
          `/users/me/history?startHistoryId=${encodeURIComponent(state.history_id)}&historyTypes=messageAdded&maxResults=100`
        );
        nextHistoryId = history.historyId || nextHistoryId;
        for (const item of history.history || []) {
          for (const added of item.messagesAdded || []) {
            if (added.message?.id) messageIds.set(added.message.id, added.message.threadId);
          }
        }
      } catch {
        messageIds.clear();
      }
    }

    if (messageIds.size === 0) {
      const listed = await gmailFetch<GmailMessageList>(
        accessToken,
        '/users/me/messages?labelIds=INBOX&maxResults=25&q=newer_than:30d'
      );
      nextHistoryId = listed.historyId || nextHistoryId;
      for (const message of listed.messages || []) {
        messageIds.set(message.id, message.threadId);
      }
    }

    for (const [id] of messageIds) {
      result.scanned++;
      const message = await gmailFetch<GmailMessage>(
        accessToken,
        `/users/me/messages/${encodeURIComponent(id)}?format=full`
      );
      nextHistoryId = message.historyId || nextHistoryId;

      const headers = gmailHeaders(message);
      const from = addressesFromStrings([headers.get('from')])[0];
      if (!from?.email || selfEmails.includes(from.email)) continue;

      const to = addressesFromStrings((headers.get('to') || '').split(','));
      const cc = addressesFromStrings((headers.get('cc') || '').split(','));
      const subject = headers.get('subject') || stripReplyPrefixes(message.snippet || '') || null;
      const inReplyTo = parseMessageIdHeader(headers.get('in-reply-to') || '')[0] || null;
      const references = Array.from(new Set([
        ...(inReplyTo ? [inReplyTo] : []),
        ...parseMessageIdHeader(headers.get('references') || ''),
      ]));
      const textBody = findGmailBody(message.payload, 'text/plain') || message.snippet || null;
      const htmlBody = findGmailBody(message.payload, 'text/html');
      const internalDateMs = Number(message.internalDate || 0);
      const messageAt = Number.isFinite(internalDateMs) && internalDateMs > 0
        ? new Date(internalDateMs).toISOString()
        : new Date().toISOString();

      const stored = await ingestInboundMailboxMessage(supabase, {
        userId: account.user_id,
        mailAccountId: account.id,
        provider: 'gmail',
        providerMessageId: message.id,
        providerThreadId: message.threadId || null,
        providerLabelIds: message.labelIds || [],
        internetMessageId: normalizeMessageId(headers.get('message-id')) || `gmail-${message.id}`,
        inReplyTo,
        references,
        subject,
        from,
        to,
        cc,
        textBody,
        htmlBody,
        messageAt,
        receivedAt: messageAt,
        folder: 'INBOX',
        selfEmails,
        metadata: { labels: message.labelIds || [], gmail_history_id: message.historyId || null },
      });
      mergeResults(result, stored);
    }

    await upsertProviderSyncState(supabase, account, { history_id: nextHistoryId, lastError: null });
    await markAccountSync(supabase, account, null);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gmail sync failed';
    await upsertProviderSyncState(supabase, account, { history_id: nextHistoryId, lastError: message });
    await markAccountSync(supabase, account, message);
    throw error;
  }
}

async function syncOutlookAccount(supabase: SupabaseClient, account: MailAccount): Promise<MailAccountSyncResult> {
  const result = emptyResult(account);
  const accessToken = await getMicrosoftMailAccessToken(supabase, account);
  const state = await getProviderSyncState(supabase, account);
  const selfEmails = [account.email].map(normalizeEmail).filter((email): email is string => Boolean(email));
  let nextLink: string | null = state?.delta_link ||
    '/me/mailFolders/Inbox/messages/delta?$top=25&$select=id,conversationId,internetMessageId,subject,from,toRecipients,ccRecipients,body,bodyPreview,receivedDateTime,sentDateTime';
  let deltaLink = state?.delta_link || null;

  try {
    for (let pageCount = 0; nextLink && pageCount < 3; pageCount++) {
      const currentLink = nextLink;
      const page: OutlookDeltaPage = await graphFetch<OutlookDeltaPage>(accessToken, currentLink);
      for (const message of page.value || []) {
        if (message['@removed']) continue;
        result.scanned++;
        const from = addressFromGraph(message.from);
        if (!from?.email || selfEmails.includes(from.email)) continue;

        const bodyContent = message.body?.content || message.bodyPreview || null;
        const isHtml = (message.body?.contentType || '').toLowerCase() === 'html';
        const messageAt = message.receivedDateTime || message.sentDateTime || new Date().toISOString();
        const stored = await ingestInboundMailboxMessage(supabase, {
          userId: account.user_id,
          mailAccountId: account.id,
          provider: 'outlook',
          providerMessageId: message.id,
          providerThreadId: message.conversationId || null,
          internetMessageId: normalizeMessageId(message.internetMessageId) || `outlook-${message.id}`,
          subject: message.subject || null,
          from,
          to: addressesFromGraph(message.toRecipients),
          cc: addressesFromGraph(message.ccRecipients),
          textBody: isHtml ? message.bodyPreview || null : bodyContent,
          htmlBody: isHtml ? bodyContent : null,
          messageAt,
          receivedAt: messageAt,
          folder: 'INBOX',
          selfEmails,
          metadata: { outlook_conversation_id: message.conversationId || null },
        });
        mergeResults(result, stored);
      }

      deltaLink = page['@odata.deltaLink'] || deltaLink;
      nextLink = page['@odata.nextLink'] || null;
    }

    await upsertProviderSyncState(supabase, account, { delta_link: deltaLink, lastError: null });
    await markAccountSync(supabase, account, null);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Outlook sync failed';
    await upsertProviderSyncState(supabase, account, { delta_link: deltaLink, lastError: message });
    await markAccountSync(supabase, account, message);
    throw error;
  }
}

function imapSettingsFromAccount(account: MailAccount) {
  return {
    user_id: account.user_id,
    user_email: account.display_name || account.email,
    mail_account_id: account.id,
    smtp_user: account.smtp_user || account.email,
    imap_host: account.imap_host,
    imap_port: account.imap_port,
    imap_user: account.imap_user,
    imap_password_encrypted: account.imap_password_encrypted,
  };
}

function toAccountResult(account: MailAccount, result: MailboxSyncResult): MailAccountSyncResult {
  return {
    accountId: account.id,
    provider: account.provider,
    email: account.email,
    scanned: result.scanned,
    stored: result.stored,
    repliesDetected: result.repliesDetected,
    bouncesDetected: result.bouncesDetected,
  };
}

export async function syncMailAccount(
  supabase: SupabaseClient,
  account: MailAccount
): Promise<MailAccountSyncResult> {
  if (!account.sync_enabled || account.status === 'paused') return emptyResult(account);
  if (account.provider === 'imap') return toAccountResult(account, await syncMailboxForUser(supabase, imapSettingsFromAccount(account)));
  if (account.provider === 'gmail') return syncGmailAccount(supabase, account);
  return syncOutlookAccount(supabase, account);
}

export async function syncAllMailAccountsForUser(
  supabase: SupabaseClient,
  userId: string,
  legacySettings?: LegacyMailSettings | null
) {
  const accounts = await listMailAccounts(supabase, userId);
  const activeAccounts = accounts.filter((account) => account.sync_enabled && account.status !== 'paused');
  const results: MailAccountSyncResult[] = [];

  if (activeAccounts.length === 0 && legacySettings?.imap_host && legacySettings.imap_user && legacySettings.imap_password_encrypted) {
    const legacy = await syncMailboxForUser(supabase, {
      user_id: userId,
      user_email: legacySettings.user_email,
      smtp_user: legacySettings.smtp_user,
      imap_host: legacySettings.imap_host,
      imap_port: legacySettings.imap_port,
      imap_user: legacySettings.imap_user,
      imap_password_encrypted: legacySettings.imap_password_encrypted,
    });
    return {
      accounts: [],
      results: [{
        accountId: 'legacy-imap',
        provider: 'imap' as const,
        email: legacySettings.imap_user || legacySettings.smtp_user || legacySettings.user_email || 'IMAP',
        scanned: legacy.scanned,
        stored: legacy.stored,
        repliesDetected: legacy.repliesDetected,
        bouncesDetected: legacy.bouncesDetected,
      }],
    };
  }

  for (const account of activeAccounts) {
    try {
      results.push(await syncMailAccount(supabase, account));
    } catch (error) {
      results.push({
        ...emptyResult(account),
        error: error instanceof Error ? error.message : 'Mailbox sync failed',
      });
    }
  }

  return { accounts, results };
}
