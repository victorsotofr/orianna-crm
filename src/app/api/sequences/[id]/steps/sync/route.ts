import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
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

    // Verify sequence exists
    const { data: sequence, error: seqError } = await supabase
      .from('sequences')
      .select('id')
      .eq('id', id)
      .single();

    if (seqError || !sequence) {
      return NextResponse.json({ error: 'Sequence not found' }, { status: 404 });
    }

    const { steps } = await request.json();

    if (!Array.isArray(steps)) {
      return NextResponse.json({ error: 'Steps must be an array' }, { status: 400 });
    }

    // Delete all existing steps for this sequence
    const { error: deleteError } = await supabase
      .from('sequence_steps')
      .delete()
      .eq('sequence_id', id);

    if (deleteError) throw deleteError;

    // Insert new steps
    if (steps.length > 0) {
      const stepsToInsert = steps.map((step: any) => ({
        sequence_id: id,
        step_order: step.step_order,
        step_type: step.step_type,
        template_id: step.template_id || null,
        template_b_id: step.template_b_id || null,
        ab_split_pct: step.ab_split_pct ?? 50,
        delay_days: step.delay_days || 0,
        instructions: step.instructions || null,
      }));

      const { error: insertError } = await supabase
        .from('sequence_steps')
        .insert(stepsToInsert);

      if (insertError) throw insertError;
    }

    return NextResponse.json({ success: true, count: steps.length });
  } catch (error: any) {
    console.error('Steps sync error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: error.message || 'Failed to sync steps' }, { status: 500 });
  }
}
