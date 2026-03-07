import { NextResponse } from 'next/server';

import { createGoogleCalendarEvent, listGoogleCalendarEvents } from '@/lib/google-calendar';
import { createServerClient } from '@/lib/supabase-server';
import { getWorkspaceContext } from '@/lib/workspace';

function normalizeSendUpdates(value: unknown): 'all' | 'externalOnly' | 'none' {
  if (value === 'all' || value === 'externalOnly') return value;
  return 'none';
}

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

    const { searchParams } = new URL(request.url);
    const events = await listGoogleCalendarEvents(user.id, {
      calendarId: searchParams.get('calendarId') || undefined,
      q: searchParams.get('q') || undefined,
      timeMin: searchParams.get('timeMin') || undefined,
      timeMax: searchParams.get('timeMax') || undefined,
      maxResults: searchParams.get('maxResults') ? Number(searchParams.get('maxResults')) : undefined,
    });

    return NextResponse.json({ events });
  } catch (error: any) {
    console.error('Google Calendar events GET error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: error.message || 'Failed to load events' }, { status: 500 });
  }
}

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

    const body = await request.json();
    const summary = typeof body.summary === 'string' ? body.summary.trim() : '';
    const start = typeof body.start === 'string' ? body.start : '';
    const end = typeof body.end === 'string' ? body.end : '';
    const description = typeof body.description === 'string' ? body.description.trim() : '';
    const attendees = Array.isArray(body.attendees)
      ? (body.attendees as unknown[]).filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : [];
    const contactId = typeof body.contactId === 'string' ? body.contactId : null;
    const threadId = typeof body.threadId === 'string' ? body.threadId : null;

    if (!summary || !start || !end) {
      return NextResponse.json({ error: 'summary, start, and end are required' }, { status: 400 });
    }

    const wsId = request.headers.get('x-workspace-id');
    let workspaceId: string | null = null;
    if ((contactId || threadId) && !wsId) {
      return NextResponse.json({ error: 'A workspace is required for contact-linked meetings' }, { status: 400 });
    }

    if (wsId) {
      const ctx = await getWorkspaceContext(supabase, user.id, wsId);
      if (!ctx) return NextResponse.json({ error: 'No workspace' }, { status: 403 });
      workspaceId = ctx.workspaceId;
    }

    const createdEvent = await createGoogleCalendarEvent(user.id, {
      calendarId: typeof body.calendarId === 'string' ? body.calendarId : undefined,
      summary,
      description: description || undefined,
      start,
      end,
      timeZone: typeof body.timeZone === 'string' ? body.timeZone : undefined,
      attendees,
      createMeet: body.createMeet !== false,
      sendUpdates: normalizeSendUpdates(body.sendUpdates),
      metadata: {
        source: 'orianna',
        ...(workspaceId ? { workspace_id: workspaceId } : {}),
        ...(contactId ? { contact_id: contactId } : {}),
        ...(threadId ? { thread_id: threadId } : {}),
      },
    });

    const { error: calendarEventError } = await supabase.from('calendar_events').upsert(
      {
        user_id: user.id,
        workspace_id: workspaceId,
        contact_id: contactId,
        thread_id: threadId,
        google_event_id: createdEvent.id,
        calendar_id: createdEvent.calendarId,
        summary,
        description: description || null,
        starts_at: createdEvent.start.dateTime || start,
        ends_at: createdEvent.end.dateTime || end,
        meet_url: createdEvent.meetUrl,
        google_event_url: createdEvent.htmlLink || null,
        status: createdEvent.status === 'cancelled' ? 'cancelled' : 'confirmed',
        metadata: {
          attendees,
          time_zone: typeof body.timeZone === 'string' ? body.timeZone : null,
        },
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,google_event_id' }
    );

    if (calendarEventError) throw calendarEventError;

    if (workspaceId && contactId) {
      await supabase
        .from('contacts')
        .update({
          status: 'meeting_scheduled',
          updated_at: new Date().toISOString(),
        })
        .eq('id', contactId)
        .eq('workspace_id', workspaceId)
        .in('status', ['new', 'contacted', 'engaged', 'qualified']);

      await supabase.from('contact_timeline').insert({
        contact_id: contactId,
        workspace_id: workspaceId,
        event_type: 'meeting_scheduled',
        title: 'RDV Google Meet créé',
        description: summary,
        metadata: {
          google_event_id: createdEvent.id,
          calendar_id: createdEvent.calendarId,
          meet_url: createdEvent.meetUrl,
          google_event_url: createdEvent.htmlLink || null,
          thread_id: threadId,
        },
        created_by: user.id,
      });
    }

    return NextResponse.json({
      event: {
        ...createdEvent,
        meetUrl: createdEvent.meetUrl,
      },
    });
  } catch (error: any) {
    console.error('Google Calendar events POST error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: error.message || 'Failed to create event' }, { status: 500 });
  }
}
