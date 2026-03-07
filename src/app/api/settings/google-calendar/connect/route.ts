import { NextResponse } from 'next/server';

import {
  GOOGLE_CALENDAR_OAUTH_COOKIE,
  buildGoogleCalendarAuthUrl,
  isGoogleCalendarConfigured,
} from '@/lib/google-oauth';
import { createServerClient } from '@/lib/supabase-server';

export async function GET(request: Request) {
  try {
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

    if (!isGoogleCalendarConfigured()) {
      return NextResponse.redirect(new URL('/settings?google_calendar=not_configured', request.url));
    }

    const state = crypto.randomUUID();
    const authUrl = buildGoogleCalendarAuthUrl(new URL(request.url).origin, state);
    const response = NextResponse.redirect(authUrl);

    response.cookies.set(GOOGLE_CALENDAR_OAUTH_COOKIE, state, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 10,
      path: '/',
    });

    return response;
  } catch (error: any) {
    console.error('Google Calendar connect error:', error instanceof Error ? error.message : error);
    return NextResponse.redirect(new URL('/settings?google_calendar=connect_error', request.url));
  }
}
