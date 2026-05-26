import { NextRequest, NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase-server';
import { getWorkspaceContext } from '@/lib/workspace';

const RUNNING_SESSION_STATUSES = ['searching', 'enriching'];

function isMissingOutreachEventTable(error: unknown) {
  const err = error as { code?: string; message?: string } | null;
  return err?.code === '42P01'
    || err?.code === 'PGRST205'
    || Boolean(err?.message?.includes('outreach_session_events'));
}

export async function GET(request: NextRequest) {
  try {
    const { supabase, error: clientError } = await createServerClient();
    if (!supabase || clientError) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const wsId = request.headers.get('x-workspace-id');
    const ctx = await getWorkspaceContext(supabase, user.id, wsId);
    if (!ctx) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

    const { data: events, error: eventsError } = await supabase
      .from('outreach_session_events')
      .select(`
        id,
        session_id,
        kind,
        title,
        detail,
        status,
        created_at,
        updated_at,
        session:outreach_sessions(id, prompt, status, error, created_at, updated_at)
      `)
      .eq('workspace_id', ctx.workspaceId)
      .in('status', ['running', 'failed'])
      .order('updated_at', { ascending: false })
      .limit(8);

    if (eventsError && !isMissingOutreachEventTable(eventsError)) throw eventsError;

    const { data: sessions, error: sessionsError } = await supabase
      .from('outreach_sessions')
      .select('id, prompt, status, error, created_at, updated_at')
      .eq('workspace_id', ctx.workspaceId)
      .in('status', RUNNING_SESSION_STATUSES)
      .order('updated_at', { ascending: false })
      .limit(8);

    if (sessionsError) throw sessionsError;

    return NextResponse.json({
      events: eventsError ? [] : events || [],
      sessions: sessions || [],
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load outreach activity';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
