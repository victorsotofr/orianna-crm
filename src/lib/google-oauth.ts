import 'server-only';

import { decrypt, encrypt } from '@/lib/encryption';
import { getServiceSupabase } from '@/lib/supabase';

const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_ENDPOINT = 'https://www.googleapis.com/oauth2/v3/userinfo';

export const GOOGLE_CALENDAR_OAUTH_COOKIE = 'orianna_google_calendar_oauth_state';
export const GOOGLE_CALENDAR_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar',
];

interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
}

export interface GoogleCalendarConnection {
  user_id: string;
  user_email: string | null;
  google_calendar_refresh_token_encrypted: string | null;
  google_calendar_email: string | null;
  google_calendar_scopes: string[] | null;
  google_calendar_connected_at: string | null;
  google_calendar_default_calendar_id: string | null;
  google_calendar_default_timezone: string | null;
  google_calendar_last_error: string | null;
}

export interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type: string;
  id_token?: string;
}

function getGoogleOAuthConfig(): GoogleOAuthConfig {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Google Calendar OAuth is not configured');
  }

  return { clientId, clientSecret };
}

export function isGoogleCalendarConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function buildGoogleCalendarRedirectUri(origin: string) {
  return `${origin}/api/settings/google-calendar/callback`;
}

export function buildGoogleCalendarAuthUrl(origin: string, state: string) {
  const { clientId } = getGoogleOAuthConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: buildGoogleCalendarRedirectUri(origin),
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    scope: GOOGLE_CALENDAR_SCOPES.join(' '),
    state,
  });

  return `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`;
}

async function fetchGoogleToken(params: URLSearchParams): Promise<GoogleTokenResponse> {
  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
    cache: 'no-store',
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error_description || data.error || 'Google token exchange failed');
  }

  return data as GoogleTokenResponse;
}

export async function exchangeGoogleCalendarCode(origin: string, code: string) {
  const { clientId, clientSecret } = getGoogleOAuthConfig();
  const params = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: buildGoogleCalendarRedirectUri(origin),
    grant_type: 'authorization_code',
  });

  return fetchGoogleToken(params);
}

export async function refreshGoogleCalendarAccessToken(refreshToken: string) {
  const { clientId, clientSecret } = getGoogleOAuthConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });

  return fetchGoogleToken(params);
}

export async function fetchGoogleCalendarIdentity(accessToken: string) {
  const response = await fetch(GOOGLE_USERINFO_ENDPOINT, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: 'no-store',
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error_description || data.error || 'Failed to fetch Google account identity');
  }

  return {
    email: typeof data.email === 'string' ? data.email : null,
  };
}

export async function getGoogleCalendarConnection(userId: string): Promise<GoogleCalendarConnection | null> {
  const serviceSupabase = getServiceSupabase();
  const { data, error } = await serviceSupabase
    .from('user_settings')
    .select(
      [
        'user_id',
        'user_email',
        'google_calendar_refresh_token_encrypted',
        'google_calendar_email',
        'google_calendar_scopes',
        'google_calendar_connected_at',
        'google_calendar_default_calendar_id',
        'google_calendar_default_timezone',
        'google_calendar_last_error',
      ].join(', ')
    )
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return (data as GoogleCalendarConnection | null) || null;
}

export async function setGoogleCalendarLastError(userId: string, message: string | null) {
  const serviceSupabase = getServiceSupabase();
  const { error } = await serviceSupabase
    .from('user_settings')
    .upsert(
      {
        user_id: userId,
        google_calendar_last_error: message,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );

  if (error) throw error;
}

export async function saveGoogleCalendarConnection(input: {
  userId: string;
  userEmail: string | null;
  refreshToken?: string | null;
  googleCalendarEmail: string | null;
  scopes: string[];
  defaultCalendarId?: string | null;
  defaultTimezone?: string | null;
}) {
  const serviceSupabase = getServiceSupabase();
  const existing = await getGoogleCalendarConnection(input.userId);
  const nextRefreshTokenEncrypted = input.refreshToken
    ? encrypt(input.refreshToken)
    : existing?.google_calendar_refresh_token_encrypted || null;

  if (!nextRefreshTokenEncrypted) {
    throw new Error('Google did not return a refresh token. Reconnect and try again.');
  }

  const { error } = await serviceSupabase
    .from('user_settings')
    .upsert(
      {
        user_id: input.userId,
        user_email: input.userEmail,
        google_calendar_refresh_token_encrypted: nextRefreshTokenEncrypted,
        google_calendar_email: input.googleCalendarEmail,
        google_calendar_scopes: input.scopes,
        google_calendar_connected_at: new Date().toISOString(),
        google_calendar_default_calendar_id: input.defaultCalendarId || existing?.google_calendar_default_calendar_id || 'primary',
        google_calendar_default_timezone: input.defaultTimezone || existing?.google_calendar_default_timezone || null,
        google_calendar_last_error: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );

  if (error) throw error;
}

export async function disconnectGoogleCalendar(userId: string) {
  const serviceSupabase = getServiceSupabase();
  const { error } = await serviceSupabase
    .from('user_settings')
    .upsert(
      {
        user_id: userId,
        google_calendar_refresh_token_encrypted: null,
        google_calendar_email: null,
        google_calendar_scopes: [],
        google_calendar_connected_at: null,
        google_calendar_default_calendar_id: 'primary',
        google_calendar_default_timezone: null,
        google_calendar_last_error: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );

  if (error) throw error;
}

export async function getGoogleCalendarAccessTokenForUser(userId: string) {
  const connection = await getGoogleCalendarConnection(userId);
  if (!connection?.google_calendar_refresh_token_encrypted) {
    throw new Error('Google Calendar is not connected');
  }

  const refreshToken = decrypt(connection.google_calendar_refresh_token_encrypted);
  if (!refreshToken) {
    throw new Error('Stored Google Calendar refresh token is invalid');
  }

  try {
    const tokens = await refreshGoogleCalendarAccessToken(refreshToken);
    await setGoogleCalendarLastError(userId, null);
    return {
      accessToken: tokens.access_token,
      connection,
      scopes: tokens.scope ? tokens.scope.split(' ').filter(Boolean) : connection.google_calendar_scopes || [],
    };
  } catch (error) {
    await setGoogleCalendarLastError(userId, error instanceof Error ? error.message : 'Google Calendar token refresh failed');
    throw error;
  }
}
