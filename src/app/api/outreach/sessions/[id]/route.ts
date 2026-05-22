import { NextRequest, NextResponse } from 'next/server';

import { getOutreachSessionBundle } from '@/lib/outreach';
import { createServerClient } from '@/lib/supabase-server';
import { getWorkspaceContext } from '@/lib/workspace';

export async function GET(
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

    const bundle = await getOutreachSessionBundle(supabase, ctx.workspaceId, id);
    if (!bundle.session) return NextResponse.json({ error: 'Outreach session not found' }, { status: 404 });

    return NextResponse.json(bundle);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load outreach session';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
