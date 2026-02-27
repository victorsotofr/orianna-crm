import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string; stepId: string }> }) {
  try {
    const { id: sequenceId, stepId } = await params;
    const { supabase, error: clientError } = await createServerClient();
    if (clientError || !supabase) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const updates: Record<string, any> = {};

    if ('step_type' in body) updates.step_type = body.step_type;
    if ('template_id' in body) updates.template_id = body.template_id;
    if ('delay_days' in body) updates.delay_days = body.delay_days;
    if ('instructions' in body) updates.instructions = body.instructions;
    if ('step_order' in body) updates.step_order = body.step_order;

    const { data: step, error } = await supabase
      .from('sequence_steps')
      .update(updates)
      .eq('id', stepId)
      .eq('sequence_id', sequenceId)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ step });
  } catch (error: any) {
    console.error('Step update error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: error.message || 'Failed to update step' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; stepId: string }> }) {
  try {
    const { id: sequenceId, stepId } = await params;
    const { supabase, error: clientError } = await createServerClient();
    if (clientError || !supabase) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get the step being deleted to know its order
    const { data: deletedStep } = await supabase
      .from('sequence_steps')
      .select('step_order')
      .eq('id', stepId)
      .single();

    // Delete the step
    const { error } = await supabase
      .from('sequence_steps')
      .delete()
      .eq('id', stepId)
      .eq('sequence_id', sequenceId);

    if (error) throw error;

    // Reorder remaining steps
    if (deletedStep) {
      const { data: remainingSteps } = await supabase
        .from('sequence_steps')
        .select('id, step_order')
        .eq('sequence_id', sequenceId)
        .gt('step_order', deletedStep.step_order)
        .order('step_order', { ascending: true });

      if (remainingSteps) {
        for (const step of remainingSteps) {
          await supabase
            .from('sequence_steps')
            .update({ step_order: step.step_order - 1 })
            .eq('id', step.id);
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Step delete error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: error.message || 'Failed to delete step' }, { status: 500 });
  }
}
