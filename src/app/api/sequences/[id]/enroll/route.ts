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
    const { contact_ids } = body;

    if (!contact_ids || !Array.isArray(contact_ids) || contact_ids.length === 0) {
      return NextResponse.json({ error: 'contact_ids array is required' }, { status: 400 });
    }

    // Verify sequence exists
    const { data: sequence } = await supabase
      .from('sequences')
      .select('status')
      .eq('id', sequenceId)
      .single();

    if (!sequence) {
      return NextResponse.json({ error: 'Sequence not found' }, { status: 404 });
    }

    // Enrollment status depends on sequence status:
    // active → enrollment is 'active' (emails will be sent)
    // draft/paused → enrollment is 'paused' (queued, will start when sequence is activated)
    const enrollmentStatus = sequence.status === 'active' ? 'active' : 'paused';

    // Get first step to calculate next_action_at
    const { data: firstStep } = await supabase
      .from('sequence_steps')
      .select('delay_days')
      .eq('sequence_id', sequenceId)
      .order('step_order', { ascending: true })
      .limit(1)
      .single();

    const now = new Date();
    const nextActionAt = new Date(now.getTime() + (firstStep?.delay_days || 0) * 24 * 60 * 60 * 1000);

    let enrolled = 0;
    let skipped = 0;

    for (const contactId of contact_ids) {
      const { error: enrollError } = await supabase
        .from('sequence_enrollments')
        .insert({
          sequence_id: sequenceId,
          contact_id: contactId,
          status: enrollmentStatus,
          current_step_order: 0,
          next_action_at: nextActionAt.toISOString(),
          enrolled_by: user.id,
        });

      if (enrollError) {
        // Likely duplicate (already enrolled)
        skipped++;
        continue;
      }

      enrolled++;

      // Add timeline entry
      await supabase.from('contact_timeline').insert({
        contact_id: contactId,
        event_type: 'enrolled',
        title: 'Inscrit dans une séquence',
        metadata: { sequence_id: sequenceId },
        created_by: user.id,
      });

      // Update contact status if new
      await supabase
        .from('contacts')
        .update({ status: 'contacted', last_contacted_at: now.toISOString() })
        .eq('id', contactId)
        .eq('status', 'new');
    }

    return NextResponse.json({ enrolled, skipped });
  } catch (error: any) {
    console.error('Enroll error:', error);
    return NextResponse.json({ error: error.message || 'Failed to enroll contacts' }, { status: 500 });
  }
}
