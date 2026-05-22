import { NextRequest, NextResponse } from 'next/server';

import { getOutreachSession } from '@/lib/outreach';
import { createServerClient } from '@/lib/supabase-server';
import { getWorkspaceContext } from '@/lib/workspace';

function nextMorningIso() {
  const next = new Date();
  next.setDate(next.getDate() + 1);
  next.setHours(8, 0, 0, 0);
  return next.toISOString();
}

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

    const session = await getOutreachSession(supabase, ctx.workspaceId, id);
    if (!session) return NextResponse.json({ error: 'Outreach session not found' }, { status: 404 });

    const body = await request.json().catch(() => ({}));
    const dailyLimit = Number(body.dailyLimit || 20);
    if (!Number.isInteger(dailyLimit) || dailyLimit < 1 || dailyLimit > 100) {
      return NextResponse.json({ error: 'dailyLimit must be between 1 and 100' }, { status: 400 });
    }

    const { data: draft } = await supabase
      .from('outreach_sequence_drafts')
      .select('sequence_id, name')
      .eq('session_id', id)
      .eq('workspace_id', ctx.workspaceId)
      .maybeSingle();

    const sequenceId = typeof body.sequenceId === 'string' ? body.sequenceId : draft?.sequence_id || null;
    const approvalRequired = body.approvalRequired !== false;
    const name = String(body.name || draft?.name || `Automation - ${session.prompt.slice(0, 48)}`).trim();

    const { data: automation, error } = await supabase
      .from('outreach_automations')
      .insert({
        workspace_id: ctx.workspaceId,
        user_id: user.id,
        session_id: id,
        sequence_id: sequenceId,
        name,
        prompt: session.prompt,
        structured_brief: session.structured_brief || {},
        schedule: body.schedule || 'weekday_morning',
        daily_limit: dailyLimit,
        approval_required: approvalRequired,
        enabled: true,
        status: 'active',
        next_run_at: nextMorningIso(),
      })
      .select()
      .single();

    if (error) throw error;

    await supabase
      .from('workspaces')
      .update({
        gtm_enabled: true,
        gtm_daily_contact_limit: dailyLimit,
        gtm_requires_approval: approvalRequired,
        gtm_active_sequence_id: sequenceId,
        gtm_icp_queries: [session.prompt],
      })
      .eq('id', ctx.workspaceId);

    await supabase
      .from('outreach_sessions')
      .update({ status: 'automated', updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('workspace_id', ctx.workspaceId);

    return NextResponse.json({ automation });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create automation';
    console.error('Outreach automate error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
