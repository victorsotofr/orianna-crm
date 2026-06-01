import { describe, expect, it } from 'vitest';

import { agentCopy, detectAgentLanguage, normalizeAgentError, searchResultSummary } from './copy';

describe('outreach agent copy', () => {
  it('detects French prospecting requests and English greetings', () => {
    expect(detectAgentLanguage('je veux trouver environ 50 dirigeants de petites PME lyonnaises')).toBe('fr');
    expect(detectAgentLanguage('hello')).toBe('en');
  });

  it('keeps greetings scoped and operational', () => {
    expect(agentCopy('fr').greeting).toContain('agent GTM isimple');
    expect(agentCopy('en').greeting).toContain('isimple GTM agent');
  });

  it('summarizes strict prospect results in the user language', () => {
    expect(searchResultSummary({ found: 2, requested: 25, lang: 'fr' })).toContain('2 prospect(s) strictement vérifiés sur 25');
    expect(searchResultSummary({ found: 2, requested: 25, lang: 'en' })).toContain('2 strict verified prospect(s) out of 25');
  });

  it('normalizes vendor and network failures into user-safe messages', () => {
    const missingKey = normalizeAgentError(new Error('Linkup API key not configured'), 'fr', 'search');
    expect(missingKey.code).toBe('missing_configuration');
    expect(missingKey.retryable).toBe(false);
    expect(missingKey.message).toContain('Configuration Linkup manquante');

    const timeout = normalizeAgentError(new Error('Linkup standard prospect search timed out after 60000ms'), 'en', 'search');
    expect(timeout.code).toBe('timeout');
    expect(timeout.retryable).toBe(true);
    expect(timeout.message).toContain('took too long');
  });
});
