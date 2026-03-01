import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { getWorkspaceContext } from '@/lib/workspace';
import { getServiceSupabase } from '@/lib/supabase';
import { searchProspecting } from '@/lib/linkup';
import { generateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { reportError } from '@/lib/error-alerting';

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

    const { query } = await request.json();
    if (!query || typeof query !== 'string' || !query.trim()) {
      return NextResponse.json({ error: 'query is required' }, { status: 400 });
    }

    // Get workspace config
    const serviceSupabase = getServiceSupabase();
    const { data: workspace } = await serviceSupabase
      .from('workspaces')
      .select('linkup_api_key_encrypted, linkup_prospecting_query')
      .eq('id', ctx.workspaceId)
      .single();

    if (!workspace?.linkup_api_key_encrypted) {
      return NextResponse.json({ error: 'Linkup API key not configured' }, { status: 400 });
    }

    // Run Linkup deep search
    const rawResults = await searchProspecting(
      workspace.linkup_api_key_encrypted,
      query.trim(),
      workspace.linkup_prospecting_query
    );

    // Extract structured contacts with Claude
    const { text } = await generateText({
      model: anthropic('claude-sonnet-4-5-20250929'),
      system: `You extract structured contact data from web research results.

Given raw search results, extract a JSON array of contacts found. Each contact object must have exactly these fields:
- first_name (string)
- last_name (string)
- company_name (string)
- job_title (string)
- email (string, empty if not found)
- location (string, empty if not found)
- linkedin_url (string, empty if not found)
- company_domain (string, empty if not found)

Rules:
- Only include real people clearly identified in the results
- Do not invent or guess any data — use empty string for unknown fields
- first_name and last_name are required — skip contacts without a clear name
- Return ONLY a valid JSON array, no markdown code blocks, no commentary`,
      prompt: `Extract contacts from these search results:\n\n${rawResults}`,
    });

    // Parse contacts
    let contacts: ProspectedContact[] = [];
    try {
      const cleaned = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) {
        contacts = parsed.filter(
          (c: any) => c.first_name && c.last_name
        );
      }
    } catch {
      console.error('Failed to parse AI contacts response:', text.substring(0, 500));
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
    reportError('POST /api/ai/search-contacts', error.message || 'Search failed');
    return NextResponse.json({ error: error.message || 'Search failed' }, { status: 500 });
  }
}
