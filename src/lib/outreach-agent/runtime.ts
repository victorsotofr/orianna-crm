import 'server-only';

import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import type { SupabaseClient } from '@supabase/supabase-js';

import { aiProviderLabel } from '@/lib/ai-provider';
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
  artifact,
  extractRequestedProspectLimit,
  getInboxAttentionArtifact,
  getPipelineAttentionArtifact,
  getWorkspaceStatusArtifact,
  inferOutreachTool,
  listAutomationsArtifact,
  type OutreachAgentTool,
  type OutreachArtifact,
} from '@/lib/outreach-agent/tools';

export type AgentAction =
  | OutreachAgentTool
  | 'workspace_status'
  | 'automations'
  | 'inbox'
  | 'pipeline'
  | 'search'
  | 'save'
  | 'enrich'
  | 'draft_sequence'
  | 'revise_sequence'
  | 'launch'
  | 'automate';

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

interface AgentStateUpdate {
  message?: string;
  action?: AgentAction;
  confirmed?: boolean;
  toolName?: OutreachAgentTool;
  reason?: string;
  specialist?: string;
  requiresConfirmation?: boolean;
  responseText?: string;
  toolOutput?: unknown;
  artifact?: OutreachArtifact | null;
}

const AgentState = Annotation.Root({
  message: Annotation<string>(),
  action: Annotation<AgentAction | undefined>(),
  confirmed: Annotation<boolean>(),
  toolName: Annotation<OutreachAgentTool>(),
  reason: Annotation<string>(),
  specialist: Annotation<string>(),
  requiresConfirmation: Annotation<boolean>(),
  responseText: Annotation<string>(),
  toolOutput: Annotation<unknown>(),
  artifact: Annotation<OutreachArtifact | null>(),
});

type AgentStateValue = typeof AgentState.State;

const READ_TOOLS = new Set<OutreachAgentTool>([
  'answer_directly',
  'redirect_off_domain',
  'get_workspace_status',
  'list_automations',
  'get_inbox_attention',
  'get_pipeline_attention',
  'parse_outreach_brief',
  'plan_search_queries',
]);

const TOOL_TO_SPECIALIST: Record<OutreachAgentTool, string> = {
  answer_directly: 'orchestrator',
  redirect_off_domain: 'orchestrator',
  get_workspace_status: 'crm_context',
  list_automations: 'automation',
  get_inbox_attention: 'inbox',
  get_pipeline_attention: 'crm_context',
  parse_outreach_brief: 'outreach',
  plan_search_queries: 'outreach',
  search_prospects: 'outreach',
  save_prospects: 'crm_context',
  find_emails: 'outreach',
  draft_sequence: 'outreach',
  revise_sequence: 'outreach',
  launch_sequence: 'compliance_guard',
  create_automation: 'automation',
};

const TOOL_PERMISSION = new Map(OUTREACH_AGENT_TOOLS.map((tool) => [tool.name, tool.permission]));

function selectedProspectIds(prospects: Array<{ id: string; selected?: boolean; ignored?: boolean }>) {
  return prospects
    .filter((prospect) => prospect.selected !== false && prospect.ignored !== true)
    .map((prospect) => prospect.id);
}

function normalizeTool(action: AgentAction | undefined, message: string, bundle: Awaited<ReturnType<typeof getOutreachSessionBundle>>): OutreachAgentTool {
  if (!action) return inferOutreachTool(message, bundle.prospects.length > 0, Boolean(bundle.sequenceDraft));

  const legacyMap: Partial<Record<AgentAction, OutreachAgentTool>> = {
    workspace_status: 'get_workspace_status',
    automations: 'list_automations',
    inbox: 'get_inbox_attention',
    pipeline: 'get_pipeline_attention',
    search: 'search_prospects',
    save: 'save_prospects',
    enrich: 'find_emails',
    launch: 'launch_sequence',
    automate: 'create_automation',
  };

  return legacyMap[action] || action as OutreachAgentTool;
}

function fallbackAssistantText(toolName: OutreachAgentTool, output: unknown) {
  const data = output && typeof output === 'object' ? output as Record<string, unknown> : {};

  switch (toolName) {
    case 'answer_directly':
      return typeof output === 'string' && output.trim()
        ? output
        : 'I can search prospects, check replies, review the outbound queue, draft sequences, and set up recurring outreach.';
    case 'redirect_off_domain':
      return 'Je suis spécialisé sur l’outreach, les prospects, les réponses, les automatisations et le CRM. Je peux lancer une recherche, vérifier l’inbox ou revoir la file outbound.';
    case 'get_workspace_status':
      return data.summary ? String(data.summary) : 'Here is the current workspace status.';
    case 'list_automations':
      return data.summary ? String(data.summary) : 'Here are the current automations.';
    case 'get_inbox_attention':
      return data.summary ? String(data.summary) : 'Here is what needs attention in the inbox.';
    case 'get_pipeline_attention':
      return data.summary ? String(data.summary) : 'Here is what needs attention in the pipeline.';
    case 'search_prospects':
      {
        const found = (data.prospects as unknown[] | undefined)?.length || 0;
        const requested = Number(data.requestedLimit || 0);
        if (requested && found < requested) {
          return `I found ${found} strict verified match(es) out of ${requested}. I did not include weak or off-target candidates.`;
        }
        return `I found ${found} strict verified prospect(s). I selected the best matches so you can quickly remove any bad fit.`;
      }
    case 'find_emails':
      return `I started email enrichment for ${data.contactCount || 0} contact(s). I will keep this thread updated while results come back.`;
    case 'draft_sequence':
    case 'revise_sequence':
      return 'I drafted the outreach sequence. You can edit it directly or ask me to revise it.';
    case 'launch_sequence':
      return `I queued ${data.enrolled || 0} prospect(s) into the sequence.`;
    case 'create_automation':
      return 'I created the recurring automation for this outreach thread.';
    case 'save_prospects':
      return `I saved ${data.saved || 0} prospect(s) to contacts.`;
    case 'parse_outreach_brief':
    case 'plan_search_queries':
      return 'I prepared the outreach brief and search plan.';
  }
}

function artifactAssistantText(artifactPayload: OutreachArtifact) {
  return artifactPayload.summary || fallbackAssistantText('get_workspace_status', artifactPayload);
}

function needsConfirmation(toolName: OutreachAgentTool, body: AgentRuntimeBody) {
  if (READ_TOOLS.has(toolName)) return false;
  if (toolName === 'search_prospects') return false;
  if (body.confirmed) return false;
  if (body.action) return false;
  return true;
}

function summarizeToolInput(body: AgentRuntimeBody) {
  return {
    prospectIds: body.prospectIds || [],
    requestedLimit: typeof body.message === 'string' ? extractRequestedProspectLimit(body.message) : null,
    hasSteps: Array.isArray(body.steps) && body.steps.length > 0,
    sequenceName: body.sequenceName || null,
    dailyLimit: body.dailyLimit || null,
    approvalRequired: body.approvalRequired ?? null,
  };
}

export async function runOutreachAgentGraph(input: AgentRuntimeInput) {
  const { db, workspaceId, userId, sessionId, body, emit } = input;
  let bundle = await getOutreachSessionBundle(db, workspaceId, sessionId);
  if (!bundle.session) throw new Error('Outreach session not found');

  const cleanMessage = typeof body.message === 'string' ? body.message.trim() : '';
  const run = await createOutreachRun(db, {
    workspaceId,
    sessionId,
    userId,
    modelProvider: aiProviderLabel(),
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
    if (!response.ok) throw new Error(data.error || response.statusText);
    return data;
  };

  const emitToolStep = async (
    kind: string,
    title: string,
    detail: string,
    status: 'running' | 'complete' | 'failed' = 'complete',
    metadata?: Record<string, unknown>
  ) => {
    emit('node_start', { kind, title, detail, status });
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

  const runTrackedTool = async <T,>(
    toolName: OutreachAgentTool,
    title: string,
    detail: string,
    execute: () => Promise<T>,
    artifactBuilder?: (output: T) => OutreachArtifact | null
  ) => {
    const permission = TOOL_PERMISSION.get(toolName) || 'read';
    const toolCall = await createOutreachToolCall(db, {
      workspaceId,
      sessionId,
      runId: run?.id || null,
      toolName,
      specialist: TOOL_TO_SPECIALIST[toolName],
      permission,
      status: 'running',
      input: summarizeToolInput(body),
      confirmationRequired: permission !== 'read' && toolName !== 'search_prospects',
    });
    emit('tool_call', {
      id: toolCall?.id || `local-tool-${Date.now()}`,
      tool_name: toolName,
      specialist: TOOL_TO_SPECIALIST[toolName],
      permission,
      status: 'running',
      title,
      detail,
    });

    const event = await emitToolStep(toolName, title, detail, 'running');
    try {
      const output = await execute();
      const outputRecord = output && typeof output === 'object' ? output as Record<string, unknown> : { output };
      await completeToolStep(
        event.id,
        toolName,
        title,
        toolName === 'find_emails' ? 'Email enrichment is running in the background.' : 'Done.',
        'complete',
        outputRecord
      );
      await updateOutreachToolCall(db, {
        workspaceId,
        toolCallId: toolCall?.id || null,
        status: 'complete',
        output: outputRecord,
      });
      emit('tool_result', {
        id: toolCall?.id || null,
        tool_name: toolName,
        status: 'complete',
        output: outputRecord,
      });
      await appendOutreachMessage(db, {
        workspaceId,
        sessionId,
        role: 'tool',
        content: title,
        metadata: { kind: toolName, output },
      });
      const toolArtifact = artifactBuilder?.(output);
      if (toolArtifact) emit('artifact', toolArtifact);
      return { output, artifact: toolArtifact || null };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Tool failed';
      await completeToolStep(event.id, toolName, title, message, 'failed');
      await updateOutreachToolCall(db, {
        workspaceId,
        toolCallId: toolCall?.id || null,
        status: 'failed',
        error: message,
      });
      emit('tool_result', {
        id: toolCall?.id || null,
        tool_name: toolName,
        status: 'failed',
        error: message,
      });
      throw error;
    }
  };

  const routerNode = async (state: AgentStateValue): Promise<AgentStateUpdate> => {
    const toolName = normalizeTool(state.action, state.message, bundle);
    const reason = state.action
      ? 'Using the explicit UI action requested by the user.'
      : toolName === 'answer_directly'
        ? 'This is a product or capability question inside outreach scope.'
        : toolName === 'redirect_off_domain'
          ? 'This is outside the outreach and CRM scope.'
          : toolName === 'get_workspace_status'
            ? 'The request asks for the current workspace status.'
            : `The request matches the ${toolName.replace(/_/g, ' ')} specialist.`;

    const plannerStep = await emitToolStep(
      'agent_router',
      'Routing request',
      'Choosing the specialist and checking tool guardrails.',
      'running'
    );
    await completeToolStep(plannerStep.id, 'agent_router', 'Routing request', reason, 'complete', {
      toolName,
      specialist: TOOL_TO_SPECIALIST[toolName],
    });

    return {
      toolName,
      reason,
      specialist: TOOL_TO_SPECIALIST[toolName],
    };
  };

  const confirmationGateNode = async (state: AgentStateValue): Promise<AgentStateUpdate> => {
    if (!needsConfirmation(state.toolName, body)) {
      return { requiresConfirmation: false };
    }

    const permission = TOOL_PERMISSION.get(state.toolName) || 'write';
    const toolCall = await createOutreachToolCall(db, {
      workspaceId,
      sessionId,
      runId: run?.id || null,
      toolName: state.toolName,
      specialist: state.specialist,
      permission,
      status: 'pending_confirmation',
      input: summarizeToolInput(body),
      confirmationRequired: true,
    });
    const confirmationArtifact = artifact(
      'confirmation_required',
      'Confirmation required',
      {
        toolName: state.toolName,
        specialist: state.specialist,
        toolCallId: toolCall?.id || null,
        action: state.action || state.toolName,
        reason: state.reason,
      },
      `Confirm before I ${state.toolName.replace(/_/g, ' ')}.`
    );
    emit('confirmation_required', confirmationArtifact);
    emit('artifact', confirmationArtifact);
    await updateOutreachRun(db, {
      workspaceId,
      runId: run?.id || null,
      status: 'waiting_confirmation',
      output: { artifact: confirmationArtifact },
    });

    return {
      requiresConfirmation: true,
      artifact: confirmationArtifact,
      responseText: confirmationArtifact.summary || 'Please confirm before I continue.',
    };
  };

  const executeNode = async (state: AgentStateValue): Promise<AgentStateUpdate> => {
    if (state.requiresConfirmation) {
      return {};
    }

    if (state.toolName === 'redirect_off_domain') {
      return {
        toolOutput: { guardrail: 'off_domain_redirect' },
        responseText: fallbackAssistantText('redirect_off_domain', null),
      };
    }

    if (state.toolName === 'answer_directly') {
      const asksModel = /mod[eè]le|model|openai|gpt|propulse/i.test(state.message || '');
      const responseText = asksModel
        ? 'Je suis l’agent d’outreach isimple. L’application utilise OpenAI en priorité, avec un fallback Anthropic si la configuration serveur l’impose. Je peux surtout chercher des prospects, vérifier les réponses, préparer des séquences et gérer les automatisations.'
        : 'Je peux t’aider à chercher des prospects, vérifier les réponses à traiter, revoir la file outbound, préparer une séquence, lancer les contacts approuvés et créer une automatisation récurrente.';
      return {
        toolOutput: { guardrail: 'capability_answer', asksModel },
        responseText,
      };
    }

    if (state.toolName === 'get_workspace_status' || state.toolName === 'list_automations' || state.toolName === 'get_inbox_attention' || state.toolName === 'get_pipeline_attention') {
      const { output, artifact: toolArtifact } = await runTrackedTool(
        state.toolName,
        state.toolName.replace(/_/g, ' '),
        'Reading current workspace data.',
        async () => {
          const result = state.toolName === 'list_automations'
            ? await listAutomationsArtifact(db, workspaceId)
            : state.toolName === 'get_inbox_attention'
              ? await getInboxAttentionArtifact(db, workspaceId, userId)
              : state.toolName === 'get_pipeline_attention'
                ? await getPipelineAttentionArtifact(db, workspaceId)
                : await getWorkspaceStatusArtifact(db, workspaceId, userId);
          return { artifact: result, summary: result.summary };
        },
        (outputValue) => (outputValue as { artifact?: OutreachArtifact }).artifact || null
      );
      const artifactPayload = (output as { artifact?: OutreachArtifact }).artifact || toolArtifact;
      return {
        toolOutput: output,
        artifact: artifactPayload || null,
        responseText: artifactPayload ? artifactAssistantText(artifactPayload) : fallbackAssistantText(state.toolName, output),
      };
    }

    if (state.toolName === 'search_prospects') {
      await emitToolStep('parse_outreach_brief', 'Interpreting target', 'Reading industry, role, geography, size, and exclusions from the request.');
      await emitToolStep('plan_search_queries', 'Planning search', 'Preparing industry-agnostic queries for named people and verifiable sources.');
      await emitToolStep('validate_search_quality', 'Validating candidates', 'Keeping only named people with role, geography, company-type fit, and usable sources.');
      const activePrompt = state.message || bundle.session?.prompt || '';
      const requestedLimit = extractRequestedProspectLimit(activePrompt);
      const { output, artifact: toolArtifact } = await runTrackedTool(
        'search_prospects',
        'Searching prospects',
        'Running Linkup, extracting named people, deduping, and saving the first list.',
        async () => callSessionEndpoint('search', { prompt: activePrompt, limit: requestedLimit }),
        (outputValue) => {
          const data = outputValue && typeof outputValue === 'object' ? outputValue as Record<string, unknown> : {};
          const found = (data.prospects as unknown[] | undefined)?.length || 0;
          const requested = Number(data.requestedLimit || requestedLimit);
          const summary = requested && found < requested
            ? `${found} strict verified match(es) found out of ${requested}.`
            : `${found} strict verified prospect(s) found.`;
          return artifact('prospect_list', 'First prospect list', data, summary);
        }
      );
      return { toolOutput: output, artifact: toolArtifact, responseText: fallbackAssistantText('search_prospects', output) };
    }

    if (state.toolName === 'save_prospects') {
      const { output, artifact: toolArtifact } = await runTrackedTool(
        'save_prospects',
        'Saving prospects',
        'Creating or updating CRM contacts.',
        async () => callSessionEndpoint('save-prospects', {
          prospectIds: body.prospectIds?.length ? body.prospectIds : selectedProspectIds(bundle.prospects),
        }),
        (outputValue) => artifact('pipeline_attention', 'Prospects saved', outputValue && typeof outputValue === 'object' ? outputValue as Record<string, unknown> : {}, 'Selected prospects were saved to contacts.')
      );
      return { toolOutput: output, artifact: toolArtifact, responseText: fallbackAssistantText('save_prospects', output) };
    }

    if (state.toolName === 'find_emails') {
      const { output, artifact: toolArtifact } = await runTrackedTool(
        'find_emails',
        'Finding emails',
        'Starting FullEnrich in the background.',
        async () => callSessionEndpoint('enrich', {
          prospectIds: body.prospectIds?.length ? body.prospectIds : selectedProspectIds(bundle.prospects),
        }),
        (outputValue) => artifact('enrichment_status', 'Email enrichment started', outputValue && typeof outputValue === 'object' ? outputValue as Record<string, unknown> : {}, 'Email enrichment is running in the background.')
      );
      return { toolOutput: output, artifact: toolArtifact, responseText: fallbackAssistantText('find_emails', output) };
    }

    if (state.toolName === 'launch_sequence') {
      const { output, artifact: toolArtifact } = await runTrackedTool(
        'launch_sequence',
        'Launching sequence',
        'Queueing eligible prospects into the sequence.',
        async () => callSessionEndpoint('launch', {
          prospectIds: body.prospectIds?.length ? body.prospectIds : selectedProspectIds(bundle.prospects),
          sequenceName: body.sequenceName,
          steps: body.steps,
        }),
        (outputValue) => artifact('confirmation_required', 'Sequence launched', outputValue && typeof outputValue === 'object' ? outputValue as Record<string, unknown> : {}, 'Eligible prospects were queued.')
      );
      return { toolOutput: output, artifact: toolArtifact, responseText: fallbackAssistantText('launch_sequence', output) };
    }

    if (state.toolName === 'create_automation') {
      const { output, artifact: toolArtifact } = await runTrackedTool(
        'create_automation',
        'Creating automation',
        'Scheduling recurring prospect discovery and review.',
        async () => callSessionEndpoint('automate', {
          dailyLimit: body.dailyLimit || 20,
          approvalRequired: body.approvalRequired ?? true,
        }),
        (outputValue) => artifact('automation_created', 'Automation created', outputValue && typeof outputValue === 'object' ? outputValue as Record<string, unknown> : {}, 'The recurring outreach automation is active.')
      );
      return { toolOutput: output, artifact: toolArtifact, responseText: fallbackAssistantText('create_automation', output) };
    }

    const revisionPrompt = state.toolName === 'revise_sequence' ? body.revisionPrompt : undefined;
    const { output, artifact: toolArtifact } = await runTrackedTool(
      state.toolName,
      revisionPrompt ? 'Revising sequence' : 'Drafting sequence',
      'Writing the first three emails.',
      async () => callSessionEndpoint('sequence', {
        revisionPrompt,
        prospectIds: body.prospectIds?.length ? body.prospectIds : selectedProspectIds(bundle.prospects),
      }),
      (outputValue) => artifact('sequence_draft', revisionPrompt ? 'Sequence revised' : 'Sequence drafted', outputValue && typeof outputValue === 'object' ? outputValue as Record<string, unknown> : {}, 'The sequence draft is ready to review.')
    );
    return { toolOutput: output, artifact: toolArtifact, responseText: fallbackAssistantText(state.toolName, output) };
  };

  const finalResponseNode = async (state: AgentStateValue): Promise<AgentStateUpdate> => {
    const responseText = state.responseText || fallbackAssistantText(state.toolName, state.toolOutput);
    return { responseText };
  };

  const graph = new StateGraph(AgentState)
    .addNode('router', routerNode)
    .addNode('confirmation_gate', confirmationGateNode)
    .addNode('execute_specialist', executeNode)
    .addNode('final_response', finalResponseNode)
    .addEdge(START, 'router')
    .addEdge('router', 'confirmation_gate')
    .addEdge('confirmation_gate', 'execute_specialist')
    .addEdge('execute_specialist', 'final_response')
    .addEdge('final_response', END)
    .compile();

  try {
    const result = await graph.invoke({
      message: cleanMessage,
      action: body.action,
      confirmed: Boolean(body.confirmed),
    });
    const assistantText = result.responseText || fallbackAssistantText(result.toolName, result.toolOutput);
    const assistantMessage = await appendOutreachMessage(db, {
      workspaceId,
      sessionId,
      role: 'assistant',
      content: assistantText,
      metadata: {
        provider: 'langgraph',
        runId: run?.id || null,
        toolName: result.toolName,
        specialist: result.specialist,
        toolOutput: result.toolOutput,
        requiresConfirmation: result.requiresConfirmation,
      },
    });
    emit('message', assistantMessage || {
      id: `local-assistant-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      workspace_id: workspaceId,
      session_id: sessionId,
      role: 'assistant',
      content: assistantText,
      status: 'complete',
      metadata: { provider: 'langgraph', runId: run?.id || null, toolName: result.toolName, persisted: false },
      created_at: new Date().toISOString(),
    });

    await updateOutreachRun(db, {
      workspaceId,
      runId: run?.id || null,
      status: result.requiresConfirmation ? 'waiting_confirmation' : 'complete',
      output: {
        toolName: result.toolName,
        specialist: result.specialist,
        requiresConfirmation: result.requiresConfirmation,
        artifact: result.artifact || null,
      },
    });

    bundle = await getOutreachSessionBundle(db, workspaceId, sessionId);
    emit('bundle', bundle);
    emit('run_status', {
      id: run?.id || null,
      session_id: sessionId,
      status: result.requiresConfirmation ? 'waiting_confirmation' : 'complete',
      provider: 'langgraph',
    });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Agent failed';
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
    throw error;
  }
}
