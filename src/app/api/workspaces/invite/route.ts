import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { getWorkspaceContext } from '@/lib/workspace';

export async function POST(request: Request) {
  try {
    const { supabase, error: clientError } = await createServerClient();
    if (clientError || !supabase) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const wsId = request.headers.get('x-workspace-id');
    const ctx = await getWorkspaceContext(supabase, user.id, wsId);
    if (!ctx || ctx.role !== 'admin') {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const { email } = await request.json();
    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    // Check if already a member
    const { data: existingMember } = await supabase
      .from('workspace_members')
      .select('id')
      .eq('workspace_id', ctx.workspaceId)
      .eq('email', email.toLowerCase())
      .maybeSingle();

    if (existingMember) {
      return NextResponse.json({ error: 'Already a member' }, { status: 409 });
    }

    // Check for pending invitation
    const { data: existingInvite } = await supabase
      .from('workspace_invitations')
      .select('id')
      .eq('workspace_id', ctx.workspaceId)
      .eq('email', email.toLowerCase())
      .eq('status', 'pending')
      .maybeSingle();

    if (existingInvite) {
      return NextResponse.json({ error: 'Invitation already pending' }, { status: 409 });
    }

    // Create invitation
    const { data: invitation, error } = await supabase
      .from('workspace_invitations')
      .insert({
        workspace_id: ctx.workspaceId,
        email: email.toLowerCase(),
        invited_by: user.id,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ invitation }, { status: 201 });
  } catch (error: any) {
    console.error('Invitation create error:', error);
    return NextResponse.json({ error: error.message || 'Failed to create invitation' }, { status: 500 });
  }
}
