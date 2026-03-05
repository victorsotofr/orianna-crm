import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { getWorkspaceContext } from '@/lib/workspace';

// POST /api/sequences/[id]/pause-resume - Pause or resume enrollments
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

    const { action, contactIds } = await request.json();

    if (!action || !['pause', 'resume'].includes(action)) {
      return NextResponse.json({ error: 'action must be "pause" or "resume"' }, { status: 400 });
    }

    // Verify sequence exists and belongs to workspace
    const { data: sequence, error: sequenceError } = await supabase
      .from('campaign_sequences')
      .select(`
        id,
        name,
        steps:campaign_sequence_steps(id, step_order, delay_days)
      `)
      .eq('id', id)
      .eq('workspace_id', ctx.workspaceId)
      .single();

    if (sequenceError || !sequence) {
      return NextResponse.json({ error: 'Sequence not found' }, { status: 404 });
    }

    // Build query to find enrollments
    let query = supabase
      .from('campaign_enrollments')
      .select('id, contact_id, current_step_id, next_send_at, status')
      .eq('sequence_id', id)
      .eq('workspace_id', ctx.workspaceId)
      .eq('status', 'active'); // Only affect active enrollments

    // If contactIds provided, filter by them
    if (contactIds && Array.isArray(contactIds) && contactIds.length > 0) {
      query = query.in('contact_id', contactIds);
    }

    const { data: enrollments, error: fetchError } = await query;

    if (fetchError) {
      throw fetchError;
    }

    if (!enrollments || enrollments.length === 0) {
      return NextResponse.json({
        error: 'No active enrollments found',
        affected: 0,
      }, { status: 404 });
    }

    let updatedEnrollments: any[] = [];

    if (action === 'pause') {
      // Pause: change status to 'paused'
      const enrollmentIds = enrollments.map(e => e.id);
      const { data: updated, error: updateError } = await supabase
        .from('campaign_enrollments')
        .update({ status: 'paused' })
        .in('id', enrollmentIds)
        .select();

      if (updateError) {
        throw updateError;
      }

      updatedEnrollments = updated || [];
    } else {
      // Resume: change status back to 'active' and recalculate next_send_at
      const now = new Date();

      // Update each enrollment individually to recalculate next_send_at
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
          .select()
          .single();

        if (updateError) {
          console.error('Failed to resume enrollment:', enrollment.id, updateError);
          continue;
        }

        updatedEnrollments.push(updated);
      }
    }

    // Log timeline events
    const timelineEvents = updatedEnrollments.map(enrollment => ({
      contact_id: enrollment.contact_id,
      event_type: action === 'pause' ? 'sequence_paused' : 'sequence_resumed',
      title: action === 'pause'
        ? `Séquence "${sequence.name}" mise en pause`
        : `Séquence "${sequence.name}" relancée`,
      description: action === 'pause'
        ? 'Les envois automatiques sont suspendus.'
        : `Prochain envoi prévu le ${new Date(enrollment.next_send_at).toLocaleDateString('fr-FR')}.`,
      metadata: {
        sequence_id: sequence.id,
        sequence_name: sequence.name,
        action,
        ...(action === 'resume' && { new_next_send_at: enrollment.next_send_at }),
      },
      created_by: user.id,
      workspace_id: ctx.workspaceId,
    }));

    if (timelineEvents.length > 0) {
      await supabase.from('contact_timeline').insert(timelineEvents);
    }

    return NextResponse.json({
      success: true,
      action,
      affected: updatedEnrollments.length,
      total: enrollments.length,
    });
  } catch (error: any) {
    console.error('Sequence pause/resume error:', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: error.message || 'Failed to pause/resume sequence' },
      { status: 500 }
    );
  }
}
