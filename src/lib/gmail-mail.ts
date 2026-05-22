import 'server-only';

import crypto from 'crypto';
import { cookies } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';

import { decrypt, encrypt } from '@/lib/encryption';
import type { MailAccount } from '@/lib/mail-accounts';
import { normalizeEmail } from '@/lib/mailbox-utils';

const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_ENDPOINT = 'https://www.googleapis.com/oauth2/v3/userinfo';
const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1';
export const GMAIL_OAUTH_COOKIE = 'orianna_gmail_oauth_state';
export const GMAIL_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send',
];

interface GoogleTokenResponse {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type: string;
}

function getGoogleMailConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('Google OAuth is not configured');
  return { clientId, clientSecret };
}

export function buildGmailRedirectUri(origin: string) {
  return `${origin}/api/settings/mail-accounts/gmail/callback`;
}

export async function createGmailOAuthState() {
  const state = crypto.randomBytes(24).toString('hex');
  const cookieStore = await cookies();
  cookieStore.set(GMAIL_OAUTH_COOKIE, state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 10 * 60,
  });
  return state;
}

export async function consumeGmailOAuthState(state: string | null) {
  const cookieStore = await cookies();
  const stored = cookieStore.get(GMAIL_OAUTH_COOKIE)?.value || null;
  cookieStore.delete(GMAIL_OAUTH_COOKIE);
  return Boolean(state && stored && state === stored);
}

export function buildGmailAuthUrl(origin: string, state: string) {
  const { clientId } = getGoogleMailConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: buildGmailRedirectUri(origin),
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    scope: GMAIL_SCOPES.join(' '),
    state,
  });
  return `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`;
}

async function fetchGoogleToken(params: URLSearchParams): Promise<GoogleTokenResponse> {
  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
    cache: 'no-store',
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error_description || data.error || 'Google token exchange failed');
  return data as GoogleTokenResponse;
}

export async function exchangeGmailCode(origin: string, code: string) {
  const { clientId, clientSecret } = getGoogleMailConfig();
  return fetchGoogleToken(new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: buildGmailRedirectUri(origin),
    grant_type: 'authorization_code',
  }));
}

export async function refreshGmailAccessToken(refreshToken: string) {
  const { clientId, clientSecret } = getGoogleMailConfig();
  return fetchGoogleToken(new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  }));
}

export async function fetchGmailIdentity(accessToken: string) {
  const response = await fetch(GOOGLE_USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error_description || data.error || 'Failed to fetch Google identity');
  return {
    email: normalizeEmail(data.email) || null,
    name: typeof data.name === 'string' ? data.name : null,
    providerAccountId: typeof data.sub === 'string' ? data.sub : null,
  };
}

export async function saveGmailMailAccount(input: {
  supabase: SupabaseClient;
  userId: string;
  userEmail: string | null;
  tokens: GoogleTokenResponse;
  identity: { email: string | null; name: string | null; providerAccountId: string | null };
}) {
  if (!input.identity.email) throw new Error('Google account email not available');

  const { data: existing } = await input.supabase
    .from('mail_accounts')
    .select('id, oauth_refresh_token_encrypted, is_default_send')
    .eq('user_id', input.userId)
    .eq('provider', 'gmail')
    .ilike('email', input.identity.email)
    .maybeSingle();

  const refreshTokenEncrypted = input.tokens.refresh_token
    ? encrypt(input.tokens.refresh_token)
    : existing?.oauth_refresh_token_encrypted || null;
  if (!refreshTokenEncrypted) throw new Error('Google did not return a refresh token. Reconnect and try again.');

  const payload = {
    user_id: input.userId,
    provider: 'gmail',
    email: input.identity.email,
    display_name: input.identity.name || input.userEmail || input.identity.email,
    status: 'active',
    sync_enabled: true,
    send_enabled: true,
    is_default_send: existing?.is_default_send ?? false,
    provider_account_id: input.identity.providerAccountId,
    oauth_refresh_token_encrypted: refreshTokenEncrypted,
    oauth_scopes: input.tokens.scope ? input.tokens.scope.split(' ').filter(Boolean) : GMAIL_SCOPES,
    oauth_expires_at: input.tokens.expires_in ? new Date(Date.now() + input.tokens.expires_in * 1000).toISOString() : null,
    last_error: null,
    updated_at: new Date().toISOString(),
  };

  const query = existing?.id
    ? input.supabase.from('mail_accounts').update(payload).eq('id', existing.id).select('*').single()
    : input.supabase.from('mail_accounts').insert(payload).select('*').single();

  const { data, error } = await query;
  if (error) throw error;
  return data as MailAccount;
}

export async function getGmailAccessToken(supabase: SupabaseClient, account: MailAccount) {
  const refreshToken = account.oauth_refresh_token_encrypted ? decrypt(account.oauth_refresh_token_encrypted) : null;
  if (!refreshToken) throw new Error('Gmail account is missing a refresh token');
  const tokens = await refreshGmailAccessToken(refreshToken);
  await supabase
    .from('mail_accounts')
    .update({
      oauth_expires_at: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000).toISOString() : null,
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', account.id);
  return tokens.access_token;
}

export async function gmailFetch<T>(accessToken: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${GMAIL_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
    cache: 'no-store',
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(data.error?.message || data.error_description || data.error || 'Gmail API request failed');
  return data as T;
}

function encodeHeader(value: string) {
  return /^[\x00-\x7F]*$/.test(value) ? value : `=?UTF-8?B?${Buffer.from(value).toString('base64')}?=`;
}

function base64Url(value: string) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export function buildRawMime(input: {
  from: string;
  to: string;
  subject: string;
  html: string;
  text?: string | null;
  inReplyTo?: string | null;
  references?: string[];
}) {
  const boundary = `orianna-${crypto.randomBytes(8).toString('hex')}`;
  const headers = [
    `From: <${input.from}>`,
    `To: ${input.to}`,
    `Subject: ${encodeHeader(input.subject)}`,
    'MIME-Version: 1.0',
    ...(input.inReplyTo ? [`In-Reply-To: ${input.inReplyTo}`] : []),
    ...(input.references?.length ? [`References: ${input.references.join(' ')}`] : []),
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];

  const textPart = input.text || input.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const body = [
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    textPart,
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    input.html,
    `--${boundary}--`,
    '',
  ].join('\r\n');

  return base64Url(`${headers.join('\r\n')}\r\n\r\n${body}`);
}

export async function sendGmailMessage(input: {
  supabase: SupabaseClient;
  account: MailAccount;
  to: string;
  subject: string;
  html: string;
  text?: string | null;
  inReplyTo?: string | null;
  references?: string[];
  threadId?: string | null;
}) {
  const accessToken = await getGmailAccessToken(input.supabase, input.account);
  const raw = buildRawMime({
    from: input.account.email,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
    inReplyTo: input.inReplyTo,
    references: input.references,
  });

  const sent = await gmailFetch<{ id: string; threadId?: string }>(accessToken, '/users/me/messages/send', {
    method: 'POST',
    body: JSON.stringify({
      raw,
      ...(input.threadId ? { threadId: input.threadId } : {}),
    }),
  });

  let internetMessageId = sent.id;
  try {
    const metadata = await gmailFetch<{ payload?: { headers?: Array<{ name: string; value: string }> } }>(
      accessToken,
      `/users/me/messages/${encodeURIComponent(sent.id)}?format=metadata&metadataHeaders=Message-ID`
    );
    internetMessageId = metadata.payload?.headers?.find((h) => h.name.toLowerCase() === 'message-id')?.value || sent.id;
  } catch {
    // The Gmail provider id is still enough for dedupe; use it as a fallback.
  }

  return {
    messageId: internetMessageId,
    providerMessageId: sent.id,
    providerThreadId: sent.threadId || input.threadId || null,
  };
}
