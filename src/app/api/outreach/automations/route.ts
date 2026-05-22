import { NextRequest, NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase-server';
import { getWorkspaceContext } from '@/lib/workspace';

export async function GET(request: NextRequest) {
  try {
    const { supabase, error: clientError } = await createServerClient();
    if (!supabase || clientError) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const wsId = request.headers.get('x-workspace-id');
    const ctx = await getWorkspaceContext(supabase, user.id, wsId);
    if (!ctx) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

    const { data: automations, error } = await supabase
      .from('outreach_automations')
      .select(`
        *,
        sequence:campaign_sequences(id, name, status)
      `)
      .eq('workspace_id', ctx.workspaceId)
      .neq('status', 'archived')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json({ automations: automations || [] });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load automations';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
