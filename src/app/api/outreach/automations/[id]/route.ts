import { NextRequest, NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase-server';
import { getWorkspaceContext } from '@/lib/workspace';

export async function PATCH(
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
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (body.status !== undefined) {
      if (!['active', 'paused', 'archived'].includes(body.status)) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
      }
      updates.status = body.status;
      updates.enabled = body.status === 'active';
    }
    if (typeof body.enabled === 'boolean') updates.enabled = body.enabled;
    if (body.dailyLimit !== undefined) {
      const dailyLimit = Number(body.dailyLimit);
      if (!Number.isInteger(dailyLimit) || dailyLimit < 1 || dailyLimit > 100) {
        return NextResponse.json({ error: 'dailyLimit must be between 1 and 100' }, { status: 400 });
      }
      updates.daily_limit = dailyLimit;
    }
    if (typeof body.approvalRequired === 'boolean') updates.approval_required = body.approvalRequired;

    const { data: automation, error } = await supabase
      .from('outreach_automations')
      .update(updates)
      .eq('id', id)
      .eq('workspace_id', ctx.workspaceId)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ automation });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update automation';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
