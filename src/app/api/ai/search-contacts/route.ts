import { NextRequest, NextResponse } from 'next/server';
// import * as Sentry from '@sentry/nextjs';
import { createServerClient } from '@/lib/supabase-server';
import { getWorkspaceContext } from '@/lib/workspace';
import { getServiceSupabase } from '@/lib/supabase';
import { searchProspecting } from '@/lib/linkup';
import { generateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';


export const maxDuration = 300;

export interface ProspectedContact {
  first_name: string;
  last_name: string;
  company_name: string;
  job_title: string;
  email: string;
  location: string;
  linkedin_url: string;
  company_domain: string;
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, error: clientError } = await createServerClient();
    if (!supabase || clientError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const wsId = request.headers.get('x-workspace-id');
    const ctx = await getWorkspaceContext(supabase, user.id, wsId);
    if (!ctx) {
      return NextResponse.json({ error: 'No workspace' }, { status: 403 });
    }

    const { query, depth: requestedDepth, outputType: requestedOutputType } = await request.json();
    if (!query || typeof query !== 'string' || !query.trim()) {
      return NextResponse.json({ error: 'query is required' }, { status: 400 });
    }
    const depth: 'standard' | 'deep' = requestedDepth === 'deep' ? 'deep' : 'standard';
    const outputType: 'sourcedAnswer' | 'searchResults' = requestedOutputType === 'searchResults' ? 'searchResults' : 'sourcedAnswer';

    // Fetch user's Linkup API key
    const serviceSupabase = getServiceSupabase();
    const { data: userSettings } = await serviceSupabase
      .from('user_settings')
      .select('linkup_api_key_encrypted')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!userSettings?.linkup_api_key_encrypted) {
      return NextResponse.json({ error: 'Linkup API key not configured. Go to Settings > Integrations.' }, { status: 400 });
    }

    // Fetch workspace config for custom prospecting query
    const { data: workspace } = await serviceSupabase
      .from('workspaces')
      .select('linkup_prospecting_query')
      .eq('id', ctx.workspaceId)
      .maybeSingle();

    // Run Linkup search — returns free-text research results
    const rawResults = await searchProspecting(
      userSettings.linkup_api_key_encrypted,
      query.trim(),
      workspace?.linkup_prospecting_query,
      depth,
      outputType
    );

    // Extract structured contacts with Claude Haiku (fast, cheap, sufficient for JSON extraction)
    const { text } = await generateText({
      model: anthropic('claude-haiku-4-5'),
      system: `You are a data extraction specialist. Extract structured contact records from web research results.

Rules:
- Only extract people explicitly named in the research results
- first_name and last_name are required — skip anyone without a clear full name
- Do not invent, infer, or guess any field — use empty string "" for anything not explicitly stated
- If the same person appears multiple times, include them only once
- Return ONLY a valid JSON array, no markdown, no commentary, no explanation`,
      prompt: `Extract all named professionals from these research results and return them as a JSON array.

Each object must have exactly these fields:
{"first_name":"","last_name":"","company_name":"","job_title":"","email":"","location":"","linkedin_url":"","company_domain":""}

Research results:
${rawResults}`,
    });

    // Parse contacts
    let contacts: ProspectedContact[] = [];
    try {
      const cleaned = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) {
        contacts = parsed.filter((c: any) => c.first_name && c.last_name);
      }
    } catch {
      console.error('Failed to parse extraction response:', text.substring(0, 200));
      return NextResponse.json({ contacts: [], existingEmails: [] });
    }

    // Check for existing contacts by email in this workspace
    const emails = contacts
      .map(c => c.email?.toLowerCase())
      .filter((e): e is string => !!e && e.length > 0);

    let existingEmails: string[] = [];
    if (emails.length > 0) {
      const { data: existing } = await serviceSupabase
        .from('contacts')
        .select('email')
        .eq('workspace_id', ctx.workspaceId)
        .in('email', emails);

      existingEmails = (existing || []).map(c => c.email.toLowerCase());
    }

    return NextResponse.json({ contacts, existingEmails });
  } catch (error: any) {
    console.error('Search contacts error:', error);
    // Sentry.captureException(error);
    return NextResponse.json({ error: error.message || 'Search failed' }, { status: 500 });
  }
}
