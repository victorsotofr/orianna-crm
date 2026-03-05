import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { getWorkspaceContext } from '@/lib/workspace';

// GET /api/sequences - List all sequences for workspace
export async function GET(request: Request) {
  try {
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

    // Fetch sequences with their steps
    const { data: sequences, error } = await supabase
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
      .eq('workspace_id', ctx.workspaceId)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    // Sort steps by step_order for each sequence
    const sequencesWithSortedSteps = sequences?.map(seq => ({
      ...seq,
      steps: seq.steps?.sort((a: any, b: any) => a.step_order - b.step_order) || [],
    })) || [];

    return NextResponse.json({ sequences: sequencesWithSortedSteps });
  } catch (error: any) {
    console.error('Sequences fetch error:', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch sequences' },
      { status: 500 }
    );
  }
}

// POST /api/sequences - Create a new sequence with steps
export async function POST(request: Request) {
  try {
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
    const {
      name,
      template_variables,
      steps, // Array of { template_id, step_order, delay_days }
    } = body;

    // Validation
    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }
    if (!steps || !Array.isArray(steps) || steps.length === 0 || steps.length > 3) {
      return NextResponse.json({ error: 'steps must be an array with 1-3 items' }, { status: 400 });
    }

    // Validate each step
    for (const step of steps) {
      if (!step.template_id) {
        return NextResponse.json({ error: 'Each step must have template_id' }, { status: 400 });
      }
      if (step.step_order == null || step.step_order < 0 || step.step_order > 2) {
        return NextResponse.json({ error: 'step_order must be 0, 1, or 2' }, { status: 400 });
      }
      if (step.delay_days == null || step.delay_days < 0) {
        return NextResponse.json({ error: 'delay_days must be >= 0' }, { status: 400 });
      }

      // Verify template belongs to workspace
      const { data: template, error: templateError } = await supabase
        .from('templates')
        .select('id')
        .eq('id', step.template_id)
        .eq('workspace_id', ctx.workspaceId)
        .single();

      if (templateError || !template) {
        return NextResponse.json({ error: `Template ${step.template_id} not found` }, { status: 404 });
      }
    }

    // Create sequence
    const { data: sequence, error: sequenceError } = await supabase
      .from('campaign_sequences')
      .insert({
        workspace_id: ctx.workspaceId,
        name,
        template_variables,
        created_by: user.id,
        status: 'draft',
      })
      .select()
      .single();

    if (sequenceError) {
      throw sequenceError;
    }

    // Create steps
    const stepsToInsert = steps.map((step: any) => ({
      sequence_id: sequence.id,
      template_id: step.template_id,
      step_order: step.step_order,
      delay_days: step.delay_days,
    }));

    const { data: insertedSteps, error: stepsError } = await supabase
      .from('campaign_sequence_steps')
      .insert(stepsToInsert)
      .select(`
        *,
        template:templates(id, name, subject)
      `);

    if (stepsError) {
      // Rollback: delete the sequence
      await supabase.from('campaign_sequences').delete().eq('id', sequence.id);
      throw stepsError;
    }

    return NextResponse.json({
      sequence: {
        ...sequence,
        steps: insertedSteps.sort((a, b) => a.step_order - b.step_order),
      },
    }, { status: 201 });
  } catch (error: any) {
    console.error('Sequence creation error:', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: error.message || 'Failed to create sequence' },
      { status: 500 }
    );
  }
}
