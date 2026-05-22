import { NextRequest, NextResponse } from 'next/server';
import { generateText } from 'ai';

import { aiModel } from '@/lib/ai-provider';
import { parseJsonFromText } from '@/lib/outreach';
import { createServerClient } from '@/lib/supabase-server';
import { getWorkspaceContext } from '@/lib/workspace';

export const maxDuration = 60;

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
    outreachAngle: 'Operational automation and faster customer follow-up',
    searchQuery: prompt,
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

    const { data: sessions, error } = await supabase
      .from('outreach_sessions')
      .select('id, prompt, structured_brief, status, created_at, updated_at')
      .eq('workspace_id', ctx.workspaceId)
      .order('created_at', { ascending: false })
      .limit(12);

    if (error) throw error;
    return NextResponse.json({ sessions: sessions || [] });
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

    const { prompt } = await request.json();
    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return NextResponse.json({ error: 'prompt is required' }, { status: 400 });
    }

    const cleanPrompt = prompt.trim();
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
- Preserve the user's language and geography.
- Keep searchQuery specific enough for web prospecting.
- Do not invent a product feature beyond operational automation, tenant/request handling, maintenance, reporting, and follow-ups.`,
        prompt: cleanPrompt,
      });
      structuredBrief = {
        ...structuredBrief,
        ...parseJsonFromText<Partial<OutreachBrief>>(text, {}),
      };
    } catch (error) {
      console.warn('Outreach brief generation failed:', error);
    }

    const { data: session, error } = await supabase
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

    if (error) throw error;
    return NextResponse.json({ session }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create outreach session';
    console.error('Outreach session create error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
