import { NextResponse } from 'next/server';

import { anthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';

import { stripQuotedReplyHistory } from '@/lib/email-content';
import { searchCompany, searchContact } from '@/lib/linkup';
import { createServerClient } from '@/lib/supabase-server';
import { getServiceSupabase } from '@/lib/supabase';
import { getWorkspaceContext } from '@/lib/workspace';

export const maxDuration = 120;

// GET: Fetch latest existing meeting prep for this contact
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: contactId } = await params;
    const { supabase, error: clientError } = await createServerClient();
    if (clientError || !supabase) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const wsId = request.headers.get('x-workspace-id');
    const ctx = await getWorkspaceContext(supabase, user.id, wsId);
    if (!ctx) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

    const { data: event } = await supabase
      .from('contact_timeline')
      .select('metadata, created_at')
      .eq('contact_id', contactId)
      .eq('workspace_id', ctx.workspaceId)
      .eq('event_type', 'meeting_prep')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!event?.metadata?.talking_points) {
      return NextResponse.json({ exists: false });
    }

    return NextResponse.json({ exists: true, brief: event.metadata, createdAt: event.created_at });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch meeting prep';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST: Generate a new meeting prep for this contact
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: contactId } = await params;
    const { supabase, error: clientError } = await createServerClient();
    if (clientError || !supabase) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const wsId = request.headers.get('x-workspace-id');
    const ctx = await getWorkspaceContext(supabase, user.id, wsId);
    if (!ctx) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

    const { data: contact } = await supabase
      .from('contacts')
      .select('id, first_name, last_name, email, company_name, company_domain, job_title, linkedin_url, location, phone, status, ai_score, ai_score_label, ai_score_reasoning, ai_personalized_line, notes')
      .eq('id', contactId)
      .eq('workspace_id', ctx.workspaceId)
      .maybeSingle();

    if (!contact) return NextResponse.json({ error: 'Contact not found' }, { status: 404 });

    const contactName = [contact.first_name, contact.last_name].filter(Boolean).join(' ');

    // Fetch conversation messages for this contact (from any thread)
    const { data: threads } = await supabase
      .from('mailbox_threads')
      .select('id')
      .eq('contact_id', contactId)
      .eq('workspace_id', ctx.workspaceId)
      .eq('user_id', user.id);

    const threadIds = (threads || []).map(t => t.id);
    const { data: messages } = threadIds.length > 0
      ? await supabase
          .from('mailbox_messages')
          .select('direction, from_email, subject, text_body, message_at')
          .eq('workspace_id', ctx.workspaceId)
          .eq('user_id', user.id)
          .in('thread_id', threadIds)
          .order('message_at', { ascending: true })
          .limit(20)
      : { data: [] as any[] };

    // Fetch email engagement stats
    const { data: emailStats } = await supabase
      .from('emails_sent')
      .select('subject, status, sent_at, opened_at')
      .eq('contact_id', contactId)
      .eq('workspace_id', ctx.workspaceId)
      .order('sent_at', { ascending: false })
      .limit(10);

    // Fetch recent timeline events
    const { data: timeline } = await supabase
      .from('contact_timeline')
      .select('event_type, title, description, created_at')
      .eq('contact_id', contactId)
      .eq('workspace_id', ctx.workspaceId)
      .order('created_at', { ascending: false })
      .limit(15);

    // Build CRM context
    const crmParts: string[] = [];
    crmParts.push(`Nom: ${contactName}`);
    if (contact.email) crmParts.push(`Email: ${contact.email}`);
    if (contact.company_name) crmParts.push(`Entreprise: ${contact.company_name}`);
    if (contact.job_title) crmParts.push(`Poste: ${contact.job_title}`);
    if (contact.location) crmParts.push(`Localisation: ${contact.location}`);
    if (contact.phone) crmParts.push(`Téléphone: ${contact.phone}`);
    if (contact.status) crmParts.push(`Statut CRM: ${contact.status}`);
    if (contact.ai_score != null) crmParts.push(`Score IA: ${contact.ai_score}/100 (${contact.ai_score_label || 'N/A'})`);
    if (contact.ai_score_reasoning) crmParts.push(`Analyse IA: ${contact.ai_score_reasoning}`);
    if (contact.ai_personalized_line) crmParts.push(`Accroche personnalisée: ${contact.ai_personalized_line}`);
    if (contact.notes) crmParts.push(`Notes: ${contact.notes}`);

    const engagementParts: string[] = [];
    if (emailStats && emailStats.length > 0) {
      const opened = emailStats.filter(e => e.opened_at).length;
      engagementParts.push(`Emails envoyés: ${emailStats.length}, Ouverts: ${opened}/${emailStats.length}`);
      for (const email of emailStats.slice(0, 5)) {
        const openedTag = email.opened_at ? ' [OUVERT]' : '';
        engagementParts.push(`  - "${email.subject}" (${email.status})${openedTag}`);
      }
    }

    const convParts: string[] = [];
    if (messages && messages.length > 0) {
      for (const msg of messages.slice(-10)) {
        const role = msg.direction === 'outbound' ? 'Nous' : contactName || 'Contact';
        const body = stripQuotedReplyHistory(msg.text_body || '').slice(0, 500);
        convParts.push(`[${new Date(msg.message_at).toLocaleDateString('fr-FR')}] ${role}: ${body}`);
      }
    }

    const timelineParts: string[] = [];
    if (timeline && timeline.length > 0) {
      for (const event of timeline.slice(0, 10)) {
        timelineParts.push(`- ${event.title}${event.description ? ` : ${event.description}` : ''} (${new Date(event.created_at).toLocaleDateString('fr-FR')})`);
      }
    }

    // Workspace business context
    const serviceSupabase = getServiceSupabase();
    const { data: workspace } = await serviceSupabase
      .from('workspaces')
      .select('ai_company_description, ai_target_industry, ai_target_roles, ai_geographic_focus, linkup_company_query, linkup_contact_query')
      .eq('id', ctx.workspaceId)
      .single();

    const businessParts: string[] = [];
    if (workspace?.ai_company_description) businessParts.push(`Notre entreprise: ${workspace.ai_company_description}`);
    if (workspace?.ai_target_industry) businessParts.push(`Industrie cible: ${workspace.ai_target_industry}`);
    if (workspace?.ai_target_roles) businessParts.push(`Rôles cibles: ${workspace.ai_target_roles}`);
    if (workspace?.ai_geographic_focus) businessParts.push(`Zone géographique: ${workspace.ai_geographic_focus}`);

    // Linkup web research
    let webResearch = '';
    const { data: userSettings } = await serviceSupabase
      .from('user_settings')
      .select('linkup_api_key_encrypted')
      .eq('user_id', user.id)
      .single();

    if (userSettings?.linkup_api_key_encrypted && contact.company_name) {
      try {
        const [companyRes, contactRes] = await Promise.all([
          searchCompany(userSettings.linkup_api_key_encrypted, contact.company_name, contact.company_domain, 'standard', workspace?.linkup_company_query || undefined),
          contactName ? searchContact(userSettings.linkup_api_key_encrypted, contactName, contact.company_name, contact.linkedin_url, workspace?.linkup_contact_query || undefined, 'standard', contact.job_title, contact.location) : Promise.resolve(''),
        ]);
        webResearch = `ENTREPRISE:\n${companyRes}\n\nCONTACT:\n${contactRes}`;
      } catch (err) {
        console.warn('Meeting prep Linkup search failed:', err);
      }
    }

    const prompt = `FICHE CONTACT CRM :\n${crmParts.join('\n')}\n\n${engagementParts.length > 0 ? `ENGAGEMENT EMAIL :\n${engagementParts.join('\n')}\n\n` : ''}${convParts.length > 0 ? `HISTORIQUE CONVERSATION :\n${convParts.join('\n')}\n\n` : ''}${timelineParts.length > 0 ? `TIMELINE ACTIVITÉ :\n${timelineParts.join('\n')}\n\n` : ''}${businessParts.length > 0 ? `CONTEXTE BUSINESS (notre entreprise) :\n${businessParts.join('\n')}\n\n` : ''}${webResearch ? `RECHERCHE WEB RÉCENTE :\n${webResearch}\n\n` : ''}Génère un brief de préparation de meeting structuré pour ce contact.`;

    const result = await generateText({
      model: anthropic('claude-sonnet-4-5-20250929'),
      system: `Tu es un assistant commercial expert qui prépare des briefs avant les meetings.

Tu reçois toutes les données CRM, l'historique des échanges, les stats d'engagement email, et potentiellement de la recherche web récente sur le contact et son entreprise.

Génère un brief de préparation structuré en JSON avec ce format exact :
{
  "company_summary": "Résumé de l'entreprise en 1-2 phrases (activité, taille, secteur, localisation)",
  "contact_role": "Rôle et responsabilités du contact en 1 phrase",
  "engagement_recap": "Résumé de l'engagement (emails ouverts, réponses, sentiment général) en 1-2 phrases",
  "recent_signals": ["Signal 1 (actualité, recrutement, post LinkedIn...)", "Signal 2..."],
  "talking_points": ["Point de discussion 1 avec contexte", "Point 2", "Point 3"],
  "suggested_questions": ["Question ouverte 1", "Question 2", "Question 3"],
  "red_flags": ["Risque ou objection potentielle avec suggestion de réponse"]
}

RÈGLES :
- Réponds UNIQUEMENT avec le JSON, sans markdown ni texte autour
- Sois concis et actionnable
- Base-toi uniquement sur des faits réels tirés des données fournies
- Si tu n'as pas assez d'info pour un champ, mets un tableau vide [] ou une phrase honnête
- Écris dans la même langue que les échanges email. Par défaut, écris en français.`,
      prompt,
    });

    let brief;
    try {
      const text = result.text.trim();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      brief = JSON.parse(jsonMatch?.[0] || text);
    } catch {
      brief = {
        company_summary: contact.company_name || 'N/A',
        contact_role: contact.job_title || 'N/A',
        engagement_recap: 'Données insuffisantes',
        recent_signals: [],
        talking_points: [result.text.trim()],
        suggested_questions: [],
        red_flags: [],
      };
    }

    // Save to timeline
    const briefSummary = brief.talking_points?.length > 0 ? brief.talking_points.join(' | ').slice(0, 500) : '';
    await supabase.from('contact_timeline').insert({
      contact_id: contactId,
      workspace_id: ctx.workspaceId,
      event_type: 'meeting_prep',
      title: 'Brief de préparation généré',
      description: briefSummary || null,
      metadata: brief,
      created_by: user.id,
    });

    return NextResponse.json({
      brief,
      contact: {
        name: contactName,
        company: contact.company_name,
        jobTitle: contact.job_title,
        email: contact.email,
        score: contact.ai_score,
        scoreLabel: contact.ai_score_label,
        status: contact.status,
      },
      hasWebResearch: !!webResearch,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to generate meeting prep';
    console.error('Meeting prep error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
