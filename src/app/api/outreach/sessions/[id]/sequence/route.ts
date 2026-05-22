import { NextRequest, NextResponse } from 'next/server';
import { generateText } from 'ai';

import { aiModel } from '@/lib/ai-provider';
import {
  getOutreachSession,
  normalizeSteps,
  parseJsonFromText,
  type OutreachEmailStep,
} from '@/lib/outreach';
import { createServerClient } from '@/lib/supabase-server';
import { getWorkspaceContext } from '@/lib/workspace';

export const maxDuration = 120;

function defaultSteps(): OutreachEmailStep[] {
  return [
    { subject: 'Question rapide', body: 'Bonjour {{first_name}},\n\nJe me permets de vous contacter car beaucoup d’équipes de gestion immobilière cherchent à réduire le temps passé sur les demandes locataires, relances et suivis opérationnels.\n\nEst-ce un sujet que vous regardez chez {{company_name}} ?', delayDays: 0 },
    { subject: 'Re: Question rapide', body: 'Bonjour {{first_name}},\n\nJe me permets de vous relancer. L’idée est simple : automatiser une partie du traitement des demandes, documents et suivis sans changer brutalement vos outils actuels.\n\nEst-ce pertinent d’en discuter 15 minutes ?', delayDays: 3 },
    { subject: 'Dernière relance', body: 'Bonjour {{first_name}},\n\nDernière relance de ma part. Si améliorer le suivi des demandes et réduire les tâches manuelles n’est pas une priorité aujourd’hui, aucun souci.\n\nÀ qui devrais-je plutôt m’adresser chez {{company_name}} ?', delayDays: 7 },
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

    const session = await getOutreachSession(supabase, ctx.workspaceId, id);
    if (!session) return NextResponse.json({ error: 'Outreach session not found' }, { status: 404 });

    const body = await request.json().catch(() => ({}));
    const providedSteps = normalizeSteps(body.steps);
    const revisionPrompt = typeof body.revisionPrompt === 'string' ? body.revisionPrompt.trim() : '';
    let steps = providedSteps.length ? providedSteps : [];

    if (!steps.length || revisionPrompt) {
      const prospectIds = Array.isArray(body.prospectIds)
        ? body.prospectIds.filter((value: unknown): value is string => typeof value === 'string')
        : [];
      let prospectsQuery = supabase
        .from('outreach_session_prospects')
        .select('first_name, last_name, company_name, job_title, location, reason')
        .eq('session_id', id)
        .eq('workspace_id', ctx.workspaceId)
        .eq('ignored', false)
        .limit(8);

      if (prospectIds.length) {
        prospectsQuery = prospectsQuery.in('id', prospectIds);
      } else {
        prospectsQuery = prospectsQuery.eq('selected', true);
      }

      const { data: prospects } = await prospectsQuery;

      const previousSteps = steps.length ? steps : defaultSteps();
      const { text } = await generateText({
        model: aiModel('assistant'),
        system: `You write concise French B2B outbound email sequences.

Return ONLY valid JSON:
{
  "name": "",
  "steps": [
    { "subject": "", "body": "", "delayDays": 0 },
    { "subject": "", "body": "", "delayDays": 3 },
    { "subject": "", "body": "", "delayDays": 7 }
  ]
}

Rules:
- Write in French.
- Keep each email under 120 words.
- Use variables exactly when useful: {{first_name}}, {{company_name}}, {{ai_personalized_line}}.
- Do not overpromise.
- Avoid hype, emojis, and long paragraphs.
- Email 1 opens the conversation; email 2 adds operational value; email 3 politely closes the loop.`,
        prompt: `Original outreach request:
${session.prompt}

Structured brief:
${JSON.stringify(session.structured_brief || {}, null, 2)}

Selected prospect examples:
${JSON.stringify(prospects || [], null, 2)}

Current sequence draft:
${JSON.stringify(previousSteps, null, 2)}

${revisionPrompt ? `User revision request: ${revisionPrompt}` : 'Create the best first 3-email sequence for this audience.'}`,
      });

      const parsed = parseJsonFromText<{ name?: string; steps?: unknown }>(text, {});
      steps = normalizeSteps(parsed.steps).length ? normalizeSteps(parsed.steps) : previousSteps;
      body.name = parsed.name || body.name;
    }

    if (!steps.length) steps = defaultSteps();
    const name = String(body.name || `Outreach - ${session.prompt.slice(0, 48)}`).trim();

    const { data: draft, error } = await supabase
      .from('outreach_sequence_drafts')
      .upsert({
        session_id: id,
        workspace_id: ctx.workspaceId,
        user_id: user.id,
        name,
        steps,
        status: 'draft',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'session_id' })
      .select()
      .single();

    if (error) throw error;

    await supabase
      .from('outreach_sessions')
      .update({ status: 'sequence_draft', updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('workspace_id', ctx.workspaceId);

    return NextResponse.json({ sequenceDraft: draft });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to generate sequence';
    console.error('Outreach sequence error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
