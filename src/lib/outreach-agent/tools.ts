import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

export type OutreachAgentTool =
  | 'answer_directly'
  | 'redirect_off_domain'
  | 'get_workspace_status'
  | 'list_automations'
  | 'get_inbox_attention'
  | 'get_pipeline_attention'
  | 'parse_outreach_brief'
  | 'plan_search_queries'
  | 'search_prospects'
  | 'save_prospects'
  | 'find_emails'
  | 'draft_sequence'
  | 'revise_sequence'
  | 'launch_sequence'
  | 'create_automation';

export type OutreachArtifactKind =
  | 'status_snapshot'
  | 'automation_list'
  | 'inbox_attention'
  | 'pipeline_attention'
  | 'prospect_list'
  | 'sequence_draft'
  | 'automation_created'
  | 'enrichment_status'
  | 'confirmation_required';

export interface OutreachArtifact {
  id: string;
  kind: OutreachArtifactKind;
  title: string;
  summary?: string;
  data: Record<string, unknown>;
  created_at: string;
}

export interface OutreachAgentToolDefinition {
  name: OutreachAgentTool;
  label: string;
  description: string;
  permission: 'read' | 'external' | 'write' | 'send';
  guardrail: string;
}

export const OUTREACH_AGENT_TOOLS: OutreachAgentToolDefinition[] = [
  {
    name: 'answer_directly',
    label: 'Answer directly',
    description: 'Answer a product, capability, model, or workflow question without reading or mutating workspace data.',
    permission: 'read',
    guardrail: 'Stay inside outreach/CRM scope. No database writes, no external calls, and no invented workspace facts.',
  },
  {
    name: 'redirect_off_domain',
    label: 'Redirect off-domain',
    description: 'Redirect casual, trivia, math, general knowledge, or unrelated requests back to outreach/CRM.',
    permission: 'read',
    guardrail: 'Never answer the unrelated topic and never use it as prospecting context.',
  },
  {
    name: 'get_workspace_status',
    label: 'Workspace status',
    description: 'Summarize automations, running jobs, review queue, unread replies, and active sends.',
    permission: 'read',
    guardrail: 'Read-only and workspace-scoped.',
  },
  {
    name: 'list_automations',
    label: 'List automations',
    description: 'List active, paused, and failed recurring outreach automations.',
    permission: 'read',
    guardrail: 'Read-only; archived automations are hidden unless explicitly requested later.',
  },
  {
    name: 'get_inbox_attention',
    label: 'Inbox attention',
    description: 'Find unread replies and conversations that likely need a response.',
    permission: 'read',
    guardrail: 'Never sends a reply; only summarizes mailbox state.',
  },
  {
    name: 'get_pipeline_attention',
    label: 'Pipeline attention',
    description: 'Summarize blocked, ready, queued, and active outbound prospects.',
    permission: 'read',
    guardrail: 'Read-only; approvals and queueing require explicit user action.',
  },
  {
    name: 'parse_outreach_brief',
    label: 'Parse brief',
    description: 'Convert a user request into industry, role, geography, size, exclusions, and offer angle.',
    permission: 'read',
    guardrail: 'Industry agnostic; never assumes real estate or a fixed ICP.',
  },
  {
    name: 'plan_search_queries',
    label: 'Plan search queries',
    description: 'Plan the web research queries before spending Linkup credits.',
    permission: 'read',
    guardrail: 'Queries must target named people and verifiable sources.',
  },
  {
    name: 'search_prospects',
    label: 'Search prospects',
    description: 'Run Linkup prospecting and extract named people.',
    permission: 'external',
    guardrail: 'External call; must stream progress and preserve sources.',
  },
  {
    name: 'save_prospects',
    label: 'Save prospects',
    description: 'Create or update CRM contacts from selected prospects.',
    permission: 'write',
    guardrail: 'Does not send outreach.',
  },
  {
    name: 'find_emails',
    label: 'Find emails',
    description: 'Start FullEnrich lookup for selected prospects.',
    permission: 'external',
    guardrail: 'External enrichment only for selected prospects.',
  },
  {
    name: 'draft_sequence',
    label: 'Draft sequence',
    description: 'Draft the first outreach sequence from selected prospects and workspace context.',
    permission: 'write',
    guardrail: 'Draft only; no messages are sent.',
  },
  {
    name: 'revise_sequence',
    label: 'Revise sequence',
    description: 'Revise an existing draft sequence based on user instruction.',
    permission: 'write',
    guardrail: 'Draft only; no messages are sent.',
  },
  {
    name: 'launch_sequence',
    label: 'Launch sequence',
    description: 'Queue eligible, approved contacts into a sequence.',
    permission: 'send',
    guardrail: 'Requires explicit confirmation or UI button; blocks bounced, opted-out, replied, rejected, missing-email, and unapproved contacts.',
  },
  {
    name: 'create_automation',
    label: 'Create automation',
    description: 'Create a recurring outreach workflow from a reviewed thread and sequence.',
    permission: 'write',
    guardrail: 'Requires explicit confirmation and defaults to review before send.',
  },
];

export function artifact(kind: OutreachArtifactKind, title: string, data: Record<string, unknown>, summary?: string): OutreachArtifact {
  return {
    id: `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    title,
    summary,
    data,
    created_at: new Date().toISOString(),
  };
}

export function extractRequestedProspectLimit(message: string, fallback = 20) {
  const normalized = message
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  const match = normalized.match(/\b(?:environ|around|about|approx(?:\.|imately)?|~)?\s*(\d{1,3})\s*(?:profils?|profiles?|prospects?|contacts?|personnes?|people)?\b/);
  if (!match) return fallback;
  return Math.min(Math.max(Number(match[1]) || fallback, 5), 50);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function textIncludes(text: string, words: string[]) {
  const haystack = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[’']/g, ' ');
  return words.some((word) => {
    const needle = word
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[’']/g, ' ');
    if (needle.includes(' ')) {
      return haystack.includes(needle);
    }
    return new RegExp(`(^|[^a-z0-9])${escapeRegExp(needle)}s?([^a-z0-9]|$)`).test(haystack);
  });
}

function hasProspectSearchIntent(text: string) {
  const hasSearchVerb = textIncludes(text, [
    'find',
    'search',
    'look for',
    'source',
    'identify',
    'list',
    'trouve',
    'trouver',
    'cherche',
    'chercher',
    'identifie',
    'identifier',
    'liste',
    'lister',
  ]);
  const hasProspectObject = textIncludes(text, [
    'prospect',
    'prospects',
    'contact',
    'contacts',
    'profile',
    'profiles',
    'profil',
    'profils',
    'person',
    'people',
    'personne',
    'personnes',
    'lead',
    'leads',
    'manager',
    'managers',
    'gestionnaire',
    'gestionnaires',
    'responsable',
    'responsables',
    'dirigeant',
    'dirigeants',
    'directeur',
    'directeurs',
    'fondateur',
    'fondateurs',
    'independant',
    'independants',
    'locatif',
    'locatifs',
    'property manager',
    'property managers',
  ]);
  const hasOutreachObject = textIncludes(text, ['reach out', 'contacter', 'prospection', 'cible', 'target']);

  return (hasSearchVerb && hasProspectObject) || hasOutreachObject;
}

export function inferOutreachTool(message: string, fallbackHasProspects: boolean, hasSequenceDraft: boolean): OutreachAgentTool {
  const lower = message.toLowerCase();

  if (textIncludes(lower, ['what can you do', 'help', 'aide', 'tu peux m aider', 'tu peux m’aider', 'comment ça marche', 'comment ca marche', 'model', 'modèle', 'modele', 'openai', 'gpt', 'propulse'])) {
    return 'answer_directly';
  }
  if (textIncludes(lower, ['find emails', 'email search', 'enrich', 'enrichir', 'trouver email', 'emails'])) {
    if (!textIncludes(lower, ['sequence', 'séquence'])) return 'find_emails';
  }
  if (hasProspectSearchIntent(lower)) {
    return 'search_prospects';
  }
  if (textIncludes(lower, ['hello', 'hi', 'hey', 'bonjour', 'salut', 'ça va', 'ca va', 'how are you', 'how are u', 'thanks', 'thank you', 'merci'])) {
    return 'redirect_off_domain';
  }
  if (textIncludes(lower, ['automate', 'automation', 'automatisation', 'every morning', 'tous les matins', 'recurring'])) {
    if (textIncludes(lower, ['create', 'make', 'set up', 'run this', 'crée', 'creer', 'mets en place'])) return 'create_automation';
    return 'list_automations';
  }
  if (textIncludes(lower, ['inbox', 'reply', 'replies', 'answer', 'respond', 'répond', 'repond', 'réponse', 'conversation'])) {
    return 'get_inbox_attention';
  }
  if (textIncludes(lower, ['blocked', 'ready', 'queued', 'approval', 'approve', 'pipeline', 'review', 'reviews', 'to review', 'review queue', 'need review', 'bloqué', 'prêt', 'à valider', 'a valider', 'valider'])) {
    return 'get_pipeline_attention';
  }
  if (textIncludes(lower, ['status', 'state', 'summary', 'attention', 'today', 'overview', 'où on en est', 'quoi faire', 'à faire', 'todo'])) {
    return 'get_workspace_status';
  }
  if (textIncludes(lower, ['launch', 'send', 'start sequence', 'lance', 'envoie', 'envoyer'])) return 'launch_sequence';
  if (textIncludes(lower, ['sequence', 'séquence', 'draft', 'write emails', 'email 1', 'relance'])) {
    return hasSequenceDraft ? 'revise_sequence' : 'draft_sequence';
  }
  if (textIncludes(lower, ['save', 'import', 'keep these', 'sauve', 'importe'])) return 'save_prospects';
  if (textIncludes(lower, ['find', 'search', 'prospect', 'reach out', 'target', 'contact ', 'contacts ', 'trouve', 'trouver', 'cherche', 'chercher', 'contacter', 'prospection', 'cible'])) {
    return 'search_prospects';
  }

  if (!fallbackHasProspects) return 'redirect_off_domain';
  if (!hasSequenceDraft) return 'get_pipeline_attention';
  return 'get_workspace_status';
}

export async function getWorkspaceStatusArtifact(db: SupabaseClient, workspaceId: string, userId: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [
    automations,
    activeAutomations,
    unreadReplies,
    runningEvents,
    runningSessions,
    pendingReview,
    activeEnrollments,
    todayContacts,
  ] = await Promise.all([
    db.from('outreach_automations').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).neq('status', 'archived'),
    db.from('outreach_automations').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).eq('status', 'active'),
    db.from('mailbox_threads').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).eq('user_id', userId).gt('unread_count', 0),
    db.from('outreach_session_events').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).eq('status', 'running'),
    db.from('outreach_sessions').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).in('status', ['searching', 'enriching']),
    db.from('contacts').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).eq('source', 'gtm_autopilot').eq('gtm_review_status', 'pending'),
    db.from('campaign_enrollments').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).eq('status', 'active'),
    db.from('contacts').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).gte('created_at', today.toISOString()),
  ]);

  const data = {
    automations: automations.count || 0,
    activeAutomations: activeAutomations.count || 0,
    unreadReplies: unreadReplies.count || 0,
    runningTasks: (runningEvents.count || 0) + (runningSessions.count || 0),
    pendingReview: pendingReview.count || 0,
    activeEnrollments: activeEnrollments.count || 0,
    contactsAddedToday: todayContacts.count || 0,
  };

  return artifact(
    'status_snapshot',
    'Workspace status',
    data,
    `${data.runningTasks} running, ${data.unreadReplies} unread replies, ${data.pendingReview} prospects need review.`
  );
}

export async function listAutomationsArtifact(db: SupabaseClient, workspaceId: string) {
  const { data, error } = await db
    .from('outreach_automations')
    .select(`
      id,
      name,
      prompt,
      status,
      enabled,
      daily_limit,
      approval_required,
      last_run_at,
      next_run_at,
      created_at,
      sequence:campaign_sequences(id, name, status)
    `)
    .eq('workspace_id', workspaceId)
    .neq('status', 'archived')
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) throw error;
  const rows = data || [];
  const active = rows.filter((row) => row.status === 'active').length;
  return artifact('automation_list', 'Automations', { automations: rows }, `${active} active automation(s), ${rows.length} total.`);
}

export async function getInboxAttentionArtifact(db: SupabaseClient, workspaceId: string, userId: string) {
  const { data, error } = await db
    .from('mailbox_threads')
    .select(`
      id,
      subject,
      snippet,
      unread_count,
      last_message_at,
      contact_id,
      contacts(id, first_name, last_name, email, company_name, status, email_bounced)
    `)
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .gt('unread_count', 0)
    .order('last_message_at', { ascending: false })
    .limit(8);

  if (error) throw error;
  const threads = data || [];
  return artifact(
    'inbox_attention',
    'Inbox attention',
    { threads },
    threads.length ? `${threads.length} conversation(s) need a reply.` : 'No unread prospect replies right now.'
  );
}

export async function getPipelineAttentionArtifact(db: SupabaseClient, workspaceId: string) {
  const [pending, approved, bounced, missingEmail, active, reviewItems] = await Promise.all([
    db.from('contacts').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).eq('source', 'gtm_autopilot').eq('gtm_review_status', 'pending'),
    db.from('contacts').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).eq('source', 'gtm_autopilot').eq('gtm_review_status', 'approved'),
    db.from('contacts').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).eq('source', 'gtm_autopilot').eq('email_bounced', true),
    db.from('contacts').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).eq('source', 'gtm_autopilot').is('email', null),
    db.from('campaign_enrollments').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).eq('status', 'active'),
    db.from('contacts')
      .select('id, first_name, last_name, email, company_name, job_title, location, linkedin_url, source_url, ai_score, ai_score_label, ai_personalized_line, email_verified_status, gtm_review_status, created_at')
      .eq('workspace_id', workspaceId)
      .eq('source', 'gtm_autopilot')
      .eq('gtm_review_status', 'pending')
      .order('created_at', { ascending: false })
      .limit(8),
  ]);

  const data = {
    pendingReview: pending.count || 0,
    approved: approved.count || 0,
    bounced: bounced.count || 0,
    missingEmail: missingEmail.count || 0,
    activeEnrollments: active.count || 0,
    prospects: reviewItems.data || [],
  };

  return artifact('pipeline_attention', 'Pipeline attention', data, `${data.pendingReview} pending, ${data.missingEmail} missing emails, ${data.activeEnrollments} active.`);
}
