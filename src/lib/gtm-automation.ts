import 'server-only';

import { generateText } from 'ai';

import { aiModel } from '@/lib/ai-provider';
import { type BusinessContext } from '@/lib/ai-business-context';
import { personalizeContact } from '@/lib/ai-personalization';
import { scoreContact } from '@/lib/ai-scoring';
import { getCreditBalance, startBulkEnrichment } from '@/lib/fullenrich';
import { searchProspecting } from '@/lib/linkup';
import { getServiceSupabase } from '@/lib/supabase';
import { isTelegramConfigured, sendMessage } from '@/lib/telegram';
import { isGtmApprovedForSend } from '@/lib/gtm-safety';
import type { Contact } from '@/types/database';

export const ISIMPLE_GTM_WORKSPACE_NAME = 'isimple';
export const ISIMPLE_GTM_WORKSPACE_SLUG = 'isimple';
export const LEGACY_ISIMPLE_GTM_WORKSPACE_SLUG = 'isimple-gtm-france-pms';
export const ISIMPLE_GTM_SEQUENCE_NAME = 'isimple GTM - France PMs - 3 touches';
export const ISIMPLE_GTM_OWNER_EMAIL = 'victor.soto@polytechnique.edu';
export const DEFAULT_GTM_DAILY_LIMIT = 20;

export class GtmWorkspaceAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GtmWorkspaceAccessError';
  }
}

export const ISIMPLE_ICP_QUERIES = [
  'Find French property management decision-makers: dirigeants de syndics, administrateurs de biens, property managers, and real estate agency network operators in France. Prioritize companies managing residential portfolios, co-ownership buildings, rental management, and multi-site real estate operations. Return named decision-makers with title, company, city, LinkedIn URL, company domain, source URL, professional email when visible, and one sentence explaining ICP fit.',
  'Find dirigeants and operations leaders at syndic de copropriété firms, cabinets d administration de biens, gestion locative agencies, and property management companies in Paris, Lyon, Marseille, Bordeaux, Nantes, Lille, Toulouse, and Nice. Return currently active senior people with public source evidence and professional email when available.',
  'Find French real estate agency groups and property administration firms likely to need workflow automation for tenant requests, maintenance, owner reporting, document handling, and follow-ups. Return named decision-makers with verified public context and professional email when visible; do not exclude a strong named prospect just because the email is not public.',
];

const ISIMPLE_SEQUENCE_TEMPLATES = [
  {
    name: 'isimple GTM - Intro syndic / gestion locative',
    subject: 'Simplifier le suivi des demandes chez {{ company_name }}',
    delayDays: 0,
    htmlContent: `<p>Bonjour {{ first_name }},</p>
<p>{{ ai_personalized_line }}</p>
<p>Je travaille sur <strong>isimple</strong>, un outil pensé pour les administrateurs de biens, syndics et équipes de gestion locative qui veulent mieux suivre les demandes entrantes, les interventions et les relances sans ajouter une couche lourde à leur organisation.</p>
<p>L'idée est de garder un espace clair pour qualifier les demandes, préparer les réponses, suivre la prochaine action et conserver l'historique utile pour l'équipe.</p>
<p>Est-ce que ce sujet est pertinent pour {{ company_name }} ? Si oui, je serais ravi d'échanger 15 minutes pour comprendre votre fonctionnement actuel.</p>
<p>Bien à vous,<br>Victor</p>
<p style="font-size:12px;color:#6b7280">Si ce n'est pas pertinent, répondez simplement STOP et je ne vous recontacterai pas.</p>`,
  },
  {
    name: 'isimple GTM - Relance bénéfice opérationnel',
    subject: 'Re: demandes locataires et suivi maintenance',
    delayDays: 3,
    htmlContent: `<p>Bonjour {{ first_name }},</p>
<p>Je me permets de vous relancer rapidement.</p>
<p>Les équipes que nous ciblons ont souvent le même problème: beaucoup de demandes entrantes, des informations dispersées entre email/téléphone, et des relances manuelles qui prennent du temps.</p>
<p>isimple vise à transformer ces échanges en workflows suivis: qualification automatique, réponse préparée, prochaine action claire, et historique exploitable par l'équipe.</p>
<p>Est-ce que vous seriez ouvert à un court échange pour comparer cela avec votre fonctionnement actuel ?</p>
<p>Bien à vous,<br>Victor</p>
<p style="font-size:12px;color:#6b7280">Répondez STOP si vous préférez ne plus recevoir de message.</p>`,
  },
  {
    name: 'isimple GTM - Dernière relance',
    subject: 'Dernier message - isimple',
    delayDays: 7,
    htmlContent: `<p>Bonjour {{ first_name }},</p>
<p>Dernier message de ma part.</p>
<p>Je pensais à {{ company_name }} car isimple est conçu pour des équipes immobilières qui veulent mieux suivre les demandes, les interventions, les relances et les documents sans multiplier les outils.</p>
<p>Si ce sujet n'est pas prioritaire, aucun souci. Sinon, je peux vous envoyer un aperçu concret ou caler 15 minutes.</p>
<p>Bien à vous,<br>Victor</p>
<p style="font-size:12px;color:#6b7280">Répondez STOP et je clôture la relance.</p>`,
  },
];

interface RunDailyProspectingInput {
  workspaceId: string;
  userId: string;
  limit?: number;
  query?: string;
  mode?: GtmRunMode;
  dryRun?: boolean;
  respectEnabled?: boolean;
}

export type GtmRunMode = 'dry_run' | 'import_prepare' | 'full_auto';

export interface RunDailyProspectingResult {
  runId: string | null;
  importedCount: number;
  preparedCount: number;
  enrichmentStartedCount?: number;
  enrolledCount: number;
  skippedCount: number;
  error?: string;
}

interface ProspectedContact {
  first_name: string;
  last_name: string;
  company_name: string;
  job_title: string;
  email: string;
  location: string;
  linkedin_url: string;
  company_domain: string;
  source_url?: string;
  icp_fit?: string;
}

interface WorkspaceConfig {
  name: string;
  gtm_enabled?: boolean | null;
  gtm_daily_contact_limit?: number | null;
  gtm_active_sequence_id?: string | null;
  gtm_requires_approval?: boolean | null;
  gtm_icp_queries?: string[] | null;
  ai_scoring_prompt?: string | null;
  ai_personalization_prompt?: string | null;
  ai_company_description?: string | null;
  ai_target_industry?: string | null;
  ai_target_roles?: string | null;
  ai_geographic_focus?: string | null;
  linkup_company_query?: string | null;
  linkup_contact_query?: string | null;
  linkup_prospecting_query?: string | null;
}

interface UserAutomationSettings {
  user_email?: string | null;
  linkup_api_key_encrypted?: string | null;
  fullenrich_api_key_encrypted?: string | null;
}

function clampDailyLimit(limit: number) {
  if (!Number.isFinite(limit)) return DEFAULT_GTM_DAILY_LIMIT;
  return Math.max(1, Math.min(100, Math.round(limit)));
}

function pickQuery(workspace: WorkspaceConfig, inputQuery?: string) {
  if (inputQuery?.trim()) return inputQuery.trim();

  const configured = Array.isArray(workspace.gtm_icp_queries)
    ? workspace.gtm_icp_queries.filter((query) => typeof query === 'string' && query.trim())
    : [];
  const queries = configured.length > 0 ? configured : ISIMPLE_ICP_QUERIES;
  const dayIndex = Math.floor(Date.now() / 86400000) % queries.length;
  return queries[dayIndex];
}

function cleanJson(text: string) {
  return text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function normalizeProspect(candidate: Partial<ProspectedContact>): ProspectedContact | null {
  const email = String(candidate.email || '').trim().toLowerCase();
  const firstName = String(candidate.first_name || '').trim();
  const lastName = String(candidate.last_name || '').trim();
  const companyName = String(candidate.company_name || '').trim();

  if (email && !email.includes('@')) return null;
  if (!firstName || !lastName || !companyName) return null;

  return {
    first_name: firstName,
    last_name: lastName,
    company_name: companyName,
    job_title: String(candidate.job_title || '').trim(),
    email,
    location: String(candidate.location || '').trim(),
    linkedin_url: String(candidate.linkedin_url || '').trim(),
    company_domain: String(candidate.company_domain || '').trim(),
    source_url: String(candidate.source_url || '').trim(),
    icp_fit: String(candidate.icp_fit || '').trim(),
  };
}

async function extractProspects(rawResearch: string): Promise<ProspectedContact[]> {
  const { text } = await generateText({
    model: aiModel('extract'),
    system: `You extract structured B2B prospect records from web research.

Rules:
- Extract only explicitly named people.
- first_name, last_name, and company_name are required.
- email is optional. Include a professional email only when explicitly present; do not invent one.
- Do not invent, infer, or guess missing fields.
- Deduplicate by email when present, otherwise by LinkedIn URL or name + company.
- Return ONLY a valid JSON array.`,
    prompt: `Extract prospects as JSON.

Each object must have exactly these fields:
{"first_name":"","last_name":"","company_name":"","job_title":"","email":"","location":"","linkedin_url":"","company_domain":"","source_url":"","icp_fit":""}

Research:
${rawResearch}`,
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleanJson(text));
  } catch {
    console.error('GTM prospect extraction parse failed:', text.slice(0, 500));
    return [];
  }

  if (!Array.isArray(parsed)) return [];

  const seen = new Set<string>();
  const prospects: ProspectedContact[] = [];
  for (const item of parsed) {
    const prospect = normalizeProspect(item as Partial<ProspectedContact>);
    if (!prospect) continue;
    const key = prospectDedupeKey(prospect);
    if (seen.has(key)) continue;
    seen.add(key);
    prospects.push(prospect);
  }

  return prospects;
}

async function searchProspectsWithFallback(
  linkupApiKeyEncrypted: string,
  query: string,
  customTemplate?: string | null
) {
  try {
    return await withTimeout(
      searchProspecting(
        linkupApiKeyEncrypted,
        query,
        customTemplate,
        'deep',
        'sourcedAnswer'
      ),
      Number(process.env.GTM_LINKUP_SEARCH_TIMEOUT_MS || 120000),
      'GTM deep prospecting search'
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!/timeout|timedout|etimedout/i.test(message)) throw err;
    console.warn('[GTM] Deep prospecting search timed out; retrying with standard depth.');
    return withTimeout(
      searchProspecting(
        linkupApiKeyEncrypted,
        query,
        customTemplate,
        'standard',
        'sourcedAnswer'
      ),
      Number(process.env.GTM_LINKUP_SEARCH_FALLBACK_TIMEOUT_MS || 90000),
      'GTM standard prospecting search'
    );
  }
}

function buildBusinessContext(workspace: WorkspaceConfig): BusinessContext | undefined {
  if (
    !workspace.ai_company_description &&
    !workspace.ai_target_industry &&
    !workspace.ai_target_roles &&
    !workspace.ai_geographic_focus
  ) {
    return {
      companyDescription: 'isimple automates property-management workflows for real estate operators with a lean AI-native interface.',
      targetIndustry: 'French real estate agencies, syndic firms, administrateurs de biens, and property managers',
      targetRoles: 'Founder, CEO, COO, property management director, syndic director, operations manager',
      geographicFocus: 'France',
    };
  }

  return {
    companyDescription: workspace.ai_company_description || undefined,
    targetIndustry: workspace.ai_target_industry || undefined,
    targetRoles: workspace.ai_target_roles || undefined,
    geographicFocus: workspace.ai_geographic_focus || undefined,
  };
}

function normalizeDedupeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLowerCase();
}

function prospectDedupeKey(prospect: ProspectedContact) {
  if (prospect.email) return `email:${prospect.email}`;
  const linkedin = prospect.linkedin_url.trim().toLowerCase();
  if (linkedin) return `linkedin:${linkedin}`;
  return prospectNameCompanyKey(prospect);
}

function prospectNameCompanyKey(prospect: Pick<ProspectedContact, 'first_name' | 'last_name' | 'company_name' | 'company_domain'>) {
  const company = normalizeDedupeText(prospect.company_domain || prospect.company_name).split(' ').slice(0, 2).join(' ');
  return [
    'name-company',
    normalizeDedupeText(prospect.first_name),
    normalizeDedupeText(prospect.last_name),
    company,
  ].join(':');
}

function isSuppressed(contact: Partial<Contact>) {
  return Boolean(
    !contact.email ||
    contact.status === 'do_not_contact' ||
    contact.email_bounced ||
    contact.replied_at ||
    contact.opted_out_at ||
    contact.email_verified_status === 'INVALID'
  );
}

async function notifyGtm(userId: string, lines: string[]) {
  if (!isTelegramConfigured()) return;

  try {
    const db = getServiceSupabase();
    const { data } = await db
      .from('user_settings')
      .select('telegram_chat_id, telegram_notifications_enabled')
      .eq('user_id', userId)
      .maybeSingle();

    if (!data?.telegram_chat_id || data.telegram_notifications_enabled === false) return;
    await sendMessage(data.telegram_chat_id, lines.join('\n'));
  } catch (err) {
    console.error('GTM Telegram notification failed:', err);
  }
}

async function createTimelineEvent(
  contact: Contact,
  userId: string,
  eventType: string,
  title: string,
  description: string | null,
  metadata: Record<string, unknown> = {}
) {
  const db = getServiceSupabase();
  await db.from('contact_timeline').insert({
    contact_id: contact.id,
    workspace_id: contact.workspace_id,
    event_type: eventType,
    title,
    description,
    metadata,
    created_by: userId,
  });
}

async function prepareContactsWithAi(
  contacts: Contact[],
  userId: string,
  linkupApiKey: string,
  workspace: WorkspaceConfig,
  maxContacts?: number
) {
  const limit = clampDailyLimit(maxContacts ?? Number(process.env.GTM_AI_PREP_LIMIT || 6));
  const customPrompts = {
    scoringPrompt: workspace.ai_scoring_prompt || undefined,
    personalizationPrompt: workspace.ai_personalization_prompt || undefined,
    linkupCompanyQuery: workspace.linkup_company_query || undefined,
    linkupContactQuery: workspace.linkup_contact_query || undefined,
  };
  const businessContext = buildBusinessContext(workspace);
  let preparedCount = 0;
  const prepTimeoutMs = Number(process.env.GTM_AI_PREP_CONTACT_TIMEOUT_MS || 90000);

  for (const contact of contacts.slice(0, limit)) {
    try {
      const [score, personalization] = await withTimeout(
        Promise.all([
          scoreContact(contact, linkupApiKey, {
            scoringPrompt: customPrompts.scoringPrompt,
            linkupCompanyQuery: customPrompts.linkupCompanyQuery,
            linkupContactQuery: customPrompts.linkupContactQuery,
          }, businessContext),
          personalizeContact(contact, linkupApiKey, {
            personalizationPrompt: customPrompts.personalizationPrompt,
            linkupCompanyQuery: customPrompts.linkupCompanyQuery,
            linkupContactQuery: customPrompts.linkupContactQuery,
          }, businessContext),
        ]),
        prepTimeoutMs,
        `GTM AI preparation for ${contact.email || contact.id}`
      );

      await getServiceSupabase()
        .from('contacts')
        .update({
          ai_score: score.score,
          ai_score_label: score.label,
          ai_score_reasoning: score.reasoning,
          ai_scored_at: new Date().toISOString(),
          ai_personalized_line: personalization.line,
          ai_personalized_at: new Date().toISOString(),
        })
        .eq('id', contact.id);

      await createTimelineEvent(
        contact,
        userId,
        'gtm_ai_prepared',
        `GTM AI prepared: ${score.score}/100 (${score.label})`,
        personalization.line,
        { score: score.score, label: score.label, reasoning: score.reasoning }
      );
      preparedCount++;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'AI preparation failed';
      console.error(`GTM AI preparation failed for ${contact.id}:`, message);
      await createTimelineEvent(contact, userId, 'gtm_ai_prepare_failed', 'GTM AI preparation failed', message);
    }
  }

  return preparedCount;
}

async function startEnrichmentForMissingEmails(contacts: Contact[], settings: UserAutomationSettings) {
  if (!settings.fullenrich_api_key_encrypted) return 0;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) {
    console.warn('[GTM] NEXT_PUBLIC_APP_URL missing; skipping FullEnrich enrichment.');
    return 0;
  }

  const enrichable = contacts.filter((contact) => (
    !contact.email &&
    contact.first_name &&
    contact.last_name &&
    (contact.company_domain || contact.company_name || contact.linkedin_url)
  ));

  if (enrichable.length === 0) return 0;

  try {
    const credits = await getCreditBalance(settings.fullenrich_api_key_encrypted);
    if (credits <= 0) {
      console.warn('[GTM] FullEnrich has no remaining credits; skipping enrichment.');
      return 0;
    }
  } catch (err) {
    console.warn('[GTM] Could not verify FullEnrich credits; attempting enrichment anyway:', err instanceof Error ? err.message : err);
  }

  try {
    const enrichmentId = await startBulkEnrichment(
      settings.fullenrich_api_key_encrypted,
      enrichable.map((contact) => ({
        contact_id: contact.id,
        workspace_id: contact.workspace_id!,
        firstname: contact.first_name!,
        lastname: contact.last_name!,
        domain: contact.company_domain || undefined,
        company_name: contact.company_name || undefined,
        linkedin_url: contact.linkedin_url || undefined,
      })),
      `${appUrl}/api/webhooks/fullenrich`
    );

    await getServiceSupabase().from('contact_timeline').insert(enrichable.map((contact) => ({
      contact_id: contact.id,
      workspace_id: contact.workspace_id,
      event_type: 'gtm_enrichment_started',
      title: 'GTM enrichment started',
      description: 'FullEnrich started to find a professional email and phone.',
      metadata: { enrichment_id: enrichmentId },
      created_by: contact.user_id,
    })));

    return enrichable.length;
  } catch (err) {
    console.error('[GTM] FullEnrich enrichment failed:', err instanceof Error ? err.message : err);
    return 0;
  }
}

async function enrollContacts(
  workspaceId: string,
  userId: string,
  sequenceId: string | null | undefined,
  contacts: Contact[]
) {
  if (!sequenceId) return 0;

  const db = getServiceSupabase();
  const { data: sequence } = await db
    .from('campaign_sequences')
    .select('id, status')
    .eq('id', sequenceId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  if (!sequence || sequence.status !== 'active') return 0;

  const { data: firstStep } = await db
    .from('campaign_sequence_steps')
    .select('id')
    .eq('sequence_id', sequenceId)
    .order('step_order', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!firstStep?.id) return 0;

  const rows = contacts
    .filter((contact) => !isSuppressed(contact) && isGtmApprovedForSend(contact))
    .map((contact) => ({
      workspace_id: workspaceId,
      sequence_id: sequenceId,
      contact_id: contact.id,
      enrolled_by: userId,
      current_step_id: firstStep.id,
      next_send_at: new Date().toISOString(),
      status: 'active',
    }));

  if (rows.length === 0) return 0;

  const { data, error } = await db
    .from('campaign_enrollments')
    .upsert(rows, {
      onConflict: 'sequence_id,contact_id',
      ignoreDuplicates: true,
    })
    .select('id');

  if (error) throw error;
  return data?.length || 0;
}

export async function runDailyProspecting(input: RunDailyProspectingInput): Promise<RunDailyProspectingResult> {
  const db = getServiceSupabase();
  let runId: string | null = null;
  const startedAt = new Date().toISOString();
  const mode: GtmRunMode = input.dryRun
    ? 'dry_run'
    : input.mode || (input.respectEnabled ? 'full_auto' : 'import_prepare');

  try {
    const { data: workspace, error: workspaceError } = await db
      .from('workspaces')
      .select(`
        name,
        gtm_enabled,
        gtm_daily_contact_limit,
        gtm_active_sequence_id,
        gtm_requires_approval,
        gtm_icp_queries,
        ai_scoring_prompt,
        ai_personalization_prompt,
        ai_company_description,
        ai_target_industry,
        ai_target_roles,
        ai_geographic_focus,
        linkup_company_query,
        linkup_contact_query,
        linkup_prospecting_query
      `)
      .eq('id', input.workspaceId)
      .single<WorkspaceConfig>();

    if (workspaceError || !workspace) {
      throw new Error(workspaceError?.message || 'Workspace not found');
    }

    if (input.respectEnabled && !workspace.gtm_enabled) {
      return { runId, importedCount: 0, preparedCount: 0, enrolledCount: 0, skippedCount: 0 };
    }

    const requestedLimit = clampDailyLimit(input.limit ?? workspace.gtm_daily_contact_limit ?? DEFAULT_GTM_DAILY_LIMIT);

    const { data: run, error: runError } = await db
      .from('gtm_daily_runs')
      .insert({
        workspace_id: input.workspaceId,
        user_id: input.userId,
        status: 'running',
        requested_limit: requestedLimit,
        started_at: startedAt,
      })
      .select('id')
      .single();

    if (runError) throw runError;
    runId = run.id;

    const { data: settings } = await db
      .from('user_settings')
      .select('user_email, linkup_api_key_encrypted, fullenrich_api_key_encrypted')
      .eq('user_id', input.userId)
      .maybeSingle<UserAutomationSettings>();

    if (!settings?.linkup_api_key_encrypted) {
      throw new Error('Linkup API key is not configured for the GTM owner.');
    }

    const query = pickQuery(workspace, input.query);
    const rawResearch = await searchProspectsWithFallback(
      settings.linkup_api_key_encrypted,
      query,
      workspace.linkup_prospecting_query
    );
    const prospects = await extractProspects(rawResearch);

    const emails = prospects.map((contact) => contact.email).filter(Boolean);
    const { data: existingByEmail } = emails.length > 0
      ? await db
          .from('contacts')
          .select('email')
          .eq('workspace_id', input.workspaceId)
          .in('email', emails)
      : { data: [] as { email: string | null }[] };
    const { data: existingByIdentity } = await db
      .from('contacts')
      .select('email, first_name, last_name, company_name, company_domain, linkedin_url')
      .eq('workspace_id', input.workspaceId)
      .eq('source', 'gtm_autopilot')
      .limit(5000);

    const existingEmails = new Set((existingByEmail || []).map((row) => row.email?.toLowerCase()).filter(Boolean));
    const existingKeys = new Set<string>();
    for (const row of existingByIdentity || []) {
      const identity = {
        first_name: row.first_name || '',
        last_name: row.last_name || '',
        company_name: row.company_name || '',
        job_title: '',
        email: row.email || '',
        location: '',
        linkedin_url: row.linkedin_url || '',
        company_domain: row.company_domain || '',
      };
      existingKeys.add(prospectDedupeKey(identity));
      existingKeys.add(prospectNameCompanyKey(identity));
    }
    const newProspectKeys = new Set<string>();
    const newProspects = prospects
      .filter((prospect) => {
        const identityKey = prospectDedupeKey(prospect);
        const nameCompanyKey = prospectNameCompanyKey(prospect);
        if (prospect.email && existingEmails.has(prospect.email)) return false;
        if (existingKeys.has(identityKey) || existingKeys.has(nameCompanyKey)) return false;
        if (newProspectKeys.has(identityKey) || newProspectKeys.has(nameCompanyKey)) return false;
        newProspectKeys.add(identityKey);
        newProspectKeys.add(nameCompanyKey);
        return true;
      })
      .slice(0, requestedLimit);

    if (mode === 'dry_run') {
      await db
        .from('gtm_daily_runs')
        .update({
          status: 'completed',
          finished_at: new Date().toISOString(),
          imported_count: 0,
          enrolled_count: 0,
          skipped_count: prospects.length - newProspects.length,
          summary: { mode, dry_run: true, candidate_count: prospects.length, query },
        })
        .eq('id', runId);

      return {
        runId,
        importedCount: 0,
        preparedCount: 0,
        enrolledCount: 0,
        skippedCount: prospects.length - newProspects.length,
      };
    }

    const rows = newProspects.map((contact) => ({
      workspace_id: input.workspaceId,
      user_id: input.userId,
      created_by: input.userId,
      created_by_email: settings.user_email || null,
      first_name: contact.first_name,
      last_name: contact.last_name,
      email: contact.email || null,
      company_name: contact.company_name,
      job_title: contact.job_title,
      location: contact.location,
      linkedin_url: contact.linkedin_url,
      company_domain: contact.company_domain,
      status: 'new',
      assigned_to: input.userId,
      source: 'gtm_autopilot',
      source_query: query,
      source_url: contact.source_url || null,
      segment: 'property_manager_france',
      persona: 'property_manager',
      gtm_review_status: 'pending',
      gtm_send_approved_at: null,
      gtm_send_approved_by: null,
      raw_data: {
        icp_fit: contact.icp_fit || null,
        gtm_run_id: runId,
      },
    }));

    const { data: inserted, error: insertError } = rows.length > 0
      ? await db
          .from('contacts')
          .upsert(rows, {
            onConflict: 'workspace_id,email',
            ignoreDuplicates: true,
          })
          .select('*')
      : { data: [] as Contact[], error: null };

    if (insertError) throw insertError;

    const insertedContacts = (inserted || []) as Contact[];
    const shouldAutoEnroll = mode === 'full_auto' && !workspace.gtm_requires_approval;
    const approvedAt = new Date().toISOString();
    const contactsForEnrollment = shouldAutoEnroll
      ? insertedContacts.map((contact) => ({
          ...contact,
          gtm_review_status: 'approved' as const,
          gtm_send_approved_at: approvedAt,
          gtm_send_approved_by: input.userId,
        }))
      : insertedContacts;

    if (shouldAutoEnroll && insertedContacts.length > 0) {
      await db
        .from('contacts')
        .update({
          gtm_review_status: 'approved',
          gtm_send_approved_at: approvedAt,
          gtm_send_approved_by: input.userId,
        })
        .eq('workspace_id', input.workspaceId)
        .in('id', insertedContacts.map((contact) => contact.id));

      for (const contact of contactsForEnrollment) {
        contact.gtm_review_status = 'approved';
        contact.gtm_send_approved_at = approvedAt;
        contact.gtm_send_approved_by = input.userId;
      }
    }

    await Promise.all(insertedContacts.map((contact) => createTimelineEvent(
      contact,
      input.userId,
      'gtm_sourced',
      'Contact sourced by GTM autopilot',
      contact.raw_data?.icp_fit ? String(contact.raw_data.icp_fit) : null,
      { source_query: query, source_url: contact.source_url || null }
    )));

    const prepLimit = mode === 'import_prepare' || mode === 'full_auto' ? requestedLimit : undefined;
    const preparedCount = insertedContacts.length > 0
      ? await prepareContactsWithAi(insertedContacts, input.userId, settings.linkup_api_key_encrypted, workspace, prepLimit)
      : 0;
    const enrichmentStartedCount = insertedContacts.length > 0
      ? await startEnrichmentForMissingEmails(insertedContacts, settings)
      : 0;

    const enrolledCount = shouldAutoEnroll
      ? await enrollContacts(input.workspaceId, input.userId, workspace.gtm_active_sequence_id, contactsForEnrollment)
      : 0;

    const skippedCount = prospects.length - insertedContacts.length;
    const summary = {
      mode,
      query,
      candidate_count: prospects.length,
      auto_enroll: shouldAutoEnroll,
      active_sequence_id: workspace.gtm_active_sequence_id,
      review_required: !shouldAutoEnroll,
      enrichment_started: enrichmentStartedCount,
    };

    await db
      .from('gtm_daily_runs')
      .update({
        status: 'completed',
        finished_at: new Date().toISOString(),
        imported_count: insertedContacts.length,
        prepared_count: preparedCount,
        enrolled_count: enrolledCount,
        skipped_count: skippedCount,
        summary,
      })
      .eq('id', runId);

    await db
      .from('workspaces')
      .update({
        gtm_last_run_at: new Date().toISOString(),
        gtm_last_run_status: 'completed',
        gtm_last_run_summary: summary,
      })
      .eq('id', input.workspaceId);

    await notifyGtm(input.userId, [
      '<b>GTM autopilot completed</b>',
      '',
      `Imported: ${insertedContacts.length}`,
      `Prepared with AI: ${preparedCount}`,
      enrichmentStartedCount > 0 ? `Enrichment started: ${enrichmentStartedCount}` : '',
      `Enrolled: ${enrolledCount}`,
      `Skipped/duplicates: ${skippedCount}`,
      workspace.gtm_active_sequence_id ? '' : 'No active GTM sequence is configured yet.',
    ].filter(Boolean));

    return {
      runId,
      importedCount: insertedContacts.length,
      preparedCount,
      enrichmentStartedCount,
      enrolledCount,
      skippedCount,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'GTM prospecting failed';

    if (runId) {
      await db
        .from('gtm_daily_runs')
        .update({
          status: 'failed',
          finished_at: new Date().toISOString(),
          error: message,
        })
        .eq('id', runId);
    }

    await db
      .from('workspaces')
      .update({
        gtm_last_run_at: new Date().toISOString(),
        gtm_last_run_status: 'failed',
        gtm_last_run_summary: { error: message },
      })
      .eq('id', input.workspaceId);

    await notifyGtm(input.userId, [
      '<b>GTM autopilot failed</b>',
      '',
      message,
    ]);

    return {
      runId,
      importedCount: 0,
      preparedCount: 0,
      enrolledCount: 0,
      skippedCount: 0,
      error: message,
    };
  }
}

export async function ensureIsimpleGtmWorkspace(input: {
  userId: string;
  email?: string | null;
  displayName?: string | null;
}) {
  const db = getServiceSupabase();
  const requesterEmail = input.email?.trim().toLowerCase() || '';
  const isOwner = requesterEmail === ISIMPLE_GTM_OWNER_EMAIL;

  const { data: existingWorkspaces, error: existingError } = await db
    .from('workspaces')
    .select('id, name, slug')
    .in('slug', [ISIMPLE_GTM_WORKSPACE_SLUG, LEGACY_ISIMPLE_GTM_WORKSPACE_SLUG]);

  if (existingError) throw existingError;

  const currentWorkspace = existingWorkspaces?.find((workspace) => workspace.slug === ISIMPLE_GTM_WORKSPACE_SLUG);
  const legacyWorkspace = existingWorkspaces?.find((workspace) => workspace.slug === LEGACY_ISIMPLE_GTM_WORKSPACE_SLUG);
  let workspaceId = currentWorkspace?.id || legacyWorkspace?.id;

  if (!currentWorkspace && legacyWorkspace) {
    const { error } = await db
      .from('workspaces')
      .update({
        name: ISIMPLE_GTM_WORKSPACE_NAME,
        slug: ISIMPLE_GTM_WORKSPACE_SLUG,
      })
      .eq('id', legacyWorkspace.id);

    if (error) throw error;
  } else if (currentWorkspace && currentWorkspace.name !== ISIMPLE_GTM_WORKSPACE_NAME) {
    const { error } = await db
      .from('workspaces')
      .update({ name: ISIMPLE_GTM_WORKSPACE_NAME })
      .eq('id', currentWorkspace.id);

    if (error) throw error;
  }

  if (!workspaceId) {
    if (!isOwner) {
      throw new GtmWorkspaceAccessError('You need an invitation to access isimple.');
    }

    const { data: workspace, error } = await db
      .from('workspaces')
      .insert({
        name: ISIMPLE_GTM_WORKSPACE_NAME,
        slug: ISIMPLE_GTM_WORKSPACE_SLUG,
        created_by: input.userId,
        gtm_enabled: false,
        gtm_daily_contact_limit: DEFAULT_GTM_DAILY_LIMIT,
        gtm_requires_approval: true,
        gtm_icp_queries: ISIMPLE_ICP_QUERIES,
        ai_company_description: 'isimple is an AI-native workspace that helps French property managers automate tenant requests, maintenance coordination, owner updates, document workflows, and follow-ups.',
        ai_target_industry: 'French property managers, syndic firms, administrateurs de biens, and real estate agencies',
        ai_target_roles: 'Founder, CEO, COO, property management director, syndic director, operations manager',
        ai_geographic_focus: 'France',
      })
      .select('id')
      .single();

    if (error) throw error;
    workspaceId = workspace.id;
  }

  const { data: membership } = await db
    .from('workspace_members')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('user_id', input.userId)
    .maybeSingle();

  if (!membership) {
    if (!isOwner) {
      throw new GtmWorkspaceAccessError('You need an invitation to access isimple.');
    }

    const { error } = await db.from('workspace_members').insert({
      workspace_id: workspaceId,
      user_id: input.userId,
      email: input.email || '',
      display_name: input.displayName || input.email?.split('@')[0] || 'User',
      role: 'admin',
    });

    if (error) throw error;
  }

  if (!workspaceId) throw new Error('Failed to resolve isimple GTM workspace');
  await ensureIsimpleGtmSequence(workspaceId, input.userId);

  return workspaceId;
}

async function ensureIsimpleGtmSequence(workspaceId: string, userId: string) {
  const db = getServiceSupabase();
  const templateIds: string[] = [];

  for (const template of ISIMPLE_SEQUENCE_TEMPLATES) {
    const { data: existingTemplate, error: templateLookupError } = await db
      .from('templates')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('name', template.name)
      .maybeSingle();

    if (templateLookupError) throw templateLookupError;

    if (existingTemplate?.id) {
      const { error: updateTemplateError } = await db
        .from('templates')
        .update({
          subject: template.subject,
          html_content: template.htmlContent,
          variables: ['first_name', 'last_name', 'company_name', 'job_title', 'ai_personalized_line'],
          is_active: true,
        })
        .eq('id', existingTemplate.id);

      if (updateTemplateError) throw updateTemplateError;
      templateIds.push(existingTemplate.id);
      continue;
    }

    const { data: insertedTemplate, error: insertTemplateError } = await db
      .from('templates')
      .insert({
        workspace_id: workspaceId,
        created_by: userId,
        name: template.name,
        subject: template.subject,
        html_content: template.htmlContent,
        variables: ['first_name', 'last_name', 'company_name', 'job_title', 'ai_personalized_line'],
        is_active: true,
      })
      .select('id')
      .single();

    if (insertTemplateError) throw insertTemplateError;
    templateIds.push(insertedTemplate.id);
  }

  const { data: existingSequence, error: sequenceLookupError } = await db
    .from('campaign_sequences')
    .select('id, status')
    .eq('workspace_id', workspaceId)
    .eq('name', ISIMPLE_GTM_SEQUENCE_NAME)
    .maybeSingle();

  if (sequenceLookupError) throw sequenceLookupError;

  let sequenceId = existingSequence?.id as string | undefined;
  if (!sequenceId) {
    const { data: insertedSequence, error: insertSequenceError } = await db
      .from('campaign_sequences')
      .insert({
        workspace_id: workspaceId,
        name: ISIMPLE_GTM_SEQUENCE_NAME,
        template_variables: {},
        created_by: userId,
        status: 'active',
      })
      .select('id')
      .single();

    if (insertSequenceError) throw insertSequenceError;
    sequenceId = insertedSequence.id;
  } else if (existingSequence?.status !== 'active') {
    const { error: activateError } = await db
      .from('campaign_sequences')
      .update({ status: 'active' })
      .eq('id', sequenceId);

    if (activateError) throw activateError;
  }

  const { data: existingSteps, error: stepsLookupError } = await db
    .from('campaign_sequence_steps')
    .select('id, step_order')
    .eq('sequence_id', sequenceId);

  if (stepsLookupError) throw stepsLookupError;

  for (let stepOrder = 0; stepOrder < ISIMPLE_SEQUENCE_TEMPLATES.length; stepOrder++) {
    if (existingSteps?.some((step) => step.step_order === stepOrder)) continue;

    const { error: insertStepError } = await db
      .from('campaign_sequence_steps')
      .insert({
        sequence_id: sequenceId,
        template_id: templateIds[stepOrder],
        step_order: stepOrder,
        delay_days: ISIMPLE_SEQUENCE_TEMPLATES[stepOrder].delayDays,
      });

    if (insertStepError) throw insertStepError;
  }

  const { error: workspaceUpdateError } = await db
    .from('workspaces')
    .update({
      gtm_daily_contact_limit: DEFAULT_GTM_DAILY_LIMIT,
      gtm_active_sequence_id: sequenceId,
      gtm_requires_approval: true,
      gtm_icp_queries: ISIMPLE_ICP_QUERIES,
    })
    .eq('id', workspaceId);

  if (workspaceUpdateError) throw workspaceUpdateError;
}
