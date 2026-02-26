import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

export async function GET(request: NextRequest) {
  try {
    const { supabase, error: clientError } = await createServerClient();
    if (clientError || !supabase) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: sequences, error } = await supabase
      .from('sequences')
      .select(`
        *,
        sequence_steps (id),
        team_members!sequences_created_by_fkey (display_name)
      `)
      .order('created_at', { ascending: false });

    if (error) {
      // Fallback without join
      const { data: basicSeqs, error: basicError } = await supabase
        .from('sequences')
        .select('*')
        .order('created_at', { ascending: false });
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
    console.error('Sequences list error:', error);
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
    const { name, description } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const { data: sequence, error } = await supabase
      .from('sequences')
      .insert({
        name: name.trim(),
        description: description?.trim() || null,
        status: 'draft',
        created_by: user.id,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ sequence });
  } catch (error: any) {
    console.error('Sequence create error:', error);
    return NextResponse.json({ error: error.message || 'Failed to create sequence' }, { status: 500 });
  }
}
