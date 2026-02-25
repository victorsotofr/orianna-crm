import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
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

    const { data: sequence, error } = await supabase
      .from('sequences')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !sequence) {
      return NextResponse.json({ error: 'Sequence not found' }, { status: 404 });
    }

    // Get steps with template names
    const { data: steps } = await supabase
      .from('sequence_steps')
      .select(`
        *,
        templates (id, name, subject)
      `)
      .eq('sequence_id', id)
      .order('step_order', { ascending: true });

    // Get enrollment stats
    const { count: activeCount } = await supabase
      .from('sequence_enrollments')
      .select('*', { count: 'exact', head: true })
      .eq('sequence_id', id)
      .eq('status', 'active');

    const { count: completedCount } = await supabase
      .from('sequence_enrollments')
      .select('*', { count: 'exact', head: true })
      .eq('sequence_id', id)
      .eq('status', 'completed');

    const { count: totalEnrolled } = await supabase
      .from('sequence_enrollments')
      .select('*', { count: 'exact', head: true })
      .eq('sequence_id', id);

    // Get enrolled contact IDs (for duplicate prevention in UI)
    const { data: enrollments } = await supabase
      .from('sequence_enrollments')
      .select('contact_id')
      .eq('sequence_id', id)
      .in('status', ['active', 'paused']);

    return NextResponse.json({
      sequence,
      steps: steps || [],
      stats: {
        active: activeCount || 0,
        completed: completedCount || 0,
        total: totalEnrolled || 0,
      },
      enrolledContactIds: (enrollments || []).map(e => e.contact_id),
    });
  } catch (error: any) {
    console.error('Sequence detail error:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch sequence' }, { status: 500 });
  }
}

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
    const updates: Record<string, any> = {};

    if ('name' in body) updates.name = body.name;
    if ('description' in body) updates.description = body.description;
    if ('status' in body) updates.status = body.status;
    updates.updated_at = new Date().toISOString();

    const { data: sequence, error } = await supabase
      .from('sequences')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ sequence });
  } catch (error: any) {
    console.error('Sequence update error:', error);
    return NextResponse.json({ error: error.message || 'Failed to update sequence' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
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

    // Archive instead of hard delete
    const { error } = await supabase
      .from('sequences')
      .update({ status: 'archived', updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Sequence delete error:', error);
    return NextResponse.json({ error: error.message || 'Failed to delete sequence' }, { status: 500 });
  }
}
