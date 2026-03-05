import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { getWorkspaceContext } from '@/lib/workspace';

// GET /api/sequences/[id] - Get single sequence with steps
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const { supabase, error: clientError } = await createServerClient();
    if (!supabase || clientError) {
      return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const wsId = request.headers.get('x-workspace-id');
    const ctx = await getWorkspaceContext(supabase, user.id, wsId);
    if (!ctx) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

    const { data: sequence, error } = await supabase
      .from('campaign_sequences')
      .select(`
        *,
        steps:campaign_sequence_steps(
          id,
          template_id,
          step_order,
          delay_days,
          template:templates(id, name, subject)
        )
      `)
      .eq('id', id)
      .eq('workspace_id', ctx.workspaceId)
      .single();

    if (error || !sequence) {
      return NextResponse.json({ error: 'Sequence not found' }, { status: 404 });
    }

    // Sort steps by step_order
    const sequenceWithSortedSteps = {
      ...sequence,
      steps: sequence.steps?.sort((a: any, b: any) => a.step_order - b.step_order) || [],
    };

    return NextResponse.json({ sequence: sequenceWithSortedSteps });
  } catch (error: any) {
    console.error('Sequence fetch error:', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch sequence' },
      { status: 500 }
    );
  }
}

// PATCH /api/sequences/[id] - Update sequence metadata
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const { supabase, error: clientError } = await createServerClient();
    if (!supabase || clientError) {
      return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const wsId = request.headers.get('x-workspace-id');
    const ctx = await getWorkspaceContext(supabase, user.id, wsId);
    if (!ctx) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

    const body = await request.json();
    const { name, template_variables, status } = body;

    // Verify sequence exists and belongs to workspace
    const { data: existingSequence, error: fetchError } = await supabase
      .from('campaign_sequences')
      .select('id')
      .eq('id', id)
      .eq('workspace_id', ctx.workspaceId)
      .single();

    if (fetchError || !existingSequence) {
      return NextResponse.json({ error: 'Sequence not found' }, { status: 404 });
    }

    // Build update object with only provided fields
    const updates: any = {};
    if (name !== undefined) updates.name = name;
    if (template_variables !== undefined) updates.template_variables = template_variables;
    if (status !== undefined) {
      const validStatuses = ['draft', 'active', 'paused', 'archived'];
      if (!validStatuses.includes(status)) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
      }
      updates.status = status;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    updates.updated_at = new Date().toISOString();

    // Update sequence
    const { data: sequence, error: updateError } = await supabase
      .from('campaign_sequences')
      .update(updates)
      .eq('id', id)
      .eq('workspace_id', ctx.workspaceId)
      .select(`
        *,
        steps:campaign_sequence_steps(
          id,
          template_id,
          step_order,
          delay_days,
          template:templates(id, name, subject)
        )
      `)
      .single();

    if (updateError) {
      throw updateError;
    }

    // Sort steps by step_order
    const sequenceWithSortedSteps = {
      ...sequence,
      steps: sequence.steps?.sort((a: any, b: any) => a.step_order - b.step_order) || [],
    };

    return NextResponse.json({ sequence: sequenceWithSortedSteps });
  } catch (error: any) {
    console.error('Sequence update error:', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: error.message || 'Failed to update sequence' },
      { status: 500 }
    );
  }
}

// DELETE /api/sequences/[id] - Delete sequence and all steps
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const { supabase, error: clientError } = await createServerClient();
    if (!supabase || clientError) {
      return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const wsId = request.headers.get('x-workspace-id');
    const ctx = await getWorkspaceContext(supabase, user.id, wsId);
    if (!ctx) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

    // Verify sequence exists and belongs to workspace
    const { data: sequence, error: fetchError } = await supabase
      .from('campaign_sequences')
      .select('id')
      .eq('id', id)
      .eq('workspace_id', ctx.workspaceId)
      .single();

    if (fetchError || !sequence) {
      return NextResponse.json({ error: 'Sequence not found' }, { status: 404 });
    }

    // Delete sequence (cascade will delete steps and enrollments)
    const { error: deleteError } = await supabase
      .from('campaign_sequences')
      .delete()
      .eq('id', id)
      .eq('workspace_id', ctx.workspaceId);

    if (deleteError) {
      throw deleteError;
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Sequence deletion error:', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete sequence' },
      { status: 500 }
    );
  }
}
