import { NextRequest, NextResponse } from 'next/server';
import { generateText } from 'ai';

import { aiModel } from '@/lib/ai-provider';
import { deriveOutreachThreadTitle, parseJsonFromText } from '@/lib/outreach';
import { createServerClient } from '@/lib/supabase-server';
import { getWorkspaceContext } from '@/lib/workspace';

export const maxDuration = 60;

const THREAD_COLUMNS = 'id, prompt, title, structured_brief, status, error, archived_at, deleted_at, duplicated_from_session_id, last_message_at, metadata, created_at, updated_at';
const LEGACY_THREAD_COLUMNS = 'id, prompt, structured_brief, status, error, created_at, updated_at';

interface OutreachBrief {
  target: string;
  location: string;
  companySize: string;
  roles: string[];
  exclusions: string[];
  outreachAngle: string;
  searchQuery: string;
}

function fallbackBrief(prompt: string): OutreachBrief {
  return {
    target: prompt,
    location: '',
    companySize: '',
    roles: [],
    exclusions: [],
    outreachAngle: 'Relevant, truthful B2B outreach based on the workspace offer and the user request',
    searchQuery: prompt,
  };
}

function isMissingThreadCrudColumnError(error: unknown) {
  const err = error as { code?: string; message?: string } | null;
  return err?.code === 'PGRST204' || err?.code === '42703' || Boolean(err?.message?.includes('archived_at'));
}

function normalizeThread(row: Record<string, unknown>) {
  const prompt = typeof row.prompt === 'string' ? row.prompt : '';
  return {
    ...row,
    title: typeof row.title === 'string' && row.title.trim() ? row.title : deriveOutreachThreadTitle(prompt),
    archived_at: row.archived_at || null,
    deleted_at: row.deleted_at || null,
    last_message_at: row.last_message_at || row.updated_at || row.created_at,
    metadata: row.metadata || {},
  };
}

export async function GET(request: NextRequest) {
  try {
    const { supabase, error: clientError } = await createServerClient();
    if (!supabase || clientError) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const wsId = request.headers.get('x-workspace-id');
    const ctx = await getWorkspaceContext(supabase, user.id, wsId);
    if (!ctx) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('query')?.trim();
    const status = searchParams.get('status')?.trim();
    const archivedMode = searchParams.get('archived');
    const deletedMode = searchParams.get('deleted');
    const includeArchived = archivedMode === 'true' || archivedMode === 'include';
    const onlyArchived = archivedMode === 'only';
    const includeDeleted = deletedMode === 'true' || deletedMode === 'include';
    const onlyDeleted = deletedMode === 'only';

    let sessionsQuery = supabase
      .from('outreach_sessions')
      .select(THREAD_COLUMNS)
      .eq('workspace_id', ctx.workspaceId)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(50);

    if (onlyDeleted) sessionsQuery = sessionsQuery.not('deleted_at', 'is', null);
    else if (!includeDeleted) sessionsQuery = sessionsQuery.is('deleted_at', null);
    if (onlyArchived) sessionsQuery = sessionsQuery.not('archived_at', 'is', null);
    if (!onlyDeleted && !includeArchived && !onlyArchived) sessionsQuery = sessionsQuery.is('archived_at', null);
    if (status && status !== 'all') sessionsQuery = sessionsQuery.eq('status', status);
    if (query) {
      const escapedQuery = query.replace(/[%_]/g, '\\$&');
      sessionsQuery = sessionsQuery.or(`prompt.ilike.%${escapedQuery}%,title.ilike.%${escapedQuery}%`);
    }

    const sessionsResult = await sessionsQuery;
    let sessions = sessionsResult.data as Record<string, unknown>[] | null;
    let error = sessionsResult.error;

    if (error && isMissingThreadCrudColumnError(error)) {
      let legacyQuery = supabase
        .from('outreach_sessions')
        .select(LEGACY_THREAD_COLUMNS)
        .eq('workspace_id', ctx.workspaceId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (status && status !== 'all') legacyQuery = legacyQuery.eq('status', status);
      if (query) legacyQuery = legacyQuery.ilike('prompt', `%${query}%`);
      const legacyResult = await legacyQuery;
      sessions = legacyResult.data as Record<string, unknown>[] | null;
      error = legacyResult.error;
    }

    if (error) throw error;
    return NextResponse.json({ sessions: (sessions || []).map((row) => normalizeThread(row)) });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load outreach sessions';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, error: clientError } = await createServerClient();
    if (!supabase || clientError) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const wsId = request.headers.get('x-workspace-id');
    const ctx = await getWorkspaceContext(supabase, user.id, wsId);
    if (!ctx) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

    const { prompt, title } = await request.json();
    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return NextResponse.json({ error: 'prompt is required' }, { status: 400 });
    }

    const cleanPrompt = prompt.trim();
    const threadTitle = typeof title === 'string' && title.trim() ? deriveOutreachThreadTitle(title) : deriveOutreachThreadTitle(cleanPrompt);
    let structuredBrief = fallbackBrief(cleanPrompt);

    try {
      const { text } = await generateText({
        model: aiModel('prompt'),
        system: `You convert outbound requests into compact prospecting briefs.

Return ONLY valid JSON with this exact shape:
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
- Preserve the user's language, industry, roles, geography, exclusions, and company-size intent.
- If the user asks for status, automations, inbox, or pipeline instead of prospecting, keep target/searchQuery as the raw request.
- Keep searchQuery specific enough for named-person web prospecting only when the request is prospecting-related.
- Be industry agnostic. Do not assume real estate, property management, or any fixed ICP unless the user says it.`,
        prompt: cleanPrompt,
      });
      structuredBrief = {
        ...structuredBrief,
        ...parseJsonFromText<Partial<OutreachBrief>>(text, {}),
      };
    } catch (error) {
      console.warn('Outreach brief generation failed:', error);
    }

    let { data: session, error } = await supabase
      .from('outreach_sessions')
      .insert({
        workspace_id: ctx.workspaceId,
        user_id: user.id,
        prompt: cleanPrompt,
        title: threadTitle,
        structured_brief: structuredBrief,
        status: 'draft',
        metadata: { source: 'chat' },
        last_message_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error && isMissingThreadCrudColumnError(error)) {
      const fallback = await supabase
        .from('outreach_sessions')
        .insert({
          workspace_id: ctx.workspaceId,
          user_id: user.id,
          prompt: cleanPrompt,
          structured_brief: structuredBrief,
          status: 'draft',
        })
        .select()
        .single();
      session = fallback.data;
      error = fallback.error;
    }

    if (error) throw error;
    return NextResponse.json({ session }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create outreach session';
    console.error('Outreach session create error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
