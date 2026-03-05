import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { getWorkspaceContext } from '@/lib/workspace';

// POST /api/campaigns/sequences/[id]/pause - Pause all active enrollments in sequence
export async function POST(
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
    const { data: sequence, error: sequenceError } = await supabase
      .from('campaign_sequences')
      .select('id, name, status')
      .eq('id', id)
      .eq('workspace_id', ctx.workspaceId)
      .single();

    if (sequenceError || !sequence) {
      return NextResponse.json({ error: 'Sequence not found' }, { status: 404 });
    }

    // Update sequence status to paused
    await supabase
      .from('campaign_sequences')
      .update({ status: 'paused', updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('workspace_id', ctx.workspaceId);

    // Pause all active enrollments
    const { data: enrollments, error: enrollError } = await supabase
      .from('campaign_enrollments')
      .select('id, contact_id')
      .eq('sequence_id', id)
      .eq('workspace_id', ctx.workspaceId)
      .eq('status', 'active');

    if (enrollError) {
      throw enrollError;
    }

    if (enrollments && enrollments.length > 0) {
      const enrollmentIds = enrollments.map(e => e.id);
      await supabase
        .from('campaign_enrollments')
        .update({ status: 'paused' })
        .in('id', enrollmentIds);

      // Log timeline events
      const timelineEvents = enrollments.map(enrollment => ({
        contact_id: enrollment.contact_id,
        event_type: 'sequence_paused',
        title: `Séquence "${sequence.name}" mise en pause`,
        description: 'Les envois automatiques sont suspendus.',
        metadata: {
          sequence_id: sequence.id,
          sequence_name: sequence.name,
        },
        created_by: user.id,
        workspace_id: ctx.workspaceId,
      }));

      await supabase.from('contact_timeline').insert(timelineEvents);
    }

    return NextResponse.json({
      success: true,
      affected: enrollments?.length || 0,
    });
  } catch (error: any) {
    console.error('Sequence pause error:', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: error.message || 'Failed to pause sequence' },
      { status: 500 }
    );
  }
}
