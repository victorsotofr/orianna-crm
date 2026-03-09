import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { fetchGoogleCalendarPrimaryCalendar } from '@/lib/google-calendar';
import {
  GOOGLE_CALENDAR_OAUTH_COOKIE,
  exchangeGoogleCalendarCode,
  fetchGoogleCalendarIdentity,
  saveGoogleCalendarConnection,
} from '@/lib/google-oauth';
import { createServerClient } from '@/lib/supabase-server';

export async function GET(request: Request) {
  const redirectUrl = new URL('/settings', request.url);

  try {
    const url = new URL(request.url);
    const state = url.searchParams.get('state');
    const code = url.searchParams.get('code');
    const oauthError = url.searchParams.get('error');

    if (oauthError) {
      redirectUrl.searchParams.set('google_calendar', 'denied');
      return NextResponse.redirect(redirectUrl);
    }

    const cookieStore = await cookies();
    const expectedState = cookieStore.get(GOOGLE_CALENDAR_OAUTH_COOKIE)?.value;
    if (!state || !expectedState || state !== expectedState) {
      redirectUrl.searchParams.set('google_calendar', 'state_error');
      const invalidResponse = NextResponse.redirect(redirectUrl);
      invalidResponse.cookies.delete(GOOGLE_CALENDAR_OAUTH_COOKIE);
      return invalidResponse;
    }

    if (!code) {
      redirectUrl.searchParams.set('google_calendar', 'missing_code');
      const missingCodeResponse = NextResponse.redirect(redirectUrl);
      missingCodeResponse.cookies.delete(GOOGLE_CALENDAR_OAUTH_COOKIE);
      return missingCodeResponse;
    }

    const { supabase, error: clientError } = await createServerClient();
    if (!supabase || clientError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const origin = url.origin;
    const tokenResponse = await exchangeGoogleCalendarCode(origin, code);
    const identity = await fetchGoogleCalendarIdentity(tokenResponse.access_token);

    // Try to fetch primary calendar info, but don't fail the whole flow if the
    // Calendar API isn't enabled yet — the tokens are still valid.
    let primaryCalendar: { id?: string; timeZone?: string } = {};
    try {
      primaryCalendar = await fetchGoogleCalendarPrimaryCalendar(tokenResponse.access_token);
    } catch (calError) {
      console.warn('Could not fetch primary calendar (API may not be enabled yet):', calError instanceof Error ? calError.message : calError);
    }

    await saveGoogleCalendarConnection({
      userId: user.id,
      userEmail: user.email || null,
      refreshToken: tokenResponse.refresh_token,
      googleCalendarEmail: identity.email || primaryCalendar.id || null,
      scopes: tokenResponse.scope ? tokenResponse.scope.split(' ').filter(Boolean) : [],
      defaultCalendarId: 'primary',
      defaultTimezone: primaryCalendar.timeZone || null,
    });

    redirectUrl.searchParams.set('google_calendar', 'connected');
    const response = NextResponse.redirect(redirectUrl);
    response.cookies.delete(GOOGLE_CALENDAR_OAUTH_COOKIE);
    return response;
  } catch (error: any) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error('Google Calendar callback error:', errorMsg);
    redirectUrl.searchParams.set('google_calendar', 'callback_error');
    redirectUrl.searchParams.set('google_calendar_error', errorMsg.slice(0, 200));
    const response = NextResponse.redirect(redirectUrl);
    response.cookies.delete(GOOGLE_CALENDAR_OAUTH_COOKIE);
    return response;
  }
}
