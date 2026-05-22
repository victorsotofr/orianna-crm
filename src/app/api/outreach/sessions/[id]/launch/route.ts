import { NextRequest, NextResponse } from 'next/server';

import {
  normalizeSteps,
  plainTextToHtml,
  saveSessionProspectsAsContacts,
  type OutreachEmailStep,
} from '@/lib/outreach';
import { createServerClient } from '@/lib/supabase-server';
import { getWorkspaceContext } from '@/lib/workspace';

function getSkipReason(contact: any) {
  if (!contact.email) return 'No email';
  if (contact.email_verified_status === 'INVALID') return 'Invalid email';
  if (contact.email_bounced) return 'Email bounced';
  if (contact.replied_at) return 'Already replied';
  if (contact.opted_out_at) return 'Opted out';
  if (['engaged', 'qualified', 'lost', 'do_not_contact', 'customer'].includes(contact.status)) {
    return `Status is ${contact.status}`;
  }
  return null;
}

function fallbackSteps(): OutreachEmailStep[] {
  return [
    { subject: 'Question rapide', body: 'Bonjour {{first_name}},\n\nEst-ce que l’automatisation des demandes locataires, suivis et relances est un sujet chez {{company_name}} ?', delayDays: 0 },
    { subject: 'Re: Question rapide', body: 'Bonjour {{first_name}},\n\nJe me permets de vous relancer. Nous aidons les équipes immobilières à réduire les tâches manuelles autour des demandes, documents et reportings.\n\nEst-ce pertinent d’en parler ?', delayDays: 3 },
    { subject: 'Dernière relance', body: 'Bonjour {{first_name}},\n\nDernière relance de ma part. Si ce n’est pas une priorité, aucun souci.\n\nÀ qui devrais-je plutôt m’adresser chez {{company_name}} ?', delayDays: 7 },
  ];
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { supabase, error: clientError } = await createServerClient();
    if (!supabase || clientError) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const wsId = request.headers.get('x-workspace-id');
    const ctx = await getWorkspaceContext(supabase, user.id, wsId);
    if (!ctx) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

    const body = await request.json().catch(() => ({}));
    const prospectIds = Array.isArray(body.prospectIds)
      ? body.prospectIds.filter((value: unknown): value is string => typeof value === 'string')
      : undefined;

    const saved = await saveSessionProspectsAsContacts({
      db: supabase,
      workspaceId: ctx.workspaceId,
      userId: user.id,
      sessionId: id,
      prospectIds,
    });

    if (saved.contactIds.length === 0) {
      return NextResponse.json({ error: 'No selected prospects could be saved for launch', skipped: saved.skipped }, { status: 400 });
    }

    const { data: draft } = await supabase
      .from('outreach_sequence_drafts')
      .select('*')
      .eq('session_id', id)
      .eq('workspace_id', ctx.workspaceId)
      .maybeSingle();

    let steps = normalizeSteps(body.steps);
    if (!steps.length) steps = normalizeSteps(draft?.steps);
    if (!steps.length) steps = fallbackSteps();

    const { data: contacts, error: contactsError } = await supabase
      .from('contacts')
      .select('*')
      .in('id', saved.contactIds)
      .eq('workspace_id', ctx.workspaceId);

    if (contactsError) throw contactsError;

    const skipped = [...saved.skipped];
    const eligibleContacts = (contacts || []).filter((contact) => {
      const reason = getSkipReason(contact);
      if (reason) skipped.push({ prospectId: contact.id, reason });
      return !reason;
    });

    if (eligibleContacts.length === 0) {
      return NextResponse.json({
        error: 'No selected prospects are ready to launch. Find emails first or remove blocked prospects.',
        skipped,
      }, { status: 400 });
    }

    const sequenceName = String(body.sequenceName || draft?.name || `Outreach - ${new Date().toLocaleDateString('fr-FR')}`).trim();

    const templateRows = steps.map((step, index) => ({
      workspace_id: ctx.workspaceId,
      created_by: user.id,
      name: `${sequenceName} / Email ${index + 1}`,
      industry: 'Outreach',
      subject: step.subject,
      html_content: plainTextToHtml(step.body),
      variables: ['first_name', 'company_name', 'ai_personalized_line'],
      is_active: true,
    }));

    const { data: templates, error: templateError } = await supabase
      .from('templates')
      .insert(templateRows)
      .select('id');

    if (templateError) throw templateError;
    if (!templates || templates.length !== steps.length) {
      throw new Error('Failed to create sequence templates');
    }

    const { data: sequence, error: sequenceError } = await supabase
      .from('campaign_sequences')
      .insert({
        workspace_id: ctx.workspaceId,
        name: sequenceName,
        template_variables: {},
        created_by: user.id,
        status: 'active',
      })
      .select()
      .single();

    if (sequenceError) throw sequenceError;

    const stepRows = steps.map((step, index) => ({
      sequence_id: sequence.id,
      template_id: templates[index].id,
      step_order: index,
      delay_days: step.delayDays,
    }));

    const { data: insertedSteps, error: stepsError } = await supabase
      .from('campaign_sequence_steps')
      .insert(stepRows)
      .select();

    if (stepsError) throw stepsError;
    const sortedSteps = (insertedSteps || []).sort((a: any, b: any) => a.step_order - b.step_order);
    const firstStep = sortedSteps[0];
    if (!firstStep) throw new Error('Sequence has no first step');

    const nextSendAt = new Date();
    nextSendAt.setDate(nextSendAt.getDate() + (steps[0]?.delayDays || 0));

    const enrollments = eligibleContacts.map((contact: any) => ({
      workspace_id: ctx.workspaceId,
      sequence_id: sequence.id,
      contact_id: contact.id,
      enrolled_by: user.id,
      current_step_id: firstStep.id,
      next_send_at: nextSendAt.toISOString(),
      status: 'active',
    }));

    const { error: enrollError } = await supabase
      .from('campaign_enrollments')
      .insert(enrollments);

    if (enrollError) throw enrollError;

    await supabase.from('contact_timeline').insert(eligibleContacts.map((contact: any) => ({
      workspace_id: ctx.workspaceId,
      contact_id: contact.id,
      event_type: 'outreach_launched',
      title: `Séquence lancée: ${sequenceName}`,
      description: `${steps.length} emails configurés. Premier envoi prévu le ${nextSendAt.toLocaleDateString('fr-FR')}.`,
      metadata: {
        sequence_id: sequence.id,
        outreach_session_id: id,
        next_send_at: nextSendAt.toISOString(),
      },
      created_by: user.id,
    })));

    await supabase
      .from('outreach_sequence_drafts')
      .upsert({
        session_id: id,
        workspace_id: ctx.workspaceId,
        user_id: user.id,
        name: sequenceName,
        steps,
        status: 'launched',
        sequence_id: sequence.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'session_id' });

    await supabase
      .from('outreach_sessions')
      .update({ status: 'launched', updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('workspace_id', ctx.workspaceId);

    return NextResponse.json({
      sequenceId: sequence.id,
      sequenceName,
      enrolled: eligibleContacts.length,
      skipped,
      nextSendAt: nextSendAt.toISOString(),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to launch outreach';
    console.error('Outreach launch error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
