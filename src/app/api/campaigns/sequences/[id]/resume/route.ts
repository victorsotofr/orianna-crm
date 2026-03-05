import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { getWorkspaceContext } from '@/lib/workspace';

// POST /api/campaigns/sequences/[id]/resume - Resume all paused enrollments in sequence
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
      .select(`
        id,
        name,
        status,
        steps:campaign_sequence_steps(id, step_order, delay_days)
      `)
      .eq('id', id)
      .eq('workspace_id', ctx.workspaceId)
      .single();

    if (sequenceError || !sequence) {
      return NextResponse.json({ error: 'Sequence not found' }, { status: 404 });
    }

    // Update sequence status to active
    await supabase
      .from('campaign_sequences')
      .update({ status: 'active', updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('workspace_id', ctx.workspaceId);

    // Resume all paused enrollments
    const { data: enrollments, error: enrollError } = await supabase
      .from('campaign_enrollments')
      .select('id, contact_id, current_step_id')
      .eq('sequence_id', id)
      .eq('workspace_id', ctx.workspaceId)
      .eq('status', 'paused');

    if (enrollError) {
      throw enrollError;
    }

    if (enrollments && enrollments.length > 0) {
      const now = new Date();
      const updatedEnrollments: any[] = [];

      // Resume each enrollment and recalculate next_send_at
      for (const enrollment of enrollments) {
        // Find the current step to get delay_days
        const currentStep = sequence.steps?.find((s: any) => s.id === enrollment.current_step_id);
        if (!currentStep) continue;

        // Calculate new next_send_at based on current time + delay_days
        const newNextSendAt = new Date(now);
        newNextSendAt.setDate(newNextSendAt.getDate() + currentStep.delay_days);

        const { data: updated, error: updateError } = await supabase
          .from('campaign_enrollments')
          .update({
            status: 'active',
            next_send_at: newNextSendAt.toISOString(),
          })
          .eq('id', enrollment.id)
          .select('contact_id, next_send_at')
          .single();

        if (updateError) {
          console.error('Failed to resume enrollment:', enrollment.id, updateError);
          continue;
        }

        updatedEnrollments.push(updated);
      }

      // Log timeline events
      const timelineEvents = updatedEnrollments.map(enrollment => ({
        contact_id: enrollment.contact_id,
        event_type: 'sequence_resumed',
        title: `Séquence "${sequence.name}" relancée`,
        description: `Prochain envoi prévu le ${new Date(enrollment.next_send_at).toLocaleDateString('fr-FR')}.`,
        metadata: {
          sequence_id: sequence.id,
          sequence_name: sequence.name,
          new_next_send_at: enrollment.next_send_at,
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
    console.error('Sequence resume error:', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: error.message || 'Failed to resume sequence' },
      { status: 500 }
    );
  }
}
