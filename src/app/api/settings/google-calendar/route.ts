import { NextResponse } from 'next/server';

import {
  disconnectGoogleCalendar,
  getGoogleCalendarConnection,
  isGoogleCalendarConfigured,
} from '@/lib/google-oauth';
import { createServerClient } from '@/lib/supabase-server';

export async function GET() {
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

    const connection = await getGoogleCalendarConnection(user.id);

    return NextResponse.json({
      available: isGoogleCalendarConfigured(),
      connected: !!connection?.google_calendar_refresh_token_encrypted,
      email: connection?.google_calendar_email || null,
      scopes: connection?.google_calendar_scopes || [],
      connectedAt: connection?.google_calendar_connected_at || null,
      defaultCalendarId: connection?.google_calendar_default_calendar_id || 'primary',
      timezone: connection?.google_calendar_default_timezone || null,
      lastError: connection?.google_calendar_last_error || null,
    });
  } catch (error: any) {
    console.error('Google Calendar settings GET error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: error.message || 'Failed to fetch Google Calendar settings' }, { status: 500 });
  }
}

export async function DELETE() {
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

    await disconnectGoogleCalendar(user.id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Google Calendar settings DELETE error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: error.message || 'Failed to disconnect Google Calendar' }, { status: 500 });
  }
}
