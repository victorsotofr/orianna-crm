import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { getWorkspaceContext } from '@/lib/workspace';

export const maxDuration = 30;

// POST /api/sequences/[id]/launch - Enroll contacts in sequence
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

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

    const { contactIds } = await request.json();

    if (!contactIds || !Array.isArray(contactIds) || contactIds.length === 0) {
      return NextResponse.json({ error: 'No contacts selected' }, { status: 400 });
    }

    // Fetch sequence with steps
    const { data: sequence, error: sequenceError } = await supabase
      .from('campaign_sequences')
      .select(`
        *,
        steps:campaign_sequence_steps(
          id,
          template_id,
          step_order,
          delay_days
        )
      `)
      .eq('id', id)
      .eq('workspace_id', ctx.workspaceId)
      .single();

    if (sequenceError || !sequence) {
      return NextResponse.json({ error: 'Sequence not found' }, { status: 404 });
    }

    if (sequence.status !== 'active') {
      return NextResponse.json({
        error: 'Sequence must be active to enroll contacts. Current status: ' + sequence.status,
      }, { status: 400 });
    }

    if (!sequence.steps || sequence.steps.length === 0) {
      return NextResponse.json({ error: 'Sequence has no steps configured' }, { status: 400 });
    }

    // Sort steps by step_order to get the first step
    const sortedSteps = sequence.steps.sort((a: any, b: any) => a.step_order - b.step_order);
    const firstStep = sortedSteps[0];

    // Fetch contacts and filter out ineligible ones
    const { data: allContacts, error: contactsError } = await supabase
      .from('contacts')
      .select('*')
      .in('id', contactIds)
      .eq('workspace_id', ctx.workspaceId);

    if (contactsError) {
      throw contactsError;
    }

    if (!allContacts || allContacts.length === 0) {
      return NextResponse.json({ error: 'No contacts found' }, { status: 404 });
    }

    // Filter contacts: exclude those who replied or have certain statuses
    const excludedStatuses = ['engaged', 'qualified', 'lost', 'do_not_contact', 'customer'];
    const eligibleContacts = allContacts.filter(
      contact => !contact.replied_at && !excludedStatuses.includes(contact.status)
    );

    if (eligibleContacts.length === 0) {
      return NextResponse.json({
        error: 'No eligible contacts. Contacts with replies or status in [engaged, qualified, lost, do_not_contact, customer] are excluded.',
        excluded: allContacts.length,
      }, { status: 400 });
    }

    // Calculate next_send_at based on first step's delay_days
    const now = new Date();
    const nextSendAt = new Date(now);
    nextSendAt.setDate(nextSendAt.getDate() + firstStep.delay_days);

    // Create enrollments for each eligible contact
    const enrollments = eligibleContacts.map(contact => ({
      workspace_id: ctx.workspaceId,
      sequence_id: sequence.id,
      contact_id: contact.id,
      enrolled_by: user.id,
      current_step_id: firstStep.id,
      next_send_at: nextSendAt.toISOString(),
      status: 'active' as const,
    }));

    const { data: insertedEnrollments, error: enrollError } = await supabase
      .from('campaign_enrollments')
      .insert(enrollments)
      .select();

    if (enrollError) {
      // Handle unique constraint violation (contact already enrolled)
      if (enrollError.code === '23505') {
        return NextResponse.json({
          error: 'Some contacts are already enrolled in this sequence',
        }, { status: 409 });
      }
      throw enrollError;
    }

    // Log timeline events for each enrolled contact
    const timelineEvents = eligibleContacts.map(contact => ({
      contact_id: contact.id,
      event_type: 'sequence_enrolled',
      title: `Ajouté à la séquence "${sequence.name}"`,
      description: `${sequence.steps.length} étapes configurées. Premier envoi prévu le ${nextSendAt.toLocaleDateString('fr-FR')}.`,
      metadata: {
        sequence_id: sequence.id,
        sequence_name: sequence.name,
        total_steps: sequence.steps.length,
        first_step_delay: firstStep.delay_days,
        next_send_at: nextSendAt.toISOString(),
      },
      created_by: user.id,
      workspace_id: ctx.workspaceId,
    }));

    await supabase.from('contact_timeline').insert(timelineEvents);

    return NextResponse.json({
      enrolled: insertedEnrollments?.length || 0,
      total: allContacts.length,
      excluded: allContacts.length - eligibleContacts.length,
      next_send_at: nextSendAt.toISOString(),
    });
  } catch (error: any) {
    console.error('Sequence launch error:', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: error.message || 'Failed to launch sequence' },
      { status: 500 }
    );
  }
}
