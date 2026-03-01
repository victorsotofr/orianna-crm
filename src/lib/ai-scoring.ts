import 'server-only';
import { generateText, stepCountIs } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import type { Contact } from '@/types/database';
import { searchCompany } from '@/lib/linkup';
import { DEFAULT_SCORING_PROMPT } from '@/lib/ai-defaults';

interface CustomPrompts {
  scoringPrompt?: string;
  linkupCompanyQuery?: string;
}

interface ScoringResult {
  score: number;
  label: 'HOT' | 'WARM' | 'COLD';
  reasoning: string;
}

function buildSearchContext(contact: Contact): string {
  const parts: string[] = [];

  if (contact.first_name || contact.last_name) {
    parts.push(`Nom: ${[contact.first_name, contact.last_name].filter(Boolean).join(' ')}`);
  }
  if (contact.email) parts.push(`Email: ${contact.email}`);
  if (contact.company_name) parts.push(`Entreprise: ${contact.company_name}`);
  if (contact.company_domain) parts.push(`Site web: ${contact.company_domain}`);
  if (contact.job_title) parts.push(`Poste: ${contact.job_title}`);
  if (contact.linkedin_url) parts.push(`LinkedIn: ${contact.linkedin_url}`);
  if (contact.location) parts.push(`Ville: ${contact.location}`);
  if (contact.education) parts.push(`Formation: ${contact.education}`);

  return parts.join('\n');
}

function deriveLabel(score: number): 'HOT' | 'WARM' | 'COLD' {
  if (score >= 70) return 'HOT';
  if (score >= 40) return 'WARM';
  return 'COLD';
}

function parseScoringResponse(text: string): ScoringResult {
  // Try to extract JSON from the response
  const jsonMatch = text.match(/\{[\s\S]*?"score"[\s\S]*?\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      const score = Math.max(0, Math.min(100, Math.round(Number(parsed.score) || 0)));
      const label = deriveLabel(score);
      const reasoning = parsed.reasoning || parsed.raisonnement || 'Aucune analyse disponible.';
      return { score, label, reasoning };
    } catch {
      // Fall through to fallback
    }
  }

  // Fallback: try to find a score number
  const scoreMatch = text.match(/(\d{1,3})\s*\/?\s*100/);
  if (scoreMatch) {
    const score = Math.max(0, Math.min(100, parseInt(scoreMatch[1])));
    return { score, label: deriveLabel(score), reasoning: text.slice(0, 500) };
  }

  return { score: 0, label: 'COLD', reasoning: 'Impossible d\'analyser ce contact.' };
}

export async function scoreContact(
  contact: Contact,
  linkupApiKey?: string,
  customPrompts?: CustomPrompts
): Promise<ScoringResult> {
  const context = buildSearchContext(contact);

  const systemPrompt = customPrompts?.scoringPrompt || DEFAULT_SCORING_PROMPT;

  if (linkupApiKey) {
    // Linkup path: deep search then Claude scoring (no tools)
    let linkupResearch = '';
    try {
      linkupResearch = await searchCompany(
        linkupApiKey,
        contact.company_name || '',
        contact.company_domain,
        'deep',
        customPrompts?.linkupCompanyQuery
      );
    } catch (err) {
      console.error('Linkup search failed, falling back to web_search:', err);
      // Fall through to web_search path
      return scoreWithWebSearch(context, systemPrompt);
    }

    const userPrompt = `Analyse ce contact et donne-lui un score de 0 à 100 :\n\n${context}\n\nRECHERCHE ENTREPRISE:\n${linkupResearch}`;

    const { text } = await generateText({
      model: anthropic('claude-sonnet-4-5-20250929'),
      system: systemPrompt,
      prompt: userPrompt,
    });

    return parseScoringResponse(text);
  }

  // Fallback: web_search behavior
  return scoreWithWebSearch(context, systemPrompt);
}

async function scoreWithWebSearch(context: string, systemPrompt: string): Promise<ScoringResult> {
  const webSearchSystemPrompt = systemPrompt.replace(
    'Tu analyses les contacts pour déterminer leur potentiel commercial.',
    'Tu analyses les contacts pour déterminer leur potentiel commercial.\n\nTu dois rechercher sur le web des informations sur le contact et son entreprise, puis scorer le lead.'
  );
  const userPrompt = `Analyse ce contact et donne-lui un score de 0 à 100 :\n\n${context}`;

  const { text } = await generateText({
    model: anthropic('claude-sonnet-4-5-20250929'),
    stopWhen: stepCountIs(5),
    tools: {
      web_search: anthropic.tools.webSearch_20250305(),
    },
    system: webSearchSystemPrompt,
    prompt: userPrompt,
  });

  return parseScoringResponse(text);
}
