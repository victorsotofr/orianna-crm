import { NextRequest, NextResponse } from 'next/server';
import { generateText } from 'ai';

import { aiModel } from '@/lib/ai-provider';
import { searchProspecting } from '@/lib/linkup';
import { detectAgentLanguage, normalizeAgentError } from '@/lib/outreach-agent/copy';
import { getOutreachSession, parseJsonFromText } from '@/lib/outreach';
import { getServiceSupabase } from '@/lib/supabase';
import { createServerClient } from '@/lib/supabase-server';
import { getWorkspaceContext } from '@/lib/workspace';

export const maxDuration = 300;

interface ExtractedProspect {
  first_name: string;
  last_name: string;
  company_name: string;
  company_domain: string;
  job_title: string;
  linkedin_url: string;
  location: string;
  source_url: string;
  source_label: string;
  confidence: string;
  reason: string;
}

interface SearchBrief extends Record<string, unknown> {
  target: string;
  location: string;
  companySize: string;
  roles: string[];
  exclusions: string[];
  outreachAngle: string;
  searchQuery: string;
}

interface SearchAttempt {
  label: string;
  rawResults: string;
  prospects: ExtractedProspect[];
}

function searchTimeoutMs(depth: 'standard' | 'deep') {
  const configured = Number(process.env.LINKUP_SEARCH_TIMEOUT_MS || 0);
  const fallback = depth === 'standard' ? 60_000 : 90_000;
  if (!Number.isFinite(configured) || configured <= 0) return fallback;
  return Math.min(Math.max(configured, 10_000), 180_000);
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function isUsefulProspect(value: unknown, brief: Record<string, unknown>): value is ExtractedProspect {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ExtractedProspect>;
  if (!candidate.first_name || !candidate.last_name || !candidate.company_name) return false;
  if (!candidate.linkedin_url && !candidate.source_url) return false;
  const text = normalizeDedupeText([
    candidate.job_title,
    candidate.company_name,
    candidate.location,
    candidate.reason,
  ].filter(Boolean).join(' '));

  const location = typeof brief.location === 'string' ? brief.location : '';
  if (location && !textMatchesValue(text, location)) return false;

  const roles = Array.isArray(brief.roles)
    ? brief.roles.filter((role): role is string => typeof role === 'string' && role.trim().length > 2)
    : [];
  if (roles.length && !roles.some((role) => textMatchesValue(text, role))) return false;

  const companySize = typeof brief.companySize === 'string' ? normalizeDedupeText(brief.companySize) : '';
  if (/(independant|independent|small|petit|moyen|mid)/.test(companySize)) {
    const independentSignals = ['independant', 'independent', 'cabinet', 'agence', 'regie', 'local', 'dirigeant', 'gerant', 'fondateur', 'owner', 'associe'];
    if (!independentSignals.some((signal) => text.includes(signal))) return false;
  }

  return true;
}

function normalizeDedupeText(value: string | null | undefined) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLowerCase();
}

function meaningfulTokens(value: string) {
  return normalizeDedupeText(value)
    .split(' ')
    .filter((token) => token.length > 3 && !['avec', 'dans', 'pour', 'from', 'with', 'area', 'region'].includes(token));
}

function textMatchesValue(text: string, value: string) {
  const normalizedValue = normalizeDedupeText(value);
  if (!normalizedValue) return true;
  if (text.includes(normalizedValue)) return true;
  const tokens = meaningfulTokens(value);
  if (!tokens.length) return true;
  return tokens.some((token) => text.includes(token));
}

function prospectKey(prospect: ExtractedProspect) {
  if (prospect.linkedin_url) return `linkedin:${prospect.linkedin_url.trim().toLowerCase()}`;
  return [
    normalizeDedupeText(prospect.first_name),
    normalizeDedupeText(prospect.last_name),
    normalizeDedupeText(prospect.company_domain || prospect.company_name),
  ].join(':');
}

function dedupeProspects(prospects: ExtractedProspect[]) {
  const seen = new Set<string>();
  const unique: ExtractedProspect[] = [];
  for (const prospect of prospects) {
    const key = prospectKey(prospect);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(prospect);
  }
  return unique;
}

function validHttpUrl(value: string | null | undefined) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    return url.toString();
  } catch {
    return '';
  }
}

function validLinkedinUrl(value: string | null | undefined) {
  const url = validHttpUrl(value);
  if (!url) return '';
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.replace(/^www\./, '').toLowerCase();
    return hostname === 'linkedin.com' || hostname.endsWith('.linkedin.com') ? parsed.toString() : '';
  } catch {
    return '';
  }
}

function normalizeProspect(prospect: ExtractedProspect): ExtractedProspect {
  return {
    ...prospect,
    linkedin_url: validLinkedinUrl(prospect.linkedin_url),
    source_url: validHttpUrl(prospect.source_url || prospect.linkedin_url),
    confidence: ['high', 'medium', 'low'].includes(String(prospect.confidence)) ? prospect.confidence : 'medium',
  };
}

function fallbackBrief(prompt: string): SearchBrief {
  return {
    target: prompt,
    location: '',
    companySize: '',
    roles: [],
    exclusions: [],
    outreachAngle: 'Relevant, truthful B2B outreach based on the user request',
    searchQuery: prompt,
  };
}

async function buildSearchBrief(prompt: string, existing: Record<string, unknown>): Promise<SearchBrief> {
  void existing;
  try {
    const { text } = await generateText({
      model: aiModel('prompt'),
      system: `You convert one outbound prospecting request into a strict search brief.

Return ONLY valid JSON:
{
  "target": "",
  "location": "",
  "companySize": "",
  "roles": [],
  "exclusions": [],
  "outreachAngle": "",
  "searchQuery": ""
}

Rules:
- Use only this latest user request, not earlier chat messages.
- Preserve language, geography, role, industry, company size, independence/franchise intent, and exclusions.
- Keep searchQuery specific for named-person prospecting.
- Be industry agnostic; do not assume real estate unless the user says it.`,
      prompt,
    });
    return {
      ...fallbackBrief(prompt),
      ...parseJsonFromText<Partial<SearchBrief>>(text, {}),
    };
  } catch (error) {
    console.warn('Outreach search brief generation failed:', error);
    return { ...fallbackBrief(prompt), searchQuery: prompt };
  }
}

function suggestedQueries(prompt: string, brief: Record<string, unknown>) {
  const target = typeof brief.target === 'string' && brief.target.trim() ? brief.target.trim() : prompt;
  const location = typeof brief.location === 'string' && brief.location.trim() ? brief.location.trim() : '';
  return [
    `${target}${location ? ` in ${location}` : ''} LinkedIn founders directors decision makers`,
    `${target}${location ? ` ${location}` : ''} company team page leadership`,
    `${target}${location ? ` ${location}` : ''} professional directory named executives managers`,
  ];
}

function buildInitialSearchQuery(limit: number, prompt: string, brief: Record<string, unknown>) {
  return `You are an expert B2B prospecting researcher.

Objective: Find up to ${limit} strictly verified named B2B prospects for this outbound request. Do not return generic companies or weak matches.

User request: ${prompt}

Structured brief:
${JSON.stringify(brief, null, 2)}

Prioritize:
- Named decision-makers, not generic company listings
- Role, industry, company size, geography, and buying context explicitly requested by the user
- LinkedIn profile URL when available
- Company website/domain and a source URL supporting the match
- Strict fit over quantity. If only a few people are verified, return only those few.

Do not require public email addresses at this stage. The user will enrich emails after reviewing the first list.`;
}

function buildRetrySearchQuery(limit: number, prompt: string, brief: Record<string, unknown>) {
  const searchQuery = typeof brief.searchQuery === 'string' && brief.searchQuery.trim()
    ? brief.searchQuery.trim()
    : prompt;
  return `You are an expert B2B prospecting researcher.

Objective: Find ${limit} explicitly named people matching this outbound request. Do not return generic companies.

User request: ${prompt}
Search focus: ${searchQuery}
Structured brief: ${JSON.stringify(brief)}

Research instructions:
1. Search LinkedIn profiles, company team pages, professional directories, and local business listings for named people.
2. For each candidate, verify name, role, company, geography, and source.
3. Prioritize founders, owners, executives, directors, managers, operations leaders, and other decision-makers matching the requested role and industry.
4. Include a LinkedIn profile or source URL when available.
5. Leave email blank if it is not visible; email enrichment happens later.

Return research notes listing only explicitly named people.`;
}

async function extractProspects(rawResults: string, prompt: string, brief: Record<string, unknown>): Promise<ExtractedProspect[]> {
  const { text } = await generateText({
    model: aiModel('extract'),
    system: `Extract outreach prospects from research results.

Return ONLY a valid JSON array. No markdown.
Each object must have exactly:
{
  "first_name": "",
  "last_name": "",
  "company_name": "",
  "company_domain": "",
  "job_title": "",
  "linkedin_url": "",
  "location": "",
  "source_url": "",
  "source_label": "",
  "confidence": "high|medium|low",
  "reason": ""
}

Rules:
- Extract only explicitly named people that strictly match the user request and structured brief.
- first_name and last_name are required.
- Do not invent LinkedIn URLs, domains, names, roles, or locations.
- Skip generic companies, weak role matches, wrong geographies, and candidates that do not match the requested company type.
- Include only candidates with at least one valid public source URL. Prefer LinkedIn profile URLs when available.
- Keep reason under 140 characters.
- Skip duplicates.`,
    prompt: `User request: ${prompt}

Structured brief:
${JSON.stringify(brief, null, 2)}

Research results:
${rawResults}`,
  });

  const parsed = parseJsonFromText<unknown[]>(text, []);
  return dedupeProspects(parsed
    .filter((value): value is ExtractedProspect => Boolean(value && typeof value === 'object'))
    .map((value) => normalizeProspect(value))
    .filter((prospect) => isUsefulProspect(prospect, brief)));
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let activePromptForError = '';
  let limitForError = 20;
  let briefForError: Record<string, unknown> = {};
  let workspaceIdForError: string | null = null;
  try {
    const { id } = await params;
    const { supabase, error: clientError } = await createServerClient();
    if (!supabase || clientError) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const wsId = request.headers.get('x-workspace-id');
    const ctx = await getWorkspaceContext(supabase, user.id, wsId);
    if (!ctx) return NextResponse.json({ error: 'No workspace' }, { status: 403 });
    workspaceIdForError = ctx.workspaceId;

    const session = await getOutreachSession(supabase, ctx.workspaceId, id);
    if (!session) return NextResponse.json({ error: 'Outreach session not found' }, { status: 404 });

    const body = await request.json().catch(() => ({}));
    const activePrompt = typeof body.prompt === 'string' && body.prompt.trim()
      ? body.prompt.trim()
      : session.prompt;
    const limit = Number.isInteger(Number(body.limit)) ? Math.min(Math.max(Number(body.limit), 5), 50) : 20;
    activePromptForError = activePrompt;
    limitForError = limit;
    const serviceSupabase = getServiceSupabase();

    const { data: userSettings } = await serviceSupabase
      .from('user_settings')
      .select('linkup_api_key_encrypted')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!userSettings?.linkup_api_key_encrypted) {
      const normalized = normalizeAgentError(
        new Error('Linkup API key not configured. Go to Settings > Integrations.'),
        detectAgentLanguage(activePrompt),
        'search'
      );
      return NextResponse.json({
        error: normalized.message,
        userMessage: normalized.message,
        retryable: normalized.retryable,
        retryPrompt: activePrompt,
        requestedLimit: limit,
        suggestedQueries: suggestedQueries(activePrompt, fallbackBrief(activePrompt)),
      }, { status: 400 });
    }

    const { data: workspace } = await serviceSupabase
      .from('workspaces')
      .select('linkup_prospecting_query')
      .eq('id', ctx.workspaceId)
      .maybeSingle();

    await supabase
      .from('outreach_sessions')
      .update({ status: 'searching', error: null, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('workspace_id', ctx.workspaceId);

    const existingBrief = (session.structured_brief && typeof session.structured_brief === 'object'
      ? session.structured_brief
      : {}) as Record<string, unknown>;
    const brief = await buildSearchBrief(activePrompt, existingBrief);
    briefForError = brief;
    const minUsefulProspects = Math.min(3, limit);
    const attempts: SearchAttempt[] = [];

    const rawResults = await withTimeout(
      searchProspecting(
        userSettings.linkup_api_key_encrypted,
        buildInitialSearchQuery(limit, activePrompt, brief),
        workspace?.linkup_prospecting_query,
        'standard',
        'sourcedAnswer'
      ),
      searchTimeoutMs('standard'),
      'Linkup standard prospect search'
    );
    attempts.push({
      label: 'initial',
      rawResults,
      prospects: await extractProspects(rawResults, activePrompt, brief),
    });

    if (dedupeProspects(attempts.flatMap((attempt) => attempt.prospects)).length < minUsefulProspects) {
      try {
        const retryRawResults = await withTimeout(
          searchProspecting(
            userSettings.linkup_api_key_encrypted,
            buildRetrySearchQuery(limit, activePrompt, brief),
            workspace?.linkup_prospecting_query,
            'deep',
            'sourcedAnswer'
          ),
          searchTimeoutMs('deep'),
          'Linkup deep prospect search'
        );
        attempts.push({
          label: 'retry_named_people',
          rawResults: retryRawResults,
          prospects: await extractProspects(retryRawResults, activePrompt, brief),
        });
      } catch (retryError) {
        if (dedupeProspects(attempts.flatMap((attempt) => attempt.prospects)).length === 0) {
          throw retryError;
        }
        console.warn('Outreach retry search failed; returning initial prospects:', retryError);
      }
    }

    const prospects = dedupeProspects(attempts.flatMap((attempt) => attempt.prospects)).slice(0, limit);
    const emptyReason = prospects.length === 0
      ? 'No explicitly named prospects could be verified from the search results. Try a narrower role, city, or company type.'
      : null;

    await supabase
      .from('outreach_session_prospects')
      .delete()
      .eq('session_id', id)
      .eq('workspace_id', ctx.workspaceId)
      .is('contact_id', null);

    const rows = prospects.map((prospect) => ({
      session_id: id,
      workspace_id: ctx.workspaceId,
      first_name: prospect.first_name || null,
      last_name: prospect.last_name || null,
      company_name: prospect.company_name || null,
      company_domain: prospect.company_domain || null,
      job_title: prospect.job_title || null,
      linkedin_url: prospect.linkedin_url || null,
      location: prospect.location || null,
      source_url: prospect.source_url || null,
      source_label: prospect.source_label || null,
      confidence: prospect.confidence || 'medium',
      reason: prospect.reason || null,
      raw_result: prospect,
      selected: true,
      ignored: false,
    }));

    const { data: inserted, error: insertError } = rows.length
      ? await supabase.from('outreach_session_prospects').insert(rows).select()
      : { data: [], error: null };

    if (insertError) throw insertError;

    await supabase
      .from('outreach_sessions')
      .update({
        status: prospects.length > 0 ? 'ready' : 'empty',
        structured_brief: brief,
        raw_search_result: JSON.stringify({
          prompt: activePrompt,
          requestedLimit: limit,
          attempts: attempts.map((attempt) => ({
            label: attempt.label,
            extracted: attempt.prospects.length,
            rawResults: attempt.rawResults,
          })),
        }),
        error: emptyReason,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('workspace_id', ctx.workspaceId);

    return NextResponse.json({
      prospects: inserted || [],
      requestedLimit: limit,
      verifiedCount: prospects.length,
      brief,
      rawResults: attempts.map((attempt) => attempt.rawResults).join('\n\n--- retry ---\n\n'),
      attempts: attempts.map((attempt) => ({ label: attempt.label, extracted: attempt.prospects.length })),
      emptyReason,
      suggestedQueries: prospects.length === 0 ? suggestedQueries(activePrompt, brief) : [],
    });
  } catch (error: unknown) {
    const lang = detectAgentLanguage(activePromptForError);
    const normalized = normalizeAgentError(error, lang, 'search');
    console.error('Outreach search error:', error);
    const { id } = await params;
    try {
      const { supabase } = await createServerClient();
      if (supabase) {
        let query = supabase
          .from('outreach_sessions')
          .update({ status: 'failed', error: normalized.message, updated_at: new Date().toISOString() })
          .eq('id', id);
        if (workspaceIdForError) query = query.eq('workspace_id', workspaceIdForError);
        await query;
      }
    } catch {}
    const status = normalized.code === 'timeout' ? 504 : normalized.code === 'missing_configuration' ? 400 : 500;
    return NextResponse.json({
      error: normalized.message,
      userMessage: normalized.message,
      retryable: normalized.retryable,
      retryPrompt: activePromptForError,
      requestedLimit: limitForError,
      brief: briefForError,
      suggestedQueries: activePromptForError ? suggestedQueries(activePromptForError, briefForError) : [],
    }, { status });
  }
}
