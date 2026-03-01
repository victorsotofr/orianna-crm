import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { getWorkspaceContext } from '@/lib/workspace';
import { generateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';

const CLAUDE_PROMPT_GUIDANCE = `You are improving an AI system prompt that instructs Claude (an LLM) on how to process data and produce output.

Best practices for Claude prompts:
- Add clear structure with sections (MISSION, RULES, FORMAT, EXAMPLES)
- Be explicit about constraints (length, tone, language, format)
- Include 2-3 concrete examples of desired output
- Specify what NOT to do (common failure modes)
- Put the output format instruction at the end
- If scoring: ensure axes are measurable with clear point ranges that sum correctly
- If personalization: specify tone, length, formality, and what data points to reference`;

const LINKUP_QUERY_GUIDANCE = `You are improving a search query for Linkup, an agentic web research API.

Linkup best practices (from official documentation):
1. STRUCTURE: Use the 4-component format: Goal (what to find), Scope (where to look), Criteria (what data points), Format (how to return results)
2. ROLE: Start with "You are an expert [researcher/analyst]" — Linkup follows instructions literally
3. SCRAPER: Explicitly instruct to "scrape the page/URL" when you need full page content vs search snippets
4. SEQUENTIAL SEARCH: For deep search, use multi-step instructions: "First find X, then scrape Y, then extract Z"
5. MULTIPLE SEARCHES: Say "run several searches with adjacent keywords" for better source coverage
6. SPECIFICITY: Name exact data points to extract (size, funding amount, founding year) rather than vague asks
7. Be explicit about what to return in the summary

Common mistakes to fix:
- Vague queries like "company info" → specify exactly what data points
- Missing scraper instructions → add "scrape the homepage/website"
- Single-pass when multi-step needed → add sequential instructions
- No output structure → specify what sections to return`;

const TYPE_SPECIFIC: Record<string, string> = {
  personalization_prompt: CLAUDE_PROMPT_GUIDANCE,
  scoring_prompt: CLAUDE_PROMPT_GUIDANCE,
  personalization_linkup_company: LINKUP_QUERY_GUIDANCE + `\n\nThis query is used to research a COMPANY for personalizing cold emails.
Template variables to preserve exactly: {companyName}, {domainPart}
Focus on: company description, recent news, growth signals, team/culture — data useful for writing a personalized opening line.`,
  personalization_linkup_contact: LINKUP_QUERY_GUIDANCE + `\n\nThis query is used to research a PERSON/CONTACT for personalizing cold emails.
Template variables to preserve exactly: {contactName}, {companyName}, {linkedinPart}
Focus on: role, career history, recent activity, publications — data useful for writing a personalized opening line.`,
  scoring_linkup_company: LINKUP_QUERY_GUIDANCE + `\n\nThis query is used to research a COMPANY for lead scoring (evaluating business potential).
Template variables to preserve exactly: {companyName}, {domainPart}
Focus on: company size, funding, growth signals, hiring activity, market position — data useful for scoring a lead 0-100.`,
  prospecting: LINKUP_QUERY_GUIDANCE + `\n\nThis is a prospecting query template used to find new contacts/people on the web.
The user's natural language request will be appended after this template.
Focus on: finding real professionals matching criteria, extracting structured contact data (name, company, title, email, LinkedIn).
Use sequential search: first find companies matching criteria, then find key people at those companies.
Include instructions to scrape LinkedIn profiles and company team pages.`,
};

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

    const { prompt, type } = await request.json();

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ error: 'prompt is required' }, { status: 400 });
    }

    const validTypes = Object.keys(TYPE_SPECIFIC);
    if (!type || !validTypes.includes(type)) {
      return NextResponse.json({ error: `type must be one of: ${validTypes.join(', ')}` }, { status: 400 });
    }

    const typeGuidance = TYPE_SPECIFIC[type];

    const { text } = await generateText({
      model: anthropic('claude-sonnet-4-5-20250929'),
      system: `You are an expert prompt engineer. Your job is to improve a user-drafted prompt/query while preserving their intent and language.

Core rules:
1. PRESERVE the user's language (if French, respond in French; if English, in English)
2. PRESERVE the user's core intent, domain references, and industry-specific terms
3. PRESERVE all template variables exactly as written (e.g. {companyName}, {contactName})
4. Make the prompt clearer, more structured, and more effective
5. Return ONLY the improved prompt text — no explanations, no markdown code blocks, no commentary

${typeGuidance}`,
      prompt: `Improve this prompt:\n\n${prompt}`,
    });

    return NextResponse.json({ enhanced: text.trim() });
  } catch (error: any) {
    console.error('Enhance prompt error:', error);
    return NextResponse.json({ error: error.message || 'Enhancement failed' }, { status: 500 });
  }
}
