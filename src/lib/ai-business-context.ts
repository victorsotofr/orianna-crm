import 'server-only';

export interface BusinessContext {
  companyDescription?: string;
  targetIndustry?: string;
  targetRoles?: string;
  geographicFocus?: string;
}

/**
 * Builds a business context block to append to AI system prompts.
 * Returns empty string if no context is available.
 */
export function buildBusinessContextBlock(ctx?: BusinessContext): string {
  if (!ctx) return '';
  const parts: string[] = [];
  if (ctx.companyDescription) parts.push(`Votre entreprise : ${ctx.companyDescription}`);
  if (ctx.targetIndustry) parts.push(`Secteur ciblé : ${ctx.targetIndustry}`);
  if (ctx.targetRoles) parts.push(`Rôles ciblés : ${ctx.targetRoles}`);
  if (ctx.geographicFocus) parts.push(`Zone géographique : ${ctx.geographicFocus}`);
  if (parts.length === 0) return '';
  return `\n\nCONTEXTE BUSINESS :\n${parts.join('\n')}`;
}

/**
 * Builds a concise business context string for Linkup search queries.
 */
export function buildLinkupContextHint(ctx?: BusinessContext): string {
  if (!ctx) return '';
  const parts: string[] = [];
  if (ctx.targetIndustry) parts.push(`Industry focus: ${ctx.targetIndustry}`);
  if (ctx.geographicFocus) parts.push(`Geography: ${ctx.geographicFocus}`);
  if (parts.length === 0) return '';
  return `\nContext: ${parts.join('. ')}.`;
}
