import { NextResponse } from 'next/server';

import { deleteGoogleCalendarEvent } from '@/lib/google-calendar';
import { createServerClient } from '@/lib/supabase-server';
import { getWorkspaceContext } from '@/lib/workspace';

function normalizeSendUpdates(value: string | null): 'all' | 'externalOnly' | 'none' {
  if (value === 'all' || value === 'externalOnly') return value;
  return 'none';
}

export async function DELETE(request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  try {
    const { eventId } = await params;
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
    const wsId = request.headers.get('x-workspace-id');
    let workspaceId: string | null = null;

    if (wsId) {
      const ctx = await getWorkspaceContext(supabase, user.id, wsId);
      if (!ctx) return NextResponse.json({ error: 'No workspace' }, { status: 403 });
      workspaceId = ctx.workspaceId;
    }

    const { data: localEvent, error: localEventError } = await supabase
      .from('calendar_events')
      .select('id, workspace_id, contact_id, thread_id, summary, calendar_id')
      .eq('user_id', user.id)
      .eq('google_event_id', eventId)
      .maybeSingle();

    if (localEventError) throw localEventError;
    if (workspaceId && localEvent?.workspace_id && localEvent.workspace_id !== workspaceId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const result = await deleteGoogleCalendarEvent(user.id, {
      eventId,
      calendarId: searchParams.get('calendarId') || localEvent?.calendar_id || undefined,
      sendUpdates: normalizeSendUpdates(searchParams.get('sendUpdates')),
    });

    if (localEvent?.id) {
      const { error: updateError } = await supabase
        .from('calendar_events')
        .update({
          status: 'deleted',
          updated_at: new Date().toISOString(),
        })
        .eq('id', localEvent.id);

      if (updateError) throw updateError;

      if (localEvent.workspace_id && localEvent.contact_id) {
        await supabase.from('contact_timeline').insert({
          contact_id: localEvent.contact_id,
          workspace_id: localEvent.workspace_id,
          event_type: 'meeting_deleted',
          title: 'RDV Google Meet supprimé',
          description: localEvent.summary,
          metadata: {
            google_event_id: eventId,
            calendar_id: localEvent.calendar_id,
            thread_id: localEvent.thread_id,
          },
          created_by: user.id,
        });
      }
    }

    return NextResponse.json({ success: true, result });
  } catch (error: any) {
    console.error('Google Calendar event DELETE error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: error.message || 'Failed to delete event' }, { status: 500 });
  }
}
