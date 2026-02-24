import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { supabase, error: clientError } = await createServerClient();
    if (clientError || !supabase) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { action } = body;

    if (!action) {
      return NextResponse.json({ error: 'action is required' }, { status: 400 });
    }

    // Get current enrollment
    const { data: enrollment, error: fetchError } = await supabase
      .from('sequence_enrollments')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !enrollment) {
      return NextResponse.json({ error: 'Enrollment not found' }, { status: 404 });
    }

    const updates: Record<string, any> = {};

    switch (action) {
      case 'pause':
        updates.status = 'paused';
        break;

      case 'resume':
        updates.status = 'active';
        // Recalculate next_action_at from now
        updates.next_action_at = new Date().toISOString();
        break;

      case 'unenroll':
        updates.status = 'unenrolled';
        updates.completed_at = new Date().toISOString();
        break;

      case 'complete_manual_step': {
        // Advance to next step
        const nextStepOrder = enrollment.current_step_order + 1;

        // Get next step
        const { data: nextStep } = await supabase
          .from('sequence_steps')
          .select('*')
          .eq('sequence_id', enrollment.sequence_id)
          .eq('step_order', nextStepOrder + 1)
          .single();

        if (nextStep) {
          const nextActionAt = new Date();
          nextActionAt.setDate(nextActionAt.getDate() + (nextStep.delay_days || 0));
          updates.current_step_order = nextStepOrder;
          updates.next_action_at = nextActionAt.toISOString();
        } else {
          // No more steps
          updates.status = 'completed';
          updates.current_step_order = nextStepOrder;
          updates.completed_at = new Date().toISOString();
        }

        // Add timeline entry
        await supabase.from('contact_timeline').insert({
          contact_id: enrollment.contact_id,
          event_type: 'manual_task',
          title: 'Tâche manuelle complétée',
          metadata: { sequence_id: enrollment.sequence_id, step_order: enrollment.current_step_order },
          created_by: user.id,
        });
        break;
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

    const { data: updated, error } = await supabase
      .from('sequence_enrollments')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ enrollment: updated });
  } catch (error: any) {
    console.error('Enrollment update error:', error);
    return NextResponse.json({ error: error.message || 'Failed to update enrollment' }, { status: 500 });
  }
}
