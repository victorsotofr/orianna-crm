import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

export async function GET() {
  try {
    const { supabase, error: clientError } = await createServerClient();
    if (clientError || !supabase) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let query = supabase
      .from('sequences')
      .select(`
        *,
        sequence_steps (id),
        team_members!sequences_created_by_fkey (display_name)
      `)
      .order('created_at', { ascending: false });

    const { data: sequences, error } = await query;

    if (error) {
      // Fallback without join
      let fallbackQuery = supabase
        .from('sequences')
        .select('*')
        .order('created_at', { ascending: false });
      const { data: basicSeqs, error: basicError } = await fallbackQuery;
      if (basicError) throw basicError;
      return NextResponse.json({
        sequences: (basicSeqs || []).map(seq => ({
          ...seq,
          step_count: 0,
          enrollment_count: 0,
          created_by_name: null,
        })),
      });
    }

    // Enrich with enrollment counts
    const enriched = await Promise.all(
      (sequences || []).map(async (seq) => {
        const { count } = await supabase
          .from('sequence_enrollments')
          .select('*', { count: 'exact', head: true })
          .eq('sequence_id', seq.id);

        return {
          ...seq,
          step_count: seq.sequence_steps?.length || 0,
          enrollment_count: count || 0,
          created_by_name: seq.team_members?.display_name || null,
        };
      })
    );

    return NextResponse.json({ sequences: enriched });
  } catch (error: any) {
    console.error('Sequences list error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: error.message || 'Failed to fetch sequences' }, { status: 500 });
  }
}

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

    const body = await request.json();
    const { name, steps } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Le nom est obligatoire' }, { status: 400 });
    }

    // Validate 3 steps
    if (!steps || !Array.isArray(steps) || steps.length !== 3) {
      return NextResponse.json({ error: 'La séquence doit contenir exactement 3 étapes' }, { status: 400 });
    }

    // Validate each step has a template_id
    for (let i = 0; i < steps.length; i++) {
      if (!steps[i].template_id) {
        return NextResponse.json({ error: `L'étape ${i + 1} doit avoir un template` }, { status: 400 });
      }
    }

    // Validate step 1 delay is 0
    if (steps[0].delay_days !== 0) {
      return NextResponse.json({ error: "L'étape 1 doit avoir un délai de 0 (envoi immédiat)" }, { status: 400 });
    }

    // Validate steps 2 and 3 have delay > 0
    if (!steps[1].delay_days || steps[1].delay_days < 1) {
      return NextResponse.json({ error: "L'étape 2 doit avoir un délai d'au moins 1 jour" }, { status: 400 });
    }
    if (!steps[2].delay_days || steps[2].delay_days < 1) {
      return NextResponse.json({ error: "L'étape 3 doit avoir un délai d'au moins 1 jour" }, { status: 400 });
    }

    // 1. Create the sequence
    const { data: sequence, error: seqError } = await supabase
      .from('sequences')
      .insert({
        name: name.trim(),
        status: 'draft',
        created_by: user.id,
      })
      .select()
      .single();

    if (seqError) throw seqError;

    // 2. Create the 3 steps
    const { error: stepsError } = await supabase
      .from('sequence_steps')
      .insert([
        {
          sequence_id: sequence.id,
          step_order: 1,
          step_type: 'email',
          template_id: steps[0].template_id,
          delay_days: 0,
        },
        {
          sequence_id: sequence.id,
          step_order: 2,
          step_type: 'email',
          template_id: steps[1].template_id,
          delay_days: steps[1].delay_days,
        },
        {
          sequence_id: sequence.id,
          step_order: 3,
          step_type: 'email',
          template_id: steps[2].template_id,
          delay_days: steps[2].delay_days,
        },
      ]);

    if (stepsError) {
      // Clean up the sequence if steps failed
      await supabase.from('sequences').delete().eq('id', sequence.id);
      throw stepsError;
    }

    return NextResponse.json({ sequence });
  } catch (error: any) {
    console.error('Sequence create error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: error.message || 'Failed to create sequence' }, { status: 500 });
  }
}
