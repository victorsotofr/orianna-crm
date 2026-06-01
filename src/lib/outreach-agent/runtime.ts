import 'server-only';

import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { Annotation, END, Send, START, StateGraph } from '@langchain/langgraph';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import { chatModel, langChainProviderLabel, type AgentModelTask } from '@/lib/ai-langchain-provider';
import {
  agentCopy,
  agentToolDetail,
  agentToolTitle,
  detectAgentLanguage,
  isSimpleGreeting,
  normalizeAgentError,
  searchResultSummary,
  type AgentLanguage,
} from '@/lib/outreach-agent/copy';
import {
  appendOutreachMessage,
  createOutreachEvent,
  createOutreachRun,
  createOutreachToolCall,
  getOutreachSessionBundle,
  updateOutreachEvent,
  updateOutreachRun,
  updateOutreachToolCall,
} from '@/lib/outreach';
import {
  OUTREACH_AGENT_TOOLS,
  OUTREACH_AGENT_TOOL_NAMES,
  artifact,
  extractRequestedProspectLimit,
  getInboxAttentionArtifact,
  getPipelineAttentionArtifact,
  getWorkspaceStatusArtifact,
  inferOutreachTool,
  listAutomationsArtifact,
  listCampaignsArtifact,
  type OutreachAgentTool,
  type OutreachArtifact,
} from '@/lib/outreach-agent/tools';

type LegacyAgentAction =
  | 'answer_directly'
  | 'redirect_off_domain'
  | 'workspace_status'
  | 'automations'
  | 'inbox'
  | 'pipeline'
  | 'campaigns'
  | 'search'
  | 'save'
  | 'enrich'
  | 'launch'
  | 'automate';

export type AgentAction = OutreachAgentTool | LegacyAgentAction;

export interface AgentRuntimeBody {
  message?: string;
  action?: AgentAction;
  clientMessageId?: string;
  skipUserMessage?: boolean;
  prospectIds?: string[];
  revisionPrompt?: string;
  sequenceName?: string;
  steps?: unknown;
  dailyLimit?: number;
  approvalRequired?: boolean;
  confirmed?: boolean;
}

export interface AgentRuntimeInput {
  db: SupabaseClient;
  workspaceId: string;
  userId: string;
  sessionId: string;
  requestUrl: string;
  cookie: string;
  workspaceHeader: string;
  body: AgentRuntimeBody;
  emit: (type: string, payload: unknown) => void;
}

type AgentSpecialist = 'general_chat' | 'profiles_finder' | 'outreach' | 'status' | 'review_safety';
type TaskSource = 'model' | 'deterministic' | 'ui';

interface AgentTask {
  id: string;
  toolName: OutreachAgentTool;
  specialist: AgentSpecialist;
  reason: string;
  directAnswer?: string;
  source: TaskSource;
}

interface AgentTaskResult {
  taskId: string;
  toolName: OutreachAgentTool;
  specialist: AgentSpecialist;
  status: 'complete' | 'failed' | 'waiting_confirmation';
  responseText?: string;
  toolOutput?: unknown;
  artifact?: OutreachArtifact | null;
  requiresConfirmation?: boolean;
  error?: string;
}

interface AgentStateUpdate {
  message?: string;
  action?: AgentAction;
  confirmed?: boolean;
  task?: AgentTask;
  tasks?: AgentTask[];
  taskResults?: AgentTaskResult[];
  artifacts?: OutreachArtifact[];
  requiresConfirmation?: boolean;
  responseText?: string;
}

const AgentState = Annotation.Root({
  message: Annotation<string>(),
  action: Annotation<AgentAction | undefined>(),
  confirmed: Annotation<boolean>(),
  task: Annotation<AgentTask | undefined>(),
  tasks: Annotation<AgentTask[]>({
    reducer: (_current, update) => update,
    default: () => [],
  }),
  taskResults: Annotation<AgentTaskResult[]>({
    reducer: (current, update) => current.concat(update),
    default: () => [],
  }),
  artifacts: Annotation<OutreachArtifact[]>({
    reducer: (current, update) => current.concat(update),
    default: () => [],
  }),
  requiresConfirmation: Annotation<boolean>({
    reducer: (current, update) => Boolean(current || update),
    default: () => false,
  }),
  responseText: Annotation<string>(),
});

type AgentStateValue = typeof AgentState.State;

const TOOL_PERMISSION = new Map(OUTREACH_AGENT_TOOLS.map((tool) => [tool.name, tool.permission]));

const TaskPlanSchema = z.object({
  tasks: z.array(z.object({
    toolName: z.enum(OUTREACH_AGENT_TOOL_NAMES),
    reason: z.string().max(240).optional(),
  })).min(1).max(4),
  directAnswer: z.string().max(700).optional(),
});

const SupervisorResponseSchema = z.object({
  response: z.string().max(900),
});

interface EndpointError extends Error {
  status?: number;
  payload?: Record<string, unknown>;
}

function selectedProspectIds(prospects: Array<{ id: string; selected?: boolean; ignored?: boolean }>) {
  return prospects
    .filter((prospect) => prospect.selected !== false && prospect.ignored !== true)
    .map((prospect) => prospect.id);
}

function normalizeTool(action: AgentAction): OutreachAgentTool {
  const legacyMap: Partial<Record<AgentAction, OutreachAgentTool>> = {
    answer_directly: 'answer_product_question',
    redirect_off_domain: 'refuse_out_of_scope',
    workspace_status: 'get_workspace_status',
    automations: 'list_automations',
    inbox: 'get_inbox_attention',
    pipeline: 'get_pipeline_attention',
    campaigns: 'list_campaigns',
    search: 'search_prospects',
    save: 'save_prospects',
    enrich: 'find_emails',
    launch: 'launch_sequence',
    automate: 'create_automation',
  };

  return legacyMap[action] || action as OutreachAgentTool;
}

function normalizeText(text: string) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[’']/g, ' ')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function textIncludes(text: string, words: string[]) {
  const haystack = normalizeText(text);
  return words.some((word) => {
    const needle = normalizeText(word);
    if (!needle) return false;
    if (needle.includes(' ')) return haystack.includes(needle);
    return new RegExp(`(^|[^a-z0-9])${escapeRegExp(needle)}s?([^a-z0-9]|$)`).test(haystack);
  });
}

function specialistForTool(toolName: OutreachAgentTool): AgentSpecialist {
  switch (toolName) {
    case 'answer_product_question':
    case 'refuse_out_of_scope':
      return 'general_chat';
    case 'search_prospects':
      return 'profiles_finder';
    case 'get_workspace_status':
    case 'list_automations':
    case 'get_inbox_attention':
    case 'get_pipeline_attention':
      return 'status';
    case 'list_campaigns':
      return 'outreach';
    case 'launch_sequence':
    case 'create_automation':
      return 'review_safety';
    case 'save_prospects':
    case 'find_emails':
    case 'draft_sequence':
    case 'revise_sequence':
      return 'outreach';
  }
}

function needsConfirmation(toolName: OutreachAgentTool, body: AgentRuntimeBody) {
  if (body.confirmed || body.action) return false;
  return toolName === 'launch_sequence' || toolName === 'create_automation';
}

function summarizeToolInput(body: AgentRuntimeBody, task?: AgentTask) {
  return {
    taskId: task?.id || null,
    specialist: task?.specialist || null,
    prospectIds: body.prospectIds || [],
    requestedLimit: typeof body.message === 'string' ? extractRequestedProspectLimit(body.message) : null,
    hasSteps: Array.isArray(body.steps) && body.steps.length > 0,
    sequenceName: body.sequenceName || null,
    dailyLimit: body.dailyLimit || null,
    approvalRequired: body.approvalRequired ?? null,
  };
}

function fallbackAssistantText(toolName: OutreachAgentTool, output: unknown, message = '', lang: AgentLanguage = detectAgentLanguage(message)) {
  const data = output && typeof output === 'object' ? output as Record<string, unknown> : {};
  const copy = agentCopy(lang);

  switch (toolName) {
    case 'answer_product_question':
      return isSimpleGreeting(message) ? copy.greeting : copy.capabilities;
    case 'refuse_out_of_scope':
      return copy.refusal;
    case 'get_workspace_status':
      return data.summary ? String(data.summary) : (lang === 'fr' ? 'Statut workspace récupéré.' : 'Workspace status is ready.');
    case 'list_automations':
      return data.summary ? String(data.summary) : (lang === 'fr' ? 'Automatisations récupérées.' : 'Automations are ready.');
    case 'list_campaigns':
      return data.summary ? String(data.summary) : (lang === 'fr' ? 'Campagnes et séquences récupérées.' : 'Campaigns and sequences are ready.');
    case 'get_inbox_attention':
      return data.summary ? String(data.summary) : (lang === 'fr' ? 'Inbox vérifiée.' : 'Inbox attention is ready.');
    case 'get_pipeline_attention':
      return data.summary ? String(data.summary) : (lang === 'fr' ? 'File outbound vérifiée.' : 'Outbound queue attention is ready.');
    case 'search_prospects': {
      const found = (data.prospects as unknown[] | undefined)?.length || 0;
      const requested = Number(data.requestedLimit || 0);
      return searchResultSummary({ found, requested, lang, failed: data.failed === true });
    }
    case 'find_emails':
      return lang === 'fr'
        ? `Enrichissement email lancé pour ${data.contactCount || 0} contact(s).`
        : `Email enrichment started for ${data.contactCount || 0} contact(s).`;
    case 'draft_sequence':
    case 'revise_sequence':
      return lang === 'fr'
        ? 'Séquence prête. Tu peux l’éditer ou me demander une révision ciblée.'
        : 'Sequence ready. You can edit it or ask for a focused revision.';
    case 'launch_sequence':
      return lang === 'fr'
        ? `${data.enrolled || 0} prospect(s) mis en file dans la séquence.`
        : `${data.enrolled || 0} prospect(s) queued into the sequence.`;
    case 'create_automation':
      return lang === 'fr'
        ? 'Automatisation récurrente créée pour ce fil.'
        : 'Recurring automation created for this thread.';
    case 'save_prospects':
      return lang === 'fr'
        ? `${data.saved || 0} prospect(s) sauvegardé(s) dans les contacts.`
        : `${data.saved || 0} prospect(s) saved to contacts.`;
  }
}

function artifactAssistantText(artifactPayload: OutreachArtifact, lang: AgentLanguage) {
  return artifactPayload.summary || fallbackAssistantText('get_workspace_status', artifactPayload, '', lang);
}

function toolTitle(toolName: OutreachAgentTool, lang: AgentLanguage) {
  return agentToolTitle(toolName, lang);
}

function toolDetail(toolName: OutreachAgentTool, lang: AgentLanguage) {
  return agentToolDetail(toolName, lang);
}

function createTask(toolName: OutreachAgentTool, index: number, source: TaskSource, reason?: string, directAnswer?: string): AgentTask {
  return {
    id: `${toolName}-${index + 1}`,
    toolName,
    specialist: specialistForTool(toolName),
    reason: reason || `Use ${toolName.replace(/_/g, ' ')}.`,
    directAnswer,
    source,
  };
}

function cleanTaskList(tasks: Array<Partial<AgentTask> & { toolName: OutreachAgentTool }>, source: TaskSource): AgentTask[] {
  const seen = new Set<OutreachAgentTool>();
  const cleaned: AgentTask[] = [];

  for (const task of tasks) {
    if (seen.has(task.toolName)) continue;
    seen.add(task.toolName);
    cleaned.push(createTask(task.toolName, cleaned.length, task.source || source, task.reason, task.directAnswer));
  }

  const hasOperationalTask = cleaned.some((task) => task.toolName !== 'answer_product_question' && task.toolName !== 'refuse_out_of_scope');
  const scoped = hasOperationalTask
    ? cleaned.filter((task) => task.toolName !== 'answer_product_question' && task.toolName !== 'refuse_out_of_scope')
    : cleaned;

  return scoped.slice(0, 4);
}

function deterministicTasks(input: {
  message: string;
  action?: AgentAction;
  hasProspects: boolean;
  hasSequenceDraft: boolean;
}): AgentTask[] {
  if (input.action) {
    return [createTask(normalizeTool(input.action), 0, 'ui', 'Explicit UI action.')];
  }

  const lower = normalizeText(input.message);
  const tasks: Array<{ toolName: OutreachAgentTool; reason: string }> = [];
  const push = (toolName: OutreachAgentTool, reason: string) => tasks.push({ toolName, reason });

  const primary = inferOutreachTool(input.message, input.hasProspects, input.hasSequenceDraft);
  const campaignStatusWords = [
    'show',
    'list',
    'check',
    'status',
    'update',
    'updates',
    'ongoing',
    'current',
    'existing',
    'past',
    'active',
    'voir',
    'liste',
    'etat',
    'point',
  ];
  const campaignStatus = textIncludes(lower, ['campaign', 'campaigns', 'campagne', 'campagnes']) ||
    (textIncludes(lower, ['sequence', 'sequences', 'séquence', 'séquences']) && textIncludes(lower, campaignStatusWords));

  if (primary === 'search_prospects') push('search_prospects', 'The request describes an audience or ICP to source.');
  if (campaignStatus || primary === 'list_campaigns') push('list_campaigns', 'The request asks for campaign or sequence state.');
  if (primary === 'list_automations' || textIncludes(lower, ['automation', 'automations', 'automatisation', 'automatisations'])) {
    if (textIncludes(lower, ['create', 'set up', 'run this', 'every morning', 'recurring', 'crée', 'creer', 'mets en place'])) {
      push('create_automation', 'The request asks to create a recurring automation.');
    } else {
      push('list_automations', 'The request asks for automation state.');
    }
  }
  if (primary === 'get_inbox_attention' || textIncludes(lower, ['inbox', 'reply', 'replies', 'conversation', 'réponse', 'reponse'])) {
    push('get_inbox_attention', 'The request asks for replies or inbox attention.');
  }
  if (primary === 'get_pipeline_attention' || textIncludes(lower, ['pipeline', 'review queue', 'approval', 'blocked', 'ready', 'à valider', 'a valider'])) {
    push('get_pipeline_attention', 'The request asks for review or pipeline state.');
  }
  if (primary === 'get_workspace_status' || textIncludes(lower, ['status', 'summary', 'today', 'overview', 'attention', 'où on en est', 'quoi faire'])) {
    push('get_workspace_status', 'The request asks for workspace status.');
  }
  if (primary === 'find_emails') push('find_emails', 'The request asks to enrich or find missing emails.');
  if (primary === 'save_prospects') push('save_prospects', 'The request asks to save selected prospects.');
  if (primary === 'launch_sequence') push('launch_sequence', 'The request asks to launch or send a sequence.');
  if (primary === 'create_automation') push('create_automation', 'The request asks to create a recurring automation.');
  if (primary === 'draft_sequence' || primary === 'revise_sequence') {
    push(primary, primary === 'revise_sequence' ? 'The request asks to revise the current sequence.' : 'The request asks to draft an outreach sequence.');
  }

  if (!tasks.length) push(primary, primary === 'refuse_out_of_scope' ? 'The request is outside the CRM/outreach scope.' : 'Single best deterministic route.');
  return cleanTaskList(tasks, 'deterministic');
}

function toolChoicePrompt(input: {
  message: string;
  deterministic: AgentTask[];
  hasProspects: boolean;
  hasSequenceDraft: boolean;
  sessionPrompt: string;
  recentMessages: string[];
}) {
  return `User message:
${input.message || '(empty)'}

Thread context:
- Current session prompt: ${input.sessionPrompt || '(none)'}
- Has prospects in this thread: ${input.hasProspects ? 'yes' : 'no'}
- Has sequence draft: ${input.hasSequenceDraft ? 'yes' : 'no'}
- Deterministic candidates:
${input.deterministic.map((task) => `  - ${task.toolName}: ${task.reason}`).join('\n') || '  - none'}
- Recent messages:
${input.recentMessages.length ? input.recentMessages.join('\n') : '(none)'}`;
}

async function invokeStructured<T extends Record<string, unknown>>(input: {
  task: AgentModelTask;
  schema: z.ZodType<T>;
  schemaName: string;
  system: string;
  prompt: string;
}): Promise<T> {
  const model = chatModel(input.task);
  if (!model.withStructuredOutput) {
    throw new Error('Selected LangChain chat model does not support structured output.');
  }

  const runnable = model.withStructuredOutput(input.schema, { name: input.schemaName });
  return await runnable.invoke([
    new SystemMessage(input.system),
    new HumanMessage(input.prompt),
  ]) as T;
}

async function chooseTasksWithModel(input: {
  message: string;
  bundle: Awaited<ReturnType<typeof getOutreachSessionBundle>>;
  deterministic: AgentTask[];
}) {
  const recentMessages = input.bundle.messages
    .slice(-6)
    .map((message) => `${message.role}: ${String(message.content || '').slice(0, 180)}`);

  const plan = await invokeStructured({
    task: 'assistant',
    schema: TaskPlanSchema,
    schemaName: 'OutreachAgentTaskPlan',
    system: `You are the supervisor for the Orianna/isimple CRM launch agent.
Decompose the user request into one to four independent specialist tasks.

Scope:
- In scope: Orianna/isimple webapp, workspace status, campaigns, sequences, automations, inbox/replies, contacts, prospects, outbound queue, search, enrichment, drafting, launching reviewed outreach, and recurring automations.
- Out of scope: general knowledge, trivia, math, coding help, life advice, weather, sports, and unrelated chat.

Rules:
- Return multiple tasks for mixed requests, e.g. "find new prospects and show active campaigns".
- Use search_prospects for any audience/ICP/prospecting request.
- Use list_campaigns for past, current, ongoing, draft, or active campaigns/sequences.
- Use answer_product_question only for greetings or scoped product/capability questions.
- Use refuse_out_of_scope only when the whole request is unrelated.
- Do not choose launch_sequence or create_automation unless the user clearly asks to launch/send or automate.
- Prefer read/status tools for current facts; never invent workspace state.`,
    prompt: toolChoicePrompt({
      message: input.message,
      deterministic: input.deterministic,
      hasProspects: input.bundle.prospects.length > 0,
      hasSequenceDraft: Boolean(input.bundle.sequenceDraft),
      sessionPrompt: input.bundle.session?.prompt || '',
      recentMessages,
    }),
  });

  const modelTasks = cleanTaskList(
    plan.tasks.map((task) => ({
      toolName: task.toolName,
      reason: task.reason || 'Model selected this specialist task.',
      directAnswer: plan.directAnswer,
    })),
    'model'
  );

  const deterministicHasRefusal = input.deterministic.length === 1 && input.deterministic[0].toolName === 'refuse_out_of_scope';
  if (deterministicHasRefusal) return input.deterministic;

  const deterministicToolNames = new Set(input.deterministic.map((task) => task.toolName));
  const safeModelTasks = modelTasks.filter((task) => {
    if ((task.toolName === 'launch_sequence' || task.toolName === 'create_automation') && !deterministicToolNames.has(task.toolName)) {
      return false;
    }
    return true;
  });

  const merged = cleanTaskList([
    ...safeModelTasks,
    ...input.deterministic.filter((task) =>
      task.toolName === 'search_prospects' ||
      task.toolName === 'list_campaigns' ||
      task.toolName === 'get_workspace_status' ||
      task.toolName === 'get_inbox_attention' ||
      task.toolName === 'get_pipeline_attention'
    ),
  ], 'model');

  return merged.length ? merged : input.deterministic;
}

function orderTaskResults(tasks: AgentTask[], results: AgentTaskResult[]) {
  const byId = new Map(results.map((result) => [result.taskId, result]));
  return tasks.map((task) => byId.get(task.id)).filter((result): result is AgentTaskResult => Boolean(result));
}

function fallbackSynthesis(tasks: AgentTask[], results: AgentTaskResult[], lang: AgentLanguage) {
  const ordered = orderTaskResults(tasks, results);
  const confirmations = ordered.filter((result) => result.requiresConfirmation);
  const failures = ordered.filter((result) => result.status === 'failed');
  const completed = ordered.filter((result) => result.status === 'complete' && result.responseText);
  const copy = agentCopy(lang);

  if (confirmations.length) {
    const otherText = completed.map((result) => result.responseText).filter(Boolean).join('\n');
    const confirmationText = confirmations.map((result) => result.responseText).filter(Boolean).join('\n');
    return [otherText, confirmationText].filter(Boolean).join('\n\n') || copy.confirmation;
  }

  if (completed.length) {
    const text = completed.map((result) => result.responseText).filter(Boolean).join('\n');
    if (failures.length) {
      const failureText = failures.map((result) => result.responseText || result.error).filter(Boolean).join('\n');
      return [text, failureText || copy.partialFailureIntro].filter(Boolean).join('\n\n');
    }
    return text;
  }

  if (failures.length) return failures.map((result) => result.responseText || result.error).filter(Boolean).join('\n');
  return copy.noUsefulAction;
}

async function synthesizeWithModel(tasks: AgentTask[], results: AgentTaskResult[], lang: AgentLanguage) {
  const successful = results.filter((result) => result.status === 'complete');
  if (successful.length <= 1) return fallbackSynthesis(tasks, results, lang);

  try {
    const output = await invokeStructured({
      task: 'assistant',
      schema: SupervisorResponseSchema,
      schemaName: 'OutreachAgentFinalResponse',
      system: `You are the user-facing supervisor for Orianna/isimple CRM.
Write one concise, operational response in ${lang === 'fr' ? 'French' : 'English'}.
Stay inside CRM/outreach scope. Do not invent facts. Do not explain the architecture.
Mention partial failures only if present, and keep successful results visible.`,
      prompt: `Tasks:
${JSON.stringify(tasks, null, 2)}

Specialist results:
${JSON.stringify(results.map((result) => ({
  toolName: result.toolName,
  specialist: result.specialist,
  status: result.status,
  responseText: result.responseText,
  error: result.error,
  artifactSummary: result.artifact?.summary,
})), null, 2)}`,
    });
    return output.response.trim() || fallbackSynthesis(tasks, results, lang);
  } catch (error) {
    console.warn('[OutreachAgent] Final synthesis model failed; using deterministic synthesis.', error);
    return fallbackSynthesis(tasks, results, lang);
  }
}

export async function runOutreachAgentGraph(input: AgentRuntimeInput) {
  const { db, workspaceId, userId, sessionId, body, emit } = input;
  let bundle = await getOutreachSessionBundle(db, workspaceId, sessionId);
  if (!bundle.session) throw new Error('Outreach session not found');

  const cleanMessage = typeof body.message === 'string' ? body.message.trim() : '';
  const runLanguage = detectAgentLanguage(cleanMessage || bundle.session?.prompt || '');
  const run = await createOutreachRun(db, {
    workspaceId,
    sessionId,
    userId,
    modelProvider: langChainProviderLabel('assistant'),
    input: {
      message: cleanMessage,
      action: body.action || null,
      confirmed: Boolean(body.confirmed),
    },
  });
  emit('run_status', {
    id: run?.id || `local-run-${Date.now()}`,
    session_id: sessionId,
    status: 'running',
    provider: 'langgraph',
  });

  const callSessionEndpoint = async (path: string, payload: Record<string, unknown>) => {
    const response = await fetch(new URL(`/api/outreach/sessions/${sessionId}/${path}`, input.requestUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: input.cookie,
        'x-workspace-id': input.workspaceHeader,
      },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = typeof data.userMessage === 'string'
        ? data.userMessage
        : typeof data.error === 'string'
          ? data.error
          : response.statusText;
      const error = new Error(message) as EndpointError;
      error.status = response.status;
      error.payload = data && typeof data === 'object' ? data as Record<string, unknown> : {};
      throw error;
    }
    return data;
  };

  const failedProspectArtifact = (error: unknown, prompt: string, requestedLimit: number | null) => {
    const payload = (error as EndpointError)?.payload || {};
    const normalized = normalizeAgentError(error, runLanguage, 'search');
    const suggested = Array.isArray(payload.suggestedQueries)
      ? payload.suggestedQueries.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : [];
    const retryPrompt = typeof payload.retryPrompt === 'string' && payload.retryPrompt.trim()
      ? payload.retryPrompt.trim()
      : prompt;

    return artifact(
      'prospect_list',
      runLanguage === 'fr' ? 'Recherche prospects à relancer' : 'Prospect search needs retry',
      {
        prospects: [],
        requestedLimit,
        verifiedCount: 0,
        failed: true,
        retryable: normalized.retryable,
        errorCode: normalized.code,
        error: normalized.message,
        retryPrompt,
        suggestedQueries: suggested,
        brief: payload.brief && typeof payload.brief === 'object' ? payload.brief : null,
      },
      normalized.message
    );
  };

  const emitToolStep = async (
    kind: string,
    title: string,
    detail: string,
    status: 'running' | 'complete' | 'failed' = 'complete',
    metadata?: Record<string, unknown>
  ) => {
    const event = await createOutreachEvent(db, {
      workspaceId,
      sessionId,
      kind,
      title,
      detail,
      status,
      metadata,
    });
    const fallbackEvent = {
      id: `local-${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      workspace_id: workspaceId,
      session_id: sessionId,
      kind,
      title,
      detail,
      status,
      metadata: metadata || {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const payload = event || fallbackEvent;
    emit('event', payload);
    return payload;
  };

  const completeToolStep = async (
    eventId: string | null,
    kind: string,
    title: string,
    detail: string,
    status: 'complete' | 'failed',
    metadata?: Record<string, unknown>
  ) => {
    const updated = eventId?.startsWith('local-')
      ? null
      : await updateOutreachEvent(db, {
        workspaceId,
        eventId,
        status,
        detail,
        metadata,
      });
    emit('event', updated || {
      id: eventId || `local-${kind}-${Date.now()}`,
      workspace_id: workspaceId,
      session_id: sessionId,
      kind,
      title,
      detail,
      status,
      metadata: metadata || {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  };

  const emitInstantStep = async (
    kind: string,
    title: string,
    detail: string,
    metadata?: Record<string, unknown>
  ) => {
    const event = await emitToolStep(kind, title, detail, 'running', metadata);
    await completeToolStep(event.id, kind, title, detail, 'complete', metadata);
  };

  const runTrackedTool = async <T,>(
    task: AgentTask,
    execute: () => Promise<T>,
    artifactBuilder?: (output: T) => OutreachArtifact | null
  ) => {
    const permission = TOOL_PERMISSION.get(task.toolName) || 'read';
    const title = toolTitle(task.toolName, runLanguage);
    const detail = toolDetail(task.toolName, runLanguage);
    const toolCall = await createOutreachToolCall(db, {
      workspaceId,
      sessionId,
      runId: run?.id || null,
      toolName: task.toolName,
      specialist: task.specialist,
      permission,
      status: 'running',
      input: summarizeToolInput(body, task),
      confirmationRequired: false,
    });
    emit('tool_call', {
      id: toolCall?.id || `local-tool-${Date.now()}`,
      tool_name: task.toolName,
      specialist: task.specialist,
      permission,
      status: 'running',
      title,
      detail,
    });

    const event = await emitToolStep(task.toolName, title, detail, 'running', {
      specialist: task.specialist,
      taskId: task.id,
      reason: task.reason,
    });
    try {
      const output = await execute();
      const outputRecord = output && typeof output === 'object' ? output as Record<string, unknown> : { output };
      await completeToolStep(
        event.id,
        task.toolName,
        title,
        task.toolName === 'find_emails'
          ? runLanguage === 'fr' ? 'Enrichissement email en cours.' : 'Email enrichment is running.'
          : agentCopy(runLanguage).genericDone,
        'complete',
        {
          ...outputRecord,
          specialist: task.specialist,
          taskId: task.id,
        }
      );
      await updateOutreachToolCall(db, {
        workspaceId,
        toolCallId: toolCall?.id || null,
        status: 'complete',
        output: outputRecord,
      });
      emit('tool_result', {
        id: toolCall?.id || null,
        tool_name: task.toolName,
        specialist: task.specialist,
        status: 'complete',
        output: outputRecord,
      });
      const toolArtifact = artifactBuilder?.(output);
      if (toolArtifact) emit('artifact', toolArtifact);
      return { output, artifact: toolArtifact || null };
    } catch (error) {
      const context = task.toolName === 'search_prospects' ? 'search' : task.toolName === 'find_emails' ? 'enrichment' : 'agent';
      const normalized = normalizeAgentError(error, runLanguage, context);
      await completeToolStep(event.id, task.toolName, title, normalized.message, 'failed', {
        specialist: task.specialist,
        taskId: task.id,
      });
      await updateOutreachToolCall(db, {
        workspaceId,
        toolCallId: toolCall?.id || null,
        status: 'failed',
        error: normalized.message,
      });
      emit('tool_result', {
        id: toolCall?.id || null,
        tool_name: task.toolName,
        specialist: task.specialist,
        status: 'failed',
        error: normalized.message,
      });
      throw error;
    }
  };

  const confirmationResult = async (task: AgentTask): Promise<AgentTaskResult> => {
    const permission = TOOL_PERMISSION.get(task.toolName) || 'send';
    const toolCall = await createOutreachToolCall(db, {
      workspaceId,
      sessionId,
      runId: run?.id || null,
      toolName: task.toolName,
      specialist: task.specialist,
      permission,
      status: 'pending_confirmation',
      input: summarizeToolInput(body, task),
      confirmationRequired: true,
    });
    emit('tool_call', {
      id: toolCall?.id || `local-tool-${Date.now()}`,
      tool_name: task.toolName,
      specialist: task.specialist,
      permission,
      status: 'pending_confirmation',
      title: toolTitle(task.toolName, runLanguage),
      detail: task.reason,
    });

    const copy = agentCopy(runLanguage);
    const confirmationArtifact = artifact(
      'confirmation_required',
      runLanguage === 'fr' ? 'Confirmation requise' : 'Confirmation required',
      {
        toolName: task.toolName,
        specialist: task.specialist,
        toolCallId: toolCall?.id || null,
        action: task.toolName,
        reason: task.reason,
      },
      task.toolName === 'launch_sequence'
        ? copy.launchConfirmation
        : copy.automationConfirmation
    );
    emit('confirmation_required', confirmationArtifact);
    emit('artifact', confirmationArtifact);

    return {
      taskId: task.id,
      toolName: task.toolName,
      specialist: task.specialist,
      status: 'waiting_confirmation',
      requiresConfirmation: true,
      artifact: confirmationArtifact,
      responseText: confirmationArtifact.summary || copy.confirmation,
    };
  };

  const executeTask = async (task: AgentTask, state: AgentStateValue): Promise<AgentTaskResult> => {
    if (needsConfirmation(task.toolName, body)) {
      return confirmationResult(task);
    }

    if (task.toolName === 'answer_product_question') {
      return {
        taskId: task.id,
        toolName: task.toolName,
        specialist: task.specialist,
        status: 'complete',
        toolOutput: { scope: 'product_question', reason: task.reason },
        responseText: task.directAnswer || fallbackAssistantText('answer_product_question', null, state.message, runLanguage),
      };
    }

    if (task.toolName === 'refuse_out_of_scope') {
      return {
        taskId: task.id,
        toolName: task.toolName,
        specialist: task.specialist,
        status: 'complete',
        toolOutput: { guardrail: 'out_of_scope', reason: task.reason },
        responseText: task.directAnswer || fallbackAssistantText('refuse_out_of_scope', null, state.message, runLanguage),
      };
    }

    if (
      task.toolName === 'get_workspace_status' ||
      task.toolName === 'list_automations' ||
      task.toolName === 'list_campaigns' ||
      task.toolName === 'get_inbox_attention' ||
      task.toolName === 'get_pipeline_attention'
    ) {
      const { output, artifact: toolArtifact } = await runTrackedTool(
        task,
        async () => {
          const result = task.toolName === 'list_automations'
            ? await listAutomationsArtifact(db, workspaceId)
            : task.toolName === 'list_campaigns'
              ? await listCampaignsArtifact(db, workspaceId)
              : task.toolName === 'get_inbox_attention'
                ? await getInboxAttentionArtifact(db, workspaceId, userId)
                : task.toolName === 'get_pipeline_attention'
                  ? await getPipelineAttentionArtifact(db, workspaceId)
                  : await getWorkspaceStatusArtifact(db, workspaceId, userId);
          return { artifact: result, summary: result.summary };
        },
        (outputValue) => (outputValue as { artifact?: OutreachArtifact }).artifact || null
      );
      const artifactPayload = (output as { artifact?: OutreachArtifact }).artifact || toolArtifact;
      return {
        taskId: task.id,
        toolName: task.toolName,
        specialist: task.specialist,
        status: 'complete',
        toolOutput: output,
        artifact: artifactPayload || null,
        responseText: artifactPayload ? artifactAssistantText(artifactPayload, runLanguage) : fallbackAssistantText(task.toolName, output, state.message, runLanguage),
      };
    }

    if (task.toolName === 'search_prospects') {
      const activePrompt = state.message || bundle.session?.prompt || '';
      const requestedLimit = extractRequestedProspectLimit(activePrompt);
      await emitInstantStep(
        'profiles_finder_refine',
        runLanguage === 'fr' ? 'Cible' : 'Target',
        runLanguage === 'fr'
          ? 'Lecture du rôle, de la zone, du type d’entreprise, des exclusions et des critères de revue.'
          : 'Reading role, area, company type, exclusions, and review criteria.',
        { specialist: task.specialist, taskId: task.id }
      );
      const { output, artifact: toolArtifact } = await runTrackedTool(
        task,
        async () => callSessionEndpoint('search', { prompt: activePrompt, limit: requestedLimit }),
        (outputValue) => {
          const data = outputValue && typeof outputValue === 'object' ? outputValue as Record<string, unknown> : {};
          const found = (data.prospects as unknown[] | undefined)?.length || 0;
          const requested = Number(data.requestedLimit || requestedLimit);
          const summary = searchResultSummary({ found, requested, lang: runLanguage });
          return artifact('prospect_list', runLanguage === 'fr' ? 'Première liste prospects' : 'First prospect list', data, summary);
        }
      );
      await emitInstantStep(
        'profiles_finder_review',
        runLanguage === 'fr' ? 'Revue' : 'Review',
        runLanguage === 'fr'
          ? 'Préparation des candidats sourcés avant enrichissement ou outreach.'
          : 'Preparing sourced candidates before enrichment or outreach.',
        { specialist: task.specialist, taskId: task.id }
      );
      return {
        taskId: task.id,
        toolName: task.toolName,
        specialist: task.specialist,
        status: 'complete',
        toolOutput: output,
        artifact: toolArtifact,
        responseText: fallbackAssistantText('search_prospects', output, activePrompt, runLanguage),
      };
    }

    if (task.toolName === 'save_prospects') {
      const { output, artifact: toolArtifact } = await runTrackedTool(
        task,
        async () => callSessionEndpoint('save-prospects', {
          prospectIds: body.prospectIds?.length ? body.prospectIds : selectedProspectIds(bundle.prospects),
        }),
        (outputValue) => artifact(
          'pipeline_attention',
          runLanguage === 'fr' ? 'Prospects sauvegardés' : 'Prospects saved',
          outputValue && typeof outputValue === 'object' ? outputValue as Record<string, unknown> : {},
          runLanguage === 'fr' ? 'Les prospects sélectionnés ont été sauvegardés dans les contacts.' : 'Selected prospects were saved to contacts.'
        )
      );
      return {
        taskId: task.id,
        toolName: task.toolName,
        specialist: task.specialist,
        status: 'complete',
        toolOutput: output,
        artifact: toolArtifact,
        responseText: fallbackAssistantText('save_prospects', output, state.message, runLanguage),
      };
    }

    if (task.toolName === 'find_emails') {
      const { output, artifact: toolArtifact } = await runTrackedTool(
        task,
        async () => callSessionEndpoint('enrich', {
          prospectIds: body.prospectIds?.length ? body.prospectIds : selectedProspectIds(bundle.prospects),
        }),
        (outputValue) => artifact(
          'enrichment_status',
          runLanguage === 'fr' ? 'Enrichissement email lancé' : 'Email enrichment started',
          outputValue && typeof outputValue === 'object' ? outputValue as Record<string, unknown> : {},
          runLanguage === 'fr' ? 'Enrichissement email en cours en arrière-plan.' : 'Email enrichment is running in the background.'
        )
      );
      return {
        taskId: task.id,
        toolName: task.toolName,
        specialist: task.specialist,
        status: 'complete',
        toolOutput: output,
        artifact: toolArtifact,
        responseText: fallbackAssistantText('find_emails', output, state.message, runLanguage),
      };
    }

    if (task.toolName === 'launch_sequence') {
      const { output, artifact: toolArtifact } = await runTrackedTool(
        task,
        async () => callSessionEndpoint('launch', {
          prospectIds: body.prospectIds?.length ? body.prospectIds : selectedProspectIds(bundle.prospects),
          sequenceName: body.sequenceName,
          steps: body.steps,
        }),
        (outputValue) => artifact(
          'confirmation_required',
          runLanguage === 'fr' ? 'Séquence lancée' : 'Sequence launched',
          outputValue && typeof outputValue === 'object' ? outputValue as Record<string, unknown> : {},
          runLanguage === 'fr' ? 'Les prospects éligibles ont été mis en file.' : 'Eligible prospects were queued.'
        )
      );
      return {
        taskId: task.id,
        toolName: task.toolName,
        specialist: task.specialist,
        status: 'complete',
        toolOutput: output,
        artifact: toolArtifact,
        responseText: fallbackAssistantText('launch_sequence', output, state.message, runLanguage),
      };
    }

    if (task.toolName === 'create_automation') {
      const { output, artifact: toolArtifact } = await runTrackedTool(
        task,
        async () => callSessionEndpoint('automate', {
          dailyLimit: body.dailyLimit || 20,
          approvalRequired: body.approvalRequired ?? true,
        }),
        (outputValue) => artifact(
          'automation_created',
          runLanguage === 'fr' ? 'Automatisation créée' : 'Automation created',
          outputValue && typeof outputValue === 'object' ? outputValue as Record<string, unknown> : {},
          runLanguage === 'fr' ? 'L’automatisation récurrente est active.' : 'The recurring outreach automation is active.'
        )
      );
      return {
        taskId: task.id,
        toolName: task.toolName,
        specialist: task.specialist,
        status: 'complete',
        toolOutput: output,
        artifact: toolArtifact,
        responseText: fallbackAssistantText('create_automation', output, state.message, runLanguage),
      };
    }

    const revisionPrompt = task.toolName === 'revise_sequence' ? body.revisionPrompt : undefined;
    const { output, artifact: toolArtifact } = await runTrackedTool(
      task,
      async () => callSessionEndpoint('sequence', {
        revisionPrompt,
        prospectIds: body.prospectIds?.length ? body.prospectIds : selectedProspectIds(bundle.prospects),
      }),
      (outputValue) => artifact(
        'sequence_draft',
        revisionPrompt
          ? runLanguage === 'fr' ? 'Séquence révisée' : 'Sequence revised'
          : runLanguage === 'fr' ? 'Séquence préparée' : 'Sequence drafted',
        outputValue && typeof outputValue === 'object' ? outputValue as Record<string, unknown> : {},
        runLanguage === 'fr' ? 'Le brouillon de séquence est prêt à relire.' : 'The sequence draft is ready to review.'
      )
    );
    return {
      taskId: task.id,
      toolName: task.toolName,
      specialist: task.specialist,
      status: 'complete',
      toolOutput: output,
      artifact: toolArtifact,
      responseText: fallbackAssistantText(task.toolName, output, state.message, runLanguage),
    };
  };

  const planTasksNode = async (state: AgentStateValue): Promise<AgentStateUpdate> => {
    const deterministic = deterministicTasks({
      message: state.message,
      action: state.action,
      hasProspects: bundle.prospects.length > 0,
      hasSequenceDraft: Boolean(bundle.sequenceDraft),
    });

    if (state.action) return { tasks: deterministic };

    try {
      const planned = await chooseTasksWithModel({
        message: state.message,
        bundle,
        deterministic,
      });
      return { tasks: planned };
    } catch (error) {
      console.warn('[OutreachAgent] Task planning model failed; using deterministic fallback.', error);
      return { tasks: deterministic };
    }
  };

  const fanOutTasks = (state: AgentStateValue) => {
    const tasks = state.tasks.length
      ? state.tasks
      : deterministicTasks({
        message: state.message,
        action: state.action,
        hasProspects: bundle.prospects.length > 0,
        hasSequenceDraft: Boolean(bundle.sequenceDraft),
      });

    return tasks.map((task) => new Send('run_specialist', {
      message: state.message,
      action: state.action,
      confirmed: state.confirmed,
      tasks,
      task,
    }));
  };

  const runSpecialistNode = async (state: AgentStateValue): Promise<AgentStateUpdate> => {
    const task = state.task;
    if (!task) return {};

    try {
      const result = await executeTask(task, state);
      return {
        taskResults: [result],
        artifacts: result.artifact ? [result.artifact] : [],
        requiresConfirmation: Boolean(result.requiresConfirmation),
      };
    } catch (error) {
      const context = task.toolName === 'search_prospects' ? 'search' : task.toolName === 'find_emails' ? 'enrichment' : 'agent';
      const normalized = normalizeAgentError(error, runLanguage, context);
      const failedArtifact = task.toolName === 'search_prospects'
        ? failedProspectArtifact(error, state.message || bundle.session?.prompt || '', extractRequestedProspectLimit(state.message || bundle.session?.prompt || ''))
        : null;
      if (failedArtifact) emit('artifact', failedArtifact);
      return {
        taskResults: [{
          taskId: task.id,
          toolName: task.toolName,
          specialist: task.specialist,
          status: 'failed',
          error: normalized.message,
          responseText: normalized.message,
          artifact: failedArtifact,
        }],
        artifacts: failedArtifact ? [failedArtifact] : [],
      };
    }
  };

  const finalResponseNode = async (state: AgentStateValue): Promise<AgentStateUpdate> => ({
    responseText: await synthesizeWithModel(state.tasks, state.taskResults, runLanguage),
  });

  const graph = new StateGraph(AgentState)
    .addNode('plan_tasks', planTasksNode)
    .addNode('run_specialist', runSpecialistNode)
    .addNode('synthesize_response', finalResponseNode)
    .addEdge(START, 'plan_tasks')
    .addConditionalEdges('plan_tasks', fanOutTasks, ['run_specialist'])
    .addEdge('run_specialist', 'synthesize_response')
    .addEdge('synthesize_response', END)
    .compile();

  try {
    const result = await graph.invoke({
      message: cleanMessage,
      action: body.action,
      confirmed: Boolean(body.confirmed),
    });
    const assistantText = result.responseText || fallbackSynthesis(result.tasks, result.taskResults, runLanguage);
    const allFailed = result.taskResults.length > 0 && result.taskResults.every((taskResult) => taskResult.status === 'failed');
    const assistantMessage = await appendOutreachMessage(db, {
      workspaceId,
      sessionId,
      role: 'assistant',
      content: assistantText,
      status: allFailed ? 'failed' : 'complete',
      metadata: {
        provider: 'langgraph',
        runId: run?.id || null,
        tasks: result.tasks.map((task) => ({
          id: task.id,
          toolName: task.toolName,
          specialist: task.specialist,
          source: task.source,
        })),
        taskResults: result.taskResults.map((taskResult) => ({
          taskId: taskResult.taskId,
          toolName: taskResult.toolName,
          specialist: taskResult.specialist,
          status: taskResult.status,
          error: taskResult.error,
          requiresConfirmation: taskResult.requiresConfirmation,
        })),
        requiresConfirmation: result.requiresConfirmation,
      },
    });
    emit('message', assistantMessage || {
      id: `local-assistant-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      workspace_id: workspaceId,
      session_id: sessionId,
      role: 'assistant',
      content: assistantText,
      status: allFailed ? 'failed' : 'complete',
      metadata: { provider: 'langgraph', runId: run?.id || null, tasks: result.tasks, persisted: false },
      created_at: new Date().toISOString(),
    });

    await updateOutreachRun(db, {
      workspaceId,
      runId: run?.id || null,
      status: allFailed ? 'failed' : result.requiresConfirmation ? 'waiting_confirmation' : 'complete',
      output: {
        tasks: result.tasks,
        taskResults: result.taskResults.map((taskResult) => ({
          taskId: taskResult.taskId,
          toolName: taskResult.toolName,
          specialist: taskResult.specialist,
          status: taskResult.status,
          error: taskResult.error,
          requiresConfirmation: taskResult.requiresConfirmation,
          artifact: taskResult.artifact || null,
        })),
        requiresConfirmation: result.requiresConfirmation,
        artifacts: result.artifacts || [],
      },
      error: allFailed ? result.taskResults.map((taskResult) => taskResult.error).filter(Boolean).join('; ') : undefined,
    });

    bundle = await getOutreachSessionBundle(db, workspaceId, sessionId);
    emit('bundle', bundle);
    emit('run_status', {
      id: run?.id || null,
      session_id: sessionId,
      status: allFailed ? 'failed' : result.requiresConfirmation ? 'waiting_confirmation' : 'complete',
      provider: 'langgraph',
    });
    return result;
  } catch (error) {
    const normalized = normalizeAgentError(error, runLanguage, 'agent');
    const message = normalized.message;
    await updateOutreachRun(db, {
      workspaceId,
      runId: run?.id || null,
      status: 'failed',
      error: message,
    });
    const assistantMessage = await appendOutreachMessage(db, {
      workspaceId,
      sessionId,
      role: 'assistant',
      content: message,
      metadata: { provider: 'langgraph', runId: run?.id || null },
      status: 'failed',
    });
    emit('message', assistantMessage || {
      id: `local-assistant-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      workspace_id: workspaceId,
      session_id: sessionId,
      role: 'assistant',
      content: message,
      status: 'failed',
      metadata: { provider: 'langgraph', runId: run?.id || null, persisted: false },
      created_at: new Date().toISOString(),
    });
    throw new Error(message);
  }
}
