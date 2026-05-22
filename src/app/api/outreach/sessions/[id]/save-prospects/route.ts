import { NextRequest, NextResponse } from 'next/server';

import { saveSessionProspectsAsContacts } from '@/lib/outreach';
import { createServerClient } from '@/lib/supabase-server';
import { getWorkspaceContext } from '@/lib/workspace';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { supabase, error: clientError } = await createServerClient();
    if (!supabase || clientError) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const wsId = request.headers.get('x-workspace-id');
    const ctx = await getWorkspaceContext(supabase, user.id, wsId);
    if (!ctx) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

    const body = await request.json().catch(() => ({}));
    const prospectIds = Array.isArray(body.prospectIds)
      ? body.prospectIds.filter((value: unknown): value is string => typeof value === 'string')
      : undefined;

    const result = await saveSessionProspectsAsContacts({
      db: supabase,
      workspaceId: ctx.workspaceId,
      userId: user.id,
      sessionId: id,
      prospectIds,
    });

    await supabase
      .from('outreach_sessions')
      .update({ status: 'saved', updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('workspace_id', ctx.workspaceId);

    return NextResponse.json({ saved: result.contactIds.length, skipped: result.skipped });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to save prospects';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
