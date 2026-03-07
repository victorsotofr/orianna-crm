import { NextResponse } from 'next/server';

import { queryGoogleCalendarFreeBusy } from '@/lib/google-calendar';
import { createServerClient } from '@/lib/supabase-server';

export async function POST(request: Request) {
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

    const { timeMin, timeMax, timeZone, calendarIds } = await request.json();
    if (!timeMin || !timeMax) {
      return NextResponse.json({ error: 'timeMin and timeMax are required' }, { status: 400 });
    }

    const result = await queryGoogleCalendarFreeBusy(user.id, {
      timeMin,
      timeMax,
      timeZone,
      calendarIds: Array.isArray(calendarIds) ? calendarIds : undefined,
    });

    return NextResponse.json({ result });
  } catch (error: any) {
    console.error('Google Calendar freebusy error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: error.message || 'Failed to query availability' }, { status: 500 });
  }
}
