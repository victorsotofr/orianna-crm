import { describe, expect, it } from 'vitest';

import { extractRequestedProspectLimit, inferOutreachTool } from './tools';

describe('inferOutreachTool', () => {
  it.each([
    ['ça va ?', 'redirect_off_domain'],
    ['hello', 'redirect_off_domain'],
    ['bonjour', 'redirect_off_domain'],
    ['merci', 'redirect_off_domain'],
    ['qui est zidane ?', 'redirect_off_domain'],
    ["multiplication d'hadamard", 'redirect_off_domain'],
    ["dis moi à quoi correspond la multiplication d'haldemar", 'redirect_off_domain'],
  ] as const)('redirects off-domain chat "%s" to %s', (message, tool) => {
    expect(inferOutreachTool(message, false, false)).toBe(tool);
  });

  it.each([
    ['what can you do?', 'answer_directly'],
    ["tu peux m'aider sur quoi ?", 'answer_directly'],
    ['quel modèle te propulse ?', 'answer_directly'],
  ] as const)('routes direct chat "%s" to %s', (message, tool) => {
    expect(inferOutreachTool(message, false, false)).toBe(tool);
  });

  it.each([
    ['show my active automations', 'list_automations'],
    ['any replies to answer?', 'get_inbox_attention'],
    ['what prospects need review?', 'get_pipeline_attention'],
    ['what needs my attention today?', 'get_workspace_status'],
    ['find 20 property managers in Lyon', 'search_prospects'],
    ['trouve 30 responsables ops à Paris', 'search_prospects'],
    ['je veux trouver 25 gestionnaires locatifs région lyon indépendants si possible', 'search_prospects'],
    ['bonjour, je veux trouver 25 gestionnaires locatifs région lyon indépendants si possible', 'search_prospects'],
    ['je veux identifier des profils de directeurs commerciaux à Lille', 'search_prospects'],
  ] as const)('routes workspace request "%s" to %s', (message, tool) => {
    expect(inferOutreachTool(message, false, false)).toBe(tool);
  });

  it('routes email enrichment only when the prompt is not asking for a sequence', () => {
    expect(inferOutreachTool('find emails for these people', true, false)).toBe('find_emails');
    expect(inferOutreachTool('write the email sequence', true, false)).toBe('draft_sequence');
  });

  it('revises sequence when a sequence draft already exists', () => {
    expect(inferOutreachTool('make the sequence shorter', true, true)).toBe('revise_sequence');
  });

  it('uses pipeline attention as the fallback when prospects exist and no sequence draft exists', () => {
    expect(inferOutreachTool('ok', true, false)).toBe('get_pipeline_attention');
  });

  it('uses workspace status as the fallback when prospects and a sequence draft exist', () => {
    expect(inferOutreachTool('ok', true, true)).toBe('get_workspace_status');
  });

  it('identifies guarded write and send intents', () => {
    expect(inferOutreachTool('save these prospects', true, false)).toBe('save_prospects');
    expect(inferOutreachTool('launch the sequence', true, true)).toBe('launch_sequence');
    expect(inferOutreachTool('run this every morning', true, true)).toBe('create_automation');
    expect(inferOutreachTool('create an automation from this', true, true)).toBe('create_automation');
  });

  it('extracts requested prospect limits up to 50', () => {
    expect(extractRequestedProspectLimit('find 20 property managers in Lyon')).toBe(20);
    expect(extractRequestedProspectLimit('je veux environ 50 profils de gestionnaires locatifs')).toBe(50);
    expect(extractRequestedProspectLimit('find 120 prospects')).toBe(50);
    expect(extractRequestedProspectLimit('find prospects')).toBe(20);
  });
});
