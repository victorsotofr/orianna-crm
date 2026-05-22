import { NextRequest, NextResponse } from 'next/server';
import { generateText } from 'ai';

import { aiModel } from '@/lib/ai-provider';
import { searchProspecting } from '@/lib/linkup';
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

function isUsefulProspect(value: unknown): value is ExtractedProspect {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ExtractedProspect>;
  return Boolean(candidate.first_name && candidate.last_name && (candidate.company_name || candidate.linkedin_url));
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
    const limit = Number.isInteger(Number(body.limit)) ? Math.min(Math.max(Number(body.limit), 5), 40) : 20;
    const serviceSupabase = getServiceSupabase();

    const { data: userSettings } = await serviceSupabase
      .from('user_settings')
      .select('linkup_api_key_encrypted')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!userSettings?.linkup_api_key_encrypted) {
      return NextResponse.json({ error: 'Linkup API key not configured. Go to Settings > Integrations.' }, { status: 400 });
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

    const brief = session.structured_brief || {};
    const searchQuery = `Find ${limit} named B2B prospects for this outbound request.

User request: ${session.prompt}

Structured brief:
${JSON.stringify(brief, null, 2)}

Prioritize:
- Named decision-makers, not generic company listings
- Property management, syndic, administrateur de biens, real estate operations, maintenance, tenant request, or owner reporting context where relevant
- LinkedIn profile URL when available
- Company website/domain and a source URL supporting the match

Do not require public email addresses at this stage. The user will enrich emails after reviewing the first list.`;

    const rawResults = await searchProspecting(
      userSettings.linkup_api_key_encrypted,
      searchQuery,
      workspace?.linkup_prospecting_query,
      'standard',
      'sourcedAnswer'
    );

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
- Extract only explicitly named people.
- Do not invent LinkedIn URLs or domains.
- Keep reason under 140 characters.
- Skip duplicates.`,
      prompt: `User request: ${session.prompt}

Research results:
${rawResults}`,
    });

    const parsed = parseJsonFromText<unknown[]>(text, []);
    const prospects = parsed.filter(isUsefulProspect).slice(0, limit);

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
        status: 'ready',
        raw_search_result: rawResults,
        error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('workspace_id', ctx.workspaceId);

    return NextResponse.json({ prospects: inserted || [], rawResults });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Search failed';
    console.error('Outreach search error:', error);
    const { id } = await params;
    try {
      const { supabase } = await createServerClient();
      if (supabase) {
        await supabase.from('outreach_sessions').update({ status: 'failed', error: message }).eq('id', id);
      }
    } catch {}
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
