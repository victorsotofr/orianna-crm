import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: sequenceId } = await params;
    const { supabase, error: clientError } = await createServerClient();
    if (clientError || !supabase) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { step_type, template_id, delay_days, instructions } = body;

    // Get current max step_order
    const { data: existingSteps } = await supabase
      .from('sequence_steps')
      .select('step_order')
      .eq('sequence_id', sequenceId)
      .order('step_order', { ascending: false })
      .limit(1);

    const nextOrder = (existingSteps?.[0]?.step_order || 0) + 1;

    const { data: step, error } = await supabase
      .from('sequence_steps')
      .insert({
        sequence_id: sequenceId,
        step_order: nextOrder,
        step_type: step_type || 'email',
        template_id: template_id || null,
        delay_days: delay_days || 0,
        instructions: instructions || null,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ step });
  } catch (error: any) {
    console.error('Step create error:', error);
    return NextResponse.json({ error: error.message || 'Failed to create step' }, { status: 500 });
  }
}
