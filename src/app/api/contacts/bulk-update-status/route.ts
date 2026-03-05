import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { getWorkspaceContext } from '@/lib/workspace';

export async function POST(request: NextRequest) {
  const { supabase, error: authError } = await createServerClient();
  if (authError || !supabase) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const wsId = request.headers.get('x-workspace-id');
  const ctx = await getWorkspaceContext(supabase, user.id, wsId);

  if (!ctx) {
    return NextResponse.json({ error: 'No workspace access' }, { status: 403 });
  }

  const body = await request.json();
  const { contact_ids, status } = body;

  if (!contact_ids || !Array.isArray(contact_ids) || contact_ids.length === 0) {
    return NextResponse.json({ error: 'contact_ids array is required' }, { status: 400 });
  }

  if (!status) {
    return NextResponse.json({ error: 'status is required' }, { status: 400 });
  }

  // Validate status value
  const validStatuses = ['new', 'contacted', 'engaged', 'qualified', 'meeting_scheduled', 'opportunity', 'customer', 'lost', 'do_not_contact'];
  if (!validStatuses.includes(status)) {
    return NextResponse.json({ error: 'Invalid status value' }, { status: 400 });
  }

  try {
    const { error: updateError } = await supabase
      .from('contacts')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('workspace_id', ctx.workspaceId)
      .in('id', contact_ids);

    if (updateError) {
      console.error('Bulk update status error:', updateError);
      return NextResponse.json({ error: 'Failed to update contacts' }, { status: 500 });
    }

    return NextResponse.json({ success: true, updated: contact_ids.length });
  } catch (error) {
    console.error('Bulk update status error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
