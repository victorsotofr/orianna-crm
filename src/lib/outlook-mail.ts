import 'server-only';

import crypto from 'crypto';
import { cookies } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';

import { decrypt, encrypt } from '@/lib/encryption';
import type { MailAccount } from '@/lib/mail-accounts';
import { normalizeEmail } from '@/lib/mailbox-utils';

const MICROSOFT_GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
export const MICROSOFT_MAIL_OAUTH_COOKIE = 'orianna_microsoft_mail_oauth_state';
export const MICROSOFT_MAIL_SCOPES = ['openid', 'profile', 'email', 'offline_access', 'User.Read', 'Mail.Read', 'Mail.Send'];

interface MicrosoftTokenResponse {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type: string;
}

function getMicrosoftConfig() {
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  const tenant = process.env.MICROSOFT_TENANT_ID || 'common';
  if (!clientId || !clientSecret) throw new Error('Microsoft OAuth is not configured');
  return { clientId, clientSecret, tenant };
}

function microsoftAuthorizeEndpoint() {
  const { tenant } = getMicrosoftConfig();
  return `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`;
}

function microsoftTokenEndpoint() {
  const { tenant } = getMicrosoftConfig();
  return `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`;
}

export function buildMicrosoftMailRedirectUri(origin: string) {
  return `${origin}/api/settings/mail-accounts/outlook/callback`;
}

export async function createMicrosoftMailOAuthState() {
  const state = crypto.randomBytes(24).toString('hex');
  const cookieStore = await cookies();
  cookieStore.set(MICROSOFT_MAIL_OAUTH_COOKIE, state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 10 * 60,
  });
  return state;
}

export async function consumeMicrosoftMailOAuthState(state: string | null) {
  const cookieStore = await cookies();
  const stored = cookieStore.get(MICROSOFT_MAIL_OAUTH_COOKIE)?.value || null;
  cookieStore.delete(MICROSOFT_MAIL_OAUTH_COOKIE);
  return Boolean(state && stored && state === stored);
}

export function buildMicrosoftMailAuthUrl(origin: string, state: string) {
  const { clientId } = getMicrosoftConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: buildMicrosoftMailRedirectUri(origin),
    response_type: 'code',
    response_mode: 'query',
    scope: MICROSOFT_MAIL_SCOPES.join(' '),
    state,
  });
  return `${microsoftAuthorizeEndpoint()}?${params.toString()}`;
}

async function fetchMicrosoftToken(params: URLSearchParams): Promise<MicrosoftTokenResponse> {
  const response = await fetch(microsoftTokenEndpoint(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
    cache: 'no-store',
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error_description || data.error || 'Microsoft token exchange failed');
  return data as MicrosoftTokenResponse;
}

export async function exchangeMicrosoftMailCode(origin: string, code: string) {
  const { clientId, clientSecret } = getMicrosoftConfig();
  return fetchMicrosoftToken(new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: buildMicrosoftMailRedirectUri(origin),
    grant_type: 'authorization_code',
  }));
}

export async function refreshMicrosoftMailAccessToken(refreshToken: string) {
  const { clientId, clientSecret } = getMicrosoftConfig();
  return fetchMicrosoftToken(new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  }));
}

export async function graphFetch<T>(accessToken: string, pathOrUrl: string, init?: RequestInit): Promise<T> {
  const url = pathOrUrl.startsWith('https://') ? pathOrUrl : `${MICROSOFT_GRAPH_BASE}${pathOrUrl}`;
  const response = await fetch(url, {
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
  if (!response.ok) throw new Error(data.error?.message || data.error_description || data.error || 'Microsoft Graph request failed');
  return data as T;
}

export async function fetchMicrosoftMailIdentity(accessToken: string) {
  const me = await graphFetch<{ id?: string; mail?: string; userPrincipalName?: string; displayName?: string }>(accessToken, '/me?$select=id,mail,userPrincipalName,displayName');
  return {
    email: normalizeEmail(me.mail || me.userPrincipalName) || null,
    name: me.displayName || null,
    providerAccountId: me.id || null,
  };
}

export async function saveMicrosoftMailAccount(input: {
  supabase: SupabaseClient;
  userId: string;
  userEmail: string | null;
  tokens: MicrosoftTokenResponse;
  identity: { email: string | null; name: string | null; providerAccountId: string | null };
}) {
  if (!input.identity.email) throw new Error('Microsoft account email not available');

  const { data: existing } = await input.supabase
    .from('mail_accounts')
    .select('id, oauth_refresh_token_encrypted, is_default_send')
    .eq('user_id', input.userId)
    .eq('provider', 'outlook')
    .ilike('email', input.identity.email)
    .maybeSingle();

  const refreshTokenEncrypted = input.tokens.refresh_token
    ? encrypt(input.tokens.refresh_token)
    : existing?.oauth_refresh_token_encrypted || null;
  if (!refreshTokenEncrypted) throw new Error('Microsoft did not return a refresh token. Reconnect and try again.');

  const payload = {
    user_id: input.userId,
    provider: 'outlook',
    email: input.identity.email,
    display_name: input.identity.name || input.userEmail || input.identity.email,
    status: 'active',
    sync_enabled: true,
    send_enabled: true,
    is_default_send: existing?.is_default_send ?? false,
    provider_account_id: input.identity.providerAccountId,
    oauth_refresh_token_encrypted: refreshTokenEncrypted,
    oauth_scopes: input.tokens.scope ? input.tokens.scope.split(' ').filter(Boolean) : MICROSOFT_MAIL_SCOPES,
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

export async function getMicrosoftMailAccessToken(supabase: SupabaseClient, account: MailAccount) {
  const refreshToken = account.oauth_refresh_token_encrypted ? decrypt(account.oauth_refresh_token_encrypted) : null;
  if (!refreshToken) throw new Error('Outlook account is missing a refresh token');
  const tokens = await refreshMicrosoftMailAccessToken(refreshToken);
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

function graphRecipient(email: string) {
  return { emailAddress: { address: email } };
}

export async function sendMicrosoftMail(input: {
  supabase: SupabaseClient;
  account: MailAccount;
  to: string;
  subject: string;
  html: string;
  text?: string | null;
}) {
  const accessToken = await getMicrosoftMailAccessToken(input.supabase, input.account);
  await graphFetch<void>(accessToken, '/me/sendMail', {
    method: 'POST',
    body: JSON.stringify({
      message: {
        subject: input.subject,
        body: {
          contentType: 'HTML',
          content: input.html || input.text || '',
        },
        toRecipients: [graphRecipient(input.to)],
      },
      saveToSentItems: true,
    }),
  });

  return {
    messageId: `<outlook-${crypto.randomUUID()}@orianna.local>`,
    providerMessageId: null,
    providerThreadId: null,
  };
}
