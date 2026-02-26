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

    // Validate sequence has at least one step
    const { count: stepCount } = await supabase
      .from('sequence_steps')
      .select('*', { count: 'exact', head: true })
      .eq('sequence_id', id);

    if (!stepCount || stepCount === 0) {
      return NextResponse.json(
        { error: 'Sequence must have at least one step before activation' },
        { status: 400 }
      );
    }

    const { data: sequence, error } = await supabase
      .from('sequences')
      .update({ status: 'active', updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    // Activate paused enrollments so they get picked up by process-sequences
    const { data: firstStep } = await supabase
      .from('sequence_steps')
      .select('delay_days')
      .eq('sequence_id', id)
      .order('step_order', { ascending: true })
      .limit(1)
      .single();

    const delayMs = (firstStep?.delay_days || 0) * 24 * 60 * 60 * 1000;
    const nextActionAt = new Date(Date.now() + delayMs).toISOString();

    await supabase
      .from('sequence_enrollments')
      .update({ status: 'active', next_action_at: nextActionAt })
      .eq('sequence_id', id)
      .eq('status', 'paused');

    return NextResponse.json({ sequence });
  } catch (error: any) {
    console.error('Sequence activate error:', error);
    return NextResponse.json({ error: error.message || 'Failed to activate sequence' }, { status: 500 });
  }
}
