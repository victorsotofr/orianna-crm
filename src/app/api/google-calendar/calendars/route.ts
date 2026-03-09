import { NextResponse } from 'next/server';

import { listGoogleCalendars } from '@/lib/google-calendar';
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

    const calendars = await listGoogleCalendars(user.id);
    return NextResponse.json({ calendars });
  } catch (error: any) {
    console.error('Google Calendar calendars error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: error.message || 'Failed to load calendars' }, { status: 500 });
  }
}
