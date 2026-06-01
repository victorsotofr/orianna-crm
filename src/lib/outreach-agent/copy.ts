import type { OutreachAgentTool } from './tools';

export type AgentLanguage = 'fr' | 'en';

export interface NormalizedAgentError {
  code:
    | 'missing_configuration'
    | 'authentication'
    | 'credits'
    | 'timeout'
    | 'network'
    | 'empty_results'
    | 'not_found'
    | 'failed';
  message: string;
  retryable: boolean;
}

const FRENCH_HINTS = [
  'je',
  'qui',
  'est',
  'moi',
  'quoi',
  'veux',
  'trouve',
  'trouver',
  'chercher',
  'campagne',
  'campagnes',
  'prospects',
  'dirigeant',
  'dirigeants',
  'petite',
  'petites',
  'pme',
  'region',
  'région',
  'lyonnaise',
  'verifier',
  'vérifier',
  'cours',
  'bonjour',
  'salut',
  'merci',
  'peux',
  'aider',
  'réponses',
  'reponses',
  'sequence',
  'séquence',
  'automatisation',
];

const ENGLISH_HINTS = [
  'i',
  'want',
  'find',
  'search',
  'show',
  'check',
  'campaign',
  'campaigns',
  'current',
  'ongoing',
  'prospects',
  'replies',
  'inbox',
  'sequence',
  'automation',
  'hello',
  'hi',
  'thanks',
];

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function countHints(text: string, hints: string[]) {
  const normalized = normalize(text);
  return hints.reduce((score, hint) => {
    const normalizedHint = normalize(hint);
    if (!normalizedHint) return score;
    if (normalizedHint.length <= 3) {
      return score + (new RegExp(`(^|[^a-z0-9])${normalizedHint}([^a-z0-9]|$)`).test(normalized) ? 1 : 0);
    }
    return score + (normalized.includes(normalizedHint) ? 1 : 0);
  }, 0);
}

export function detectAgentLanguage(text: string | null | undefined): AgentLanguage {
  const raw = String(text || '').trim();
  if (!raw) return 'en';
  const frenchScore = countHints(raw, FRENCH_HINTS);
  const englishScore = countHints(raw, ENGLISH_HINTS);
  if (/[àâäçéèêëîïôöùûüÿœ]/i.test(raw)) return 'fr';
  return frenchScore > englishScore ? 'fr' : 'en';
}

export function isSimpleGreeting(text: string | null | undefined) {
  const normalized = normalize(String(text || '').trim()).replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  return /^(hello|hi|hey|bonjour|salut|ca va|merci|thanks|thank you)$/.test(normalized);
}

export function agentToolTitle(toolName: OutreachAgentTool, lang: AgentLanguage) {
  const fr: Record<OutreachAgentTool, string> = {
    answer_product_question: 'Réponse',
    refuse_out_of_scope: 'Périmètre',
    get_workspace_status: 'Statut workspace',
    list_automations: 'Automatisations',
    list_campaigns: 'Campagnes',
    get_inbox_attention: 'Inbox',
    get_pipeline_attention: 'File outbound',
    search_prospects: 'Recherche prospects',
    save_prospects: 'Sauvegarde prospects',
    find_emails: 'Recherche emails',
    draft_sequence: 'Séquence',
    revise_sequence: 'Révision séquence',
    launch_sequence: 'Contrôle lancement',
    create_automation: 'Contrôle automatisation',
  };
  const en: Record<OutreachAgentTool, string> = {
    answer_product_question: 'Answer',
    refuse_out_of_scope: 'Scope',
    get_workspace_status: 'Workspace status',
    list_automations: 'Automations',
    list_campaigns: 'Campaigns',
    get_inbox_attention: 'Inbox',
    get_pipeline_attention: 'Outbound queue',
    search_prospects: 'Prospect search',
    save_prospects: 'Saving prospects',
    find_emails: 'Email search',
    draft_sequence: 'Sequence',
    revise_sequence: 'Sequence revision',
    launch_sequence: 'Launch review',
    create_automation: 'Automation review',
  };
  return (lang === 'fr' ? fr : en)[toolName];
}

export function agentToolDetail(toolName: OutreachAgentTool, lang: AgentLanguage) {
  const isFr = lang === 'fr';
  switch (toolName) {
    case 'search_prospects':
      return isFr
        ? 'Ciblage, recherche web, extraction de personnes nommées, puis revue.'
        : 'Target parsing, web research, named-person extraction, then review.';
    case 'find_emails':
      return isFr
        ? 'Enrichissement des emails vérifiés pour les prospects sélectionnés.'
        : 'Verified email enrichment for the selected prospects.';
    case 'draft_sequence':
    case 'revise_sequence':
      return isFr
        ? 'Préparation d’une séquence courte et éditable.'
        : 'Preparing a concise editable sequence.';
    case 'launch_sequence':
      return isFr
        ? 'Contrôle des prospects et de la séquence avant envoi.'
        : 'Checking prospects and sequence before sending.';
    case 'create_automation':
      return isFr
        ? 'Contrôle des règles avant planification récurrente.'
        : 'Checking rules before recurring scheduling.';
    case 'list_campaigns':
      return isFr
        ? 'Lecture des campagnes, séquences, brouillons et enrollments.'
        : 'Reading campaigns, sequences, drafts, and enrollments.';
    default:
      return isFr ? 'Lecture des données du workspace.' : 'Reading workspace data.';
  }
}

export function agentCopy(lang: AgentLanguage) {
  const isFr = lang === 'fr';
  return {
    greeting: isFr
      ? 'Bonjour. Je suis l’agent GTM isimple. Donne-moi une cible, une campagne, l’inbox ou la file outbound à vérifier.'
      : 'Hi. I’m the isimple GTM agent. Give me a target, campaign, inbox, or outbound queue to check.',
    capabilities: isFr
      ? 'Je couvre uniquement la prospection CRM: prospects, campagnes, inbox, enrichissement, séquences, validation et automatisations.'
      : 'I only cover CRM prospecting: prospects, campaigns, inbox, enrichment, sequences, review, and automations.',
    refusal: isFr
      ? 'Je reste sur Orianna/isimple: prospects, contacts, campagnes, inbox, enrichissement, séquences et automatisations outbound.'
      : 'I stay inside Orianna/isimple: prospects, contacts, campaigns, inbox, enrichment, sequences, and outbound automations.',
    confirmation: isFr
      ? 'Confirme avant que je modifie le workspace.'
      : 'Confirm before I change workspace data.',
    launchConfirmation: isFr
      ? 'Confirme avant que je mette cette séquence en file d’envoi.'
      : 'Confirm before I queue this sequence.',
    automationConfirmation: isFr
      ? 'Confirme avant que je crée cette automatisation récurrente.'
      : 'Confirm before I create this recurring automation.',
    genericDone: isFr ? 'Terminé.' : 'Done.',
    noUsefulAction: isFr
      ? 'Je n’ai pas identifié d’action CRM utile dans cette demande.'
      : 'I could not identify a useful CRM action in that request.',
    partialFailureIntro: isFr
      ? 'Une action n’a pas abouti.'
      : 'One action did not complete.',
    searchRetry: isFr
      ? 'Relance la recherche avec la même cible ou précise rôle, zone, taille d’entreprise et exclusions.'
      : 'Retry the search with the same target or narrow role, area, company size, and exclusions.',
  };
}

export function searchResultSummary(input: {
  found: number;
  requested?: number | null;
  lang: AgentLanguage;
  failed?: boolean;
}) {
  const requested = Number(input.requested || 0);
  if (input.failed) {
    return input.lang === 'fr'
      ? 'La recherche prospects n’a pas abouti. Aucune donnée workspace n’a été modifiée.'
      : 'The prospect search did not complete. No workspace data was changed.';
  }
  if (input.lang === 'fr') {
    return requested && input.found < requested
      ? `${input.found} prospect(s) strictement vérifiés sur ${requested}. J’ai écarté les candidats faibles ou hors cible.`
      : `${input.found} prospect(s) strictement vérifiés.`;
  }
  return requested && input.found < requested
    ? `${input.found} strict verified prospect(s) out of ${requested}. I skipped weak or off-target candidates.`
    : `${input.found} strict verified prospect(s).`;
}

export function normalizeAgentError(
  error: unknown,
  lang: AgentLanguage = 'en',
  context: 'agent' | 'search' | 'enrichment' = 'agent'
): NormalizedAgentError {
  const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  const lower = raw.toLowerCase();
  const isFr = lang === 'fr';

  if (/api key|not configured|missing.*key|configuration/i.test(raw)) {
    const provider = lower.includes('fullenrich') ? 'FullEnrich' : lower.includes('linkup') ? 'Linkup' : 'intégration';
    return {
      code: 'missing_configuration',
      retryable: false,
      message: isFr
        ? `Configuration ${provider} manquante. Ajoute la clé dans Settings > Integrations, puis relance.`
        : `Missing ${provider} configuration. Add the key in Settings > Integrations, then retry.`,
    };
  }

  if (/unauthorized|forbidden|401|403|no workspace|auth/i.test(lower)) {
    return {
      code: 'authentication',
      retryable: true,
      message: isFr
        ? 'Session ou workspace non autorisé. Rafraîchis la page, vérifie le workspace, puis relance.'
        : 'Session or workspace is not authorized. Refresh, check the workspace, then retry.',
    };
  }

  if (/402|credit|credits|quota|billing|payment|insufficient/i.test(raw)) {
    return {
      code: 'credits',
      retryable: false,
      message: isFr
        ? 'Crédits de recherche insuffisants. Recharge l’intégration concernée, puis relance.'
        : 'Search credits are insufficient. Top up the integration, then retry.',
    };
  }

  if (/timeout|timed out|abort|aborted|deadline|duration/i.test(lower)) {
    return {
      code: 'timeout',
      retryable: true,
      message: isFr
        ? 'La recherche a pris trop longtemps. Les autres résultats restent disponibles; relance ou resserre la cible.'
        : 'The search took too long. Other results remain available; retry or narrow the target.',
    };
  }

  if (/network|fetch failed|socket|econn|reset|terminated|connection|dns|503|502|504/i.test(raw)) {
    return {
      code: 'network',
      retryable: true,
      message: isFr
        ? 'Connexion interrompue pendant l’action. Les données déjà récupérées restent visibles; relance quand la connexion est stable.'
        : 'Connection interrupted during the action. Data already returned stays visible; retry when the connection is stable.',
    };
  }

  if (/no explicitly named|no named|empty|aucun prospect|no prospect/i.test(lower)) {
    return {
      code: 'empty_results',
      retryable: true,
      message: isFr
        ? 'Aucun prospect nommé vérifiable pour cette cible. Précise rôle, ville, taille d’entreprise ou exclusions.'
        : 'No verifiable named prospects for this target. Narrow role, city, company size, or exclusions.',
    };
  }

  if (/not found|introuvable|404/i.test(lower)) {
    return {
      code: 'not_found',
      retryable: true,
      message: isFr
        ? 'L’objet demandé est introuvable dans ce workspace.'
        : 'The requested object was not found in this workspace.',
    };
  }

  return {
    code: 'failed',
    retryable: true,
    message: isFr
      ? `${context === 'search' ? 'La recherche prospects' : 'L’action'} n’a pas abouti. Aucune donnée workspace n’a été modifiée; relance ou précise la demande.`
      : `${context === 'search' ? 'The prospect search' : 'The action'} did not complete. No workspace data was changed; retry or narrow the request.`,
  };
}
