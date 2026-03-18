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
  prospecting: `You are rewriting a short natural language prospecting request into a detailed, Linkup-optimized research prompt following Linkup's official 4-step pattern.

The user will type something like "5 bailleurs ile de france" or "CMOs SaaS Paris" or "directeurs généraux logement social".

**Parse the user's input to extract:**
- Target count: if the user states a number (e.g. "5 bailleurs"), set the research target to 2x that number (e.g. "attempt at least 10 organizations") to ensure quality matches. If no number is given, use 20-30.
- Target role: infer the decision-maker level (CEO, DG, DGA, CMO, etc.). Default to C-level / Directeur Général if not specified.
- Target sector: extract the industry/sector with both French and English variants where applicable.
- Geography: extract region, city, or country. If missing, use "France".
- ICP reference: if the user names a person or company as a reference, note it.

**Write the output prompt in English** (Linkup performs best in English), but preserve any French sector terms, titles, and proper nouns exactly as the user wrote them (e.g. "bailleur social", "office HLM", "Île-de-France").

**Structure the output using this exact 4-step Linkup pattern:**

---
You are an expert B2B prospecting researcher. Your objective is to identify and research [target count] high-quality prospects matching the specified profile.

**Step 1: Identify Target Organizations**
Run several searches to find [2x target count] [sector] organizations in [geography] using these search terms:
- [generate 5-8 specific search strings using French AND English variants of the sector/role, e.g. "bailleur social France directeur général", "office HLM CEO", "ESH logement social directeur"]
Filter for organizations matching: [size/scale criteria derived from sector — e.g. 200+ housing units for HLM, €10M+ revenue, or 50+ employees generically].

**Step 2: Extract Leadership Information**
For each identified organization:
1. Find and scrape their official website, focusing on pages named "équipe dirigeante", "direction", "gouvernance", "leadership", or "management"
2. Extract the [target role] and any deputy/adjoint: full name, exact title, and any contact info visible
3. Note organization metrics: size, revenue signals, employee count, and any 2024-2025 strategic announcements

**Step 3: LinkedIn Profile Research**
For each identified leader:
1. Search for their LinkedIn profile using full name + organization name
2. Scrape the LinkedIn profile to confirm: current title, time in current role, recent activity
3. Extract professional email if listed in LinkedIn contact info

**Step 4: Email Verification**
For any prospect missing an email, search the organization's contact or management pages for visible email addresses or format patterns.

**ICP Qualification Criteria:**
- Decision-maker level: [target role(s)] only — skip junior or non-decision-maker profiles
- Sector: [sector with French/English variants]
- Geography: [geography]
- Size: [size filter]
[If ICP reference given: "Use [reference person/company] as a benchmark for org size and role seniority."]

**Quality Standards:**
- Verify each prospect is currently active in their role
- Cross-reference at least two sources per person
- Do not fabricate or assume any detail — return empty string for any field not found in a public source
- Use full name + organization + title together to disambiguate — skip unverifiable matches
- Do not stop until you have attempted to research at least [2x target count] organizations

For each prospect, include a 1-sentence ICP fit explanation.
---

Output ONLY the filled-in prompt following the pattern above. No explanations, no commentary, no markdown wrapper around the whole response.`,
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
1. PRESERVE the user's language (if French, respond in French; if English, in English) — UNLESS the type-specific instructions below override this
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
