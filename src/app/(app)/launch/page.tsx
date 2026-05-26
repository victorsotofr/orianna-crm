'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowUp,
  Check,
  ChevronRight,
  ExternalLink,
  Loader2,
  Mail,
  RefreshCw,
  Rocket,
  Save,
  Send,
  Sparkles,
  Trash2,
  WandSparkles,
} from 'lucide-react';
import { toast } from 'sonner';

import { OutreachActivityStrip } from '@/components/outreach/outreach-activity-strip';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { apiFetch } from '@/lib/api';
import { parseOutreachSseChunk } from '@/lib/outreach-agent/stream';
import { useTranslation } from '@/lib/i18n';
import { cn } from '@/lib/utils';

type AgentAction =
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
  | 'launch_sequence'
  | 'create_automation'
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

interface OutreachSession {
  id: string;
  prompt: string;
  structured_brief: Record<string, unknown>;
  status: string;
  error: string | null;
  created_at?: string;
  updated_at?: string;
}

interface ThreadMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
  status: 'running' | 'complete' | 'failed';
  metadata: Record<string, unknown>;
  created_at: string;
}

interface ThreadEvent {
  id: string;
  kind: string;
  title: string;
  detail: string | null;
  status: 'running' | 'complete' | 'failed';
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface AgentArtifact {
  id: string;
  kind: 'status_snapshot' | 'automation_list' | 'inbox_attention' | 'pipeline_attention' | 'prospect_list' | 'sequence_draft' | 'automation_created' | 'enrichment_status' | 'confirmation_required';
  title: string;
  summary?: string;
  data: Record<string, unknown>;
  created_at: string;
}

interface ProspectContact {
  id: string;
  email: string | null;
  email_verified_status: string | null;
  status: string | null;
}

interface Prospect {
  id: string;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  company_domain: string | null;
  job_title: string | null;
  email: string | null;
  email_verified_status: string | null;
  linkedin_url: string | null;
  location: string | null;
  source_url: string | null;
  source_label: string | null;
  confidence: string | null;
  reason: string | null;
  selected: boolean;
  ignored: boolean;
  enrichment_status: string;
  contact?: ProspectContact | null;
}

interface EmailStep {
  subject: string;
  body: string;
  delayDays: number;
}

interface SequenceDraft {
  id: string;
  name: string;
  steps: EmailStep[];
  sequence_id?: string | null;
  status?: string;
}

interface ThreadBundle {
  session: OutreachSession;
  prospects: Prospect[];
  sequenceDraft: SequenceDraft | null;
  messages: ThreadMessage[];
  events: ThreadEvent[];
}

class OutreachStreamError extends Error {
  constructor(message: string, readonly hasStreamedFailure: boolean) {
    super(message);
    this.name = 'OutreachStreamError';
  }
}

function messageClientId(message: ThreadMessage) {
  const value = message.metadata?.clientMessageId;
  return typeof value === 'string' ? value : null;
}

function localMessageSessionId(message: ThreadMessage) {
  const value = message.metadata?.sessionId;
  return typeof value === 'string' ? value : null;
}

function isClientLocalMessage(message: ThreadMessage) {
  const source = message.metadata?.source;
  return typeof source === 'string' && source.startsWith('client_');
}

function createLocalMessage(input: {
  sessionId: string;
  role: ThreadMessage['role'];
  content: string;
  status?: ThreadMessage['status'];
  metadata?: Record<string, unknown>;
}): ThreadMessage {
  const clientMessageId = typeof input.metadata?.clientMessageId === 'string' ? input.metadata.clientMessageId : null;
  return {
    id: `local-${input.role}-${clientMessageId || Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    role: input.role,
    content: input.content,
    status: input.status || 'complete',
    metadata: { ...(input.metadata || {}), sessionId: input.sessionId },
    created_at: new Date().toISOString(),
  };
}

function mergeMessages(current: ThreadMessage[], incoming: ThreadMessage[], preserveCurrent: boolean) {
  const merged = preserveCurrent ? [...current] : [];

  for (const message of incoming) {
    const incomingClientId = messageClientId(message);
    const index = merged.findIndex((item) => item.id === message.id || (incomingClientId && messageClientId(item) === incomingClientId));
    if (index >= 0) merged[index] = message;
    else merged.push(message);
  }

  return merged.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
}

function mergeEvents(current: ThreadEvent[], incoming: ThreadEvent[], preserveCurrent: boolean) {
  const merged = preserveCurrent ? [...current] : [];

  for (const event of incoming) {
    const index = merged.findIndex((item) => item.id === event.id);
    if (index >= 0) merged[index] = event;
    else merged.push(event);
  }

  return merged.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(url, init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || response.statusText);
  return data as T;
}

function prospectName(prospect: Prospect) {
  return [prospect.first_name, prospect.last_name].filter(Boolean).join(' ') || prospect.company_name || 'Prospect';
}

function prospectEmail(prospect: Prospect) {
  return prospect.contact?.email || prospect.email || null;
}

function prospectEmailStatus(prospect: Prospect) {
  return prospect.contact?.email_verified_status || prospect.email_verified_status || prospect.enrichment_status || null;
}

function safeHttpUrl(value: string | null | undefined) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    return url.toString();
  } catch {
    return '';
  }
}

function safeLinkedinUrl(value: string | null | undefined) {
  const url = safeHttpUrl(value);
  if (!url) return '';
  const hostname = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  return hostname === 'linkedin.com' || hostname.endsWith('.linkedin.com') ? url : '';
}

function isUsableEmail(prospect: Prospect) {
  const email = prospectEmail(prospect);
  const status = prospectEmailStatus(prospect);
  return Boolean(email && status !== 'INVALID');
}

function isRunningStatus(status: string | undefined | null) {
  return status === 'searching' || status === 'enriching';
}

export default function LaunchPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const threadId = searchParams.get('thread');
  const [prompt, setPrompt] = useState('');
  const [threadInput, setThreadInput] = useState('');
  const [session, setSession] = useState<OutreachSession | null>(null);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [events, setEvents] = useState<ThreadEvent[]>([]);
  const [artifacts, setArtifacts] = useState<AgentArtifact[]>([]);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sequenceName, setSequenceName] = useState('');
  const [steps, setSteps] = useState<EmailStep[]>([]);
  const [revisionPrompt, setRevisionPrompt] = useState('');
  const [dailyLimit] = useState('20');
  const [approvalRequired] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [agentRunning, setAgentRunning] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const localThreadIdsRef = useRef<Set<string>>(new Set());
  const localMessagesRef = useRef<Map<string, ThreadMessage[]>>(new Map());

  const selectedProspects = useMemo(
    () => prospects.filter((prospect) => selectedIds.has(prospect.id)),
    [prospects, selectedIds]
  );
  const selectedProspectIds = useMemo(() => selectedProspects.map((prospect) => prospect.id), [selectedProspects]);
  const usableEmailCount = selectedProspects.filter(isUsableEmail).length;
  const runningEvents = events.filter((event) => event.status === 'running');
  const needsLook = prospects.filter((prospect) => selectedIds.has(prospect.id) && (!isUsableEmail(prospect) || prospect.confidence === 'low'));
  const readyProspects = prospects.filter((prospect) => selectedIds.has(prospect.id) && isUsableEmail(prospect));
  const showWorkingLayout = Boolean(threadId || session || agentRunning);

  const rememberLocalMessage = useCallback((message: ThreadMessage) => {
    if (!isClientLocalMessage(message)) return;

    const sessionId = localMessageSessionId(message);
    if (!sessionId) return;

    const current = localMessagesRef.current.get(sessionId) || [];
    localMessagesRef.current.set(sessionId, mergeMessages(current, [message], true));
  }, []);

  const applyBundle = useCallback((bundle: ThreadBundle, options?: { preserveCurrent?: boolean }) => {
    const localMessages = bundle.session?.id ? localMessagesRef.current.get(bundle.session.id) || [] : [];
    setSession(bundle.session);
    setProspects(bundle.prospects || []);
    setMessages((current) => mergeMessages(
      options?.preserveCurrent ? current : [],
      [...localMessages, ...(bundle.messages || [])],
      true
    ));
    setEvents((current) => mergeEvents(current, bundle.events || [], Boolean(options?.preserveCurrent)));
    const derivedArtifacts = (bundle.events || [])
      .map((event) => event.metadata?.artifact)
      .filter((value): value is AgentArtifact => Boolean(value && typeof value === 'object' && 'kind' in value && 'id' in value));
    setArtifacts((current) => {
      const merged = [...current];
      for (const item of derivedArtifacts) {
        if (!merged.some((existing) => existing.id === item.id)) merged.push(item);
      }
      return merged.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    });
    setSelectedIds(new Set((bundle.prospects || []).filter((prospect) => prospect.selected && !prospect.ignored).map((prospect) => prospect.id)));
    setSequenceName(bundle.sequenceDraft?.name || '');
    setSteps(bundle.sequenceDraft?.steps || []);
  }, []);

  const loadThread = useCallback(async (id: string, silent = true, preserveCurrent = silent) => {
    if (!silent) setLoadingThread(true);
    try {
      const bundle = await requestJson<ThreadBundle>(`/api/outreach/sessions/${id}`);
      applyBundle(bundle, { preserveCurrent });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t.common.networkError);
    } finally {
      setLoadingThread(false);
    }
  }, [applyBundle, t.common.networkError]);

  useEffect(() => {
    if (!threadId) {
      setSession(null);
      setProspects([]);
      setMessages([]);
      setEvents([]);
      setArtifacts([]);
      setSelectedIds(new Set());
      setSequenceName('');
      setSteps([]);
      return;
    }

    const hasCurrentThreadState = session?.id === threadId || localThreadIdsRef.current.has(threadId);
    if (agentRunning && hasCurrentThreadState) return;

    void loadThread(threadId, false, hasCurrentThreadState);
  }, [agentRunning, loadThread, session?.id, threadId]);

  useEffect(() => {
    const hasRunningWork = agentRunning || runningEvents.length > 0 || isRunningStatus(session?.status);
    if (!threadId || !hasRunningWork) return;

    const interval = window.setInterval(() => {
      void loadThread(threadId, true, true);
    }, 3500);
    return () => window.clearInterval(interval);
  }, [agentRunning, loadThread, runningEvents.length, session?.status, threadId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, events.length, artifacts.length, agentRunning]);

  function upsertEvent(event: ThreadEvent) {
    setEvents((current) => {
      const exists = current.some((item) => item.id === event.id);
      if (exists) return current.map((item) => item.id === event.id ? event : item);
      return [...current, event].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    });
  }

  function appendMessage(message: ThreadMessage) {
    rememberLocalMessage(message);
    setMessages((current) => {
      const incomingClientId = messageClientId(message);
      const existingIndex = current.findIndex((item) => item.id === message.id || (incomingClientId && messageClientId(item) === incomingClientId));
      if (existingIndex >= 0) {
        const next = [...current];
        next[existingIndex] = message;
        return next.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      }
      return [...current, message].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    });
  }

  function appendArtifact(item: AgentArtifact) {
    setArtifacts((current) => {
      if (current.some((existing) => existing.id === item.id)) return current;
      return [...current, item].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    });
  }

  async function consumeAgentStream(response: Response) {
    if (!response.body) return;

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let hasStreamedFailure = false;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const parsed = parseOutreachSseChunk(buffer);
      buffer = parsed.buffer;
      for (const { type, payload } of parsed.events) {
        if (type === 'message') {
          const message = payload as ThreadMessage;
          if (message.role === 'assistant' && message.status === 'failed') hasStreamedFailure = true;
          appendMessage(message);
        }
        if (type === 'event') upsertEvent(payload as ThreadEvent);
        if (type === 'artifact') appendArtifact(payload as AgentArtifact);
        if (type === 'bundle') applyBundle(payload as ThreadBundle, { preserveCurrent: true });
        if (type === 'error') throw new OutreachStreamError(String((payload as { error?: string }).error || t.common.networkError), hasStreamedFailure);
      }
    }
  }

  async function runAgent(sessionId: string, body: { message?: string; action?: AgentAction } & Record<string, unknown>) {
    const cleanMessage = typeof body.message === 'string' ? body.message.trim() : '';
    const clientMessageId = cleanMessage
      ? String(body.clientMessageId || `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
      : undefined;
    if (cleanMessage) {
      appendMessage(createLocalMessage({
        sessionId,
        role: 'user',
        content: cleanMessage,
        metadata: { source: 'client_optimistic', clientMessageId },
      }));
    }

    setAgentRunning(true);
    try {
      const response = await apiFetch(`/api/outreach/sessions/${sessionId}/agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, clientMessageId }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || response.statusText);
      }
      await consumeAgentStream(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : t.common.networkError;
      if (!(error instanceof OutreachStreamError && error.hasStreamedFailure)) {
        appendMessage(createLocalMessage({
          sessionId,
          role: 'assistant',
          content: message,
          status: 'failed',
          metadata: { source: 'client_error' },
        }));
      }
      toast.error(message);
    } finally {
      setAgentRunning(false);
    }
  }

  async function startNewThread(nextPrompt: string) {
    const cleanPrompt = nextPrompt.trim();
    if (!cleanPrompt) {
      toast.error(t.launch.toasts.promptRequired);
      return;
    }

    setPrompt('');
    setMessages([]);
    setEvents([]);
    setArtifacts([]);
    setProspects([]);
    setSelectedIds(new Set());
    setSequenceName('');
    setSteps([]);
    setRevisionPrompt('');
    setAgentRunning(true);
    try {
      const created = await requestJson<{ session: OutreachSession }>('/api/outreach/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: cleanPrompt }),
      });

      localThreadIdsRef.current.add(created.session.id);
      setSession(created.session);
      router.push(`/launch?thread=${created.session.id}`);
      await runAgent(created.session.id, { message: cleanPrompt });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t.common.networkError);
    } finally {
      setAgentRunning(false);
    }
  }

  async function handlePromptSubmit(event: FormEvent) {
    event.preventDefault();
    await startNewThread(prompt);
  }

  async function handleThreadSubmit(event: FormEvent) {
    event.preventDefault();
    const clean = threadInput.trim();
    if (!session || !clean) return;
    setThreadInput('');
    await runAgent(session.id, { message: clean, prospectIds: selectedProspectIds, steps, sequenceName });
  }

  function runAction(action: AgentAction) {
    if (!session) return;
    void runAgent(session.id, {
      action,
      prospectIds: selectedProspectIds,
      steps,
      sequenceName,
      revisionPrompt,
      dailyLimit: Number(dailyLimit) || 20,
      approvalRequired,
    });
    if (action === 'revise_sequence') setRevisionPrompt('');
  }

  function updateStep(index: number, patch: Partial<EmailStep>) {
    setSteps((current) => current.map((step, stepIndex) => stepIndex === index ? { ...step, ...patch } : step));
  }

  return (
    <div className="flex h-[calc(100dvh-1rem)] min-h-0 flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col bg-muted/20 px-3 py-3 lg:px-5">
        <main className={cn(
          'mx-auto flex min-h-0 w-full max-w-[1500px] flex-1 flex-col',
          !showWorkingLayout && 'max-w-3xl justify-center'
        )}>
          <OutreachActivityStrip className={showWorkingLayout ? 'mb-3' : 'mb-5'} />
          {!showWorkingLayout ? (
            <EmptyComposer
              prompt={prompt}
              setPrompt={setPrompt}
              onSubmit={handlePromptSubmit}
              loading={agentRunning}
              onQuickPrompt={(value) => void startNewThread(value)}
              t={t}
            />
          ) : (
            <section className="relative flex min-h-0 flex-1 overflow-hidden rounded-lg border bg-background shadow-xs">
              <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                <ThreadHeader
                  session={session}
                  running={agentRunning || runningEvents.length > 0 || isRunningStatus(session?.status)}
                  loading={loadingThread}
                  onRefresh={() => threadId && void loadThread(threadId, false)}
                  t={t}
                />

                <div className="min-h-0 flex-1 overflow-auto px-4 py-4 sm:px-6">
                  <ThreadTimeline
                    session={session}
                    messages={messages}
                    events={events}
                    artifacts={artifacts}
                    prospects={prospects}
                    selectedIds={selectedIds}
                    setSelectedIds={setSelectedIds}
                    selectedCount={selectedProspects.length}
                    readyCount={readyProspects.length}
                    needsLookCount={needsLook.length}
                    usableEmailCount={usableEmailCount}
                    steps={steps}
                    updateStep={updateStep}
                    agentRunning={agentRunning}
                    onAction={runAction}
                    t={t}
                  />
                  <div ref={bottomRef} />
                </div>

                <form onSubmit={handleThreadSubmit} className="border-t bg-background px-4 py-3 sm:px-6">
                  <div className="flex items-end gap-2 rounded-lg border bg-background px-3 py-2 shadow-xs focus-within:border-foreground/20">
                    <textarea
                      value={threadInput}
                      onChange={(event) => setThreadInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && !event.shiftKey) {
                          event.preventDefault();
                          event.currentTarget.form?.requestSubmit();
                        }
                      }}
                      placeholder={t.launch.thread.replyPlaceholder}
                      rows={1}
                      dir="ltr"
                      className="max-h-36 min-h-10 flex-1 resize-none border-0 bg-transparent py-2 text-sm leading-6 outline-none placeholder:text-muted-foreground/70 [direction:ltr] [unicode-bidi:isolate]"
                    />
                    <Button type="submit" size="icon-sm" className="mb-1 rounded-full" disabled={!threadInput.trim() || agentRunning}>
                      {agentRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
                    </Button>
                  </div>
                </form>
              </div>

            </section>
          )}
        </main>
      </div>
    </div>
  );
}

function EmptyComposer({
  prompt,
  setPrompt,
  onSubmit,
  loading,
  onQuickPrompt,
  t,
}: {
  prompt: string;
  setPrompt: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  loading: boolean;
  onQuickPrompt: (value: string) => void;
  t: ReturnType<typeof useTranslation>['t'];
}) {
  const quickPrompts = [t.launch.examples[0], t.launch.examples[1], t.launch.examples[2]];

  return (
    <section className="mx-auto w-full max-w-3xl px-2">
      <div className="mb-5 text-center">
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full border bg-background text-emerald-700 shadow-xs">
          <Rocket className="h-4 w-4" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight">{t.launch.heading}</h1>
      </div>

      <form onSubmit={onSubmit}>
        <div className="rounded-xl border bg-background shadow-sm transition-shadow focus-within:border-foreground/20 focus-within:shadow-md">
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder={t.launch.promptPlaceholder}
            aria-label={t.launch.promptPlaceholder}
            autoFocus
            dir="ltr"
            spellCheck
            rows={3}
            className="block min-h-[76px] w-full resize-none rounded-xl rounded-b-none border-0 bg-transparent px-4 py-3 text-left text-base leading-6 shadow-none outline-none placeholder:text-left placeholder:text-muted-foreground/70 [direction:ltr] [unicode-bidi:isolate]"
          />
          <div className="flex items-center justify-end px-3 py-2">
            <Button
              type="submit"
              size="icon-sm"
              className="rounded-full"
              disabled={loading || !prompt.trim()}
              aria-label={t.launch.runSearch}
              title={t.launch.runSearch}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </form>

      <div className="mt-3 flex flex-wrap justify-center gap-2">
        {quickPrompts.map((value) => (
          <button
            key={value}
            type="button"
            className="rounded-full border bg-background px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground disabled:opacity-50"
            disabled={loading}
            onClick={() => onQuickPrompt(value)}
          >
            {value}
          </button>
        ))}
      </div>

    </section>
  );
}

function ThreadHeader({
  session,
  running,
  loading,
  onRefresh,
  t,
}: {
  session: OutreachSession | null;
  running: boolean;
  loading: boolean;
  onRefresh: () => void;
  t: ReturnType<typeof useTranslation>['t'];
}) {
  return (
    <header className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3 sm:px-6">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <StatusDot running={running} failed={session?.status === 'failed'} />
          <span>{running ? t.launch.thread.working : session?.status || t.launch.thread.ready}</span>
        </div>
        <h1 className="mt-1 truncate text-base font-semibold">{session?.prompt || t.launch.heading}</h1>
      </div>
      <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        {t.common.refresh}
      </Button>
    </header>
  );
}

function StatusDot({ running, failed }: { running: boolean; failed: boolean }) {
  return (
    <span className={cn(
      'h-2 w-2 rounded-full',
      failed ? 'bg-red-500' : running ? 'animate-pulse bg-emerald-600' : 'bg-muted-foreground/40'
    )} />
  );
}

function ThreadTimeline({
  session,
  messages,
  events,
  artifacts,
  prospects,
  selectedIds,
  setSelectedIds,
  selectedCount,
  readyCount,
  needsLookCount,
  usableEmailCount,
  steps,
  updateStep,
  agentRunning,
  onAction,
  t,
}: {
  session: OutreachSession | null;
  messages: ThreadMessage[];
  events: ThreadEvent[];
  artifacts: AgentArtifact[];
  prospects: Prospect[];
  selectedIds: Set<string>;
  setSelectedIds: (value: Set<string>) => void;
  selectedCount: number;
  readyCount: number;
  needsLookCount: number;
  usableEmailCount: number;
  steps: EmailStep[];
  updateStep: (index: number, patch: Partial<EmailStep>) => void;
  agentRunning: boolean;
  onAction: (action: AgentAction) => void;
  t: ReturnType<typeof useTranslation>['t'];
}) {
  const items = [
    ...messages.map((message) => ({ type: 'message' as const, date: message.created_at, item: message })),
    ...events.map((event) => ({ type: 'event' as const, date: event.created_at, item: event })),
    ...artifacts.map((item) => ({ type: 'artifact' as const, date: item.created_at, item })),
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  if (!items.length && !agentRunning) {
    return (
      <div className="flex min-h-[360px] items-center justify-center text-center text-sm text-muted-foreground">
        {session?.error || t.launch.thread.noMessages}
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      {items.map((entry) => entry.type === 'message' ? (
        <MessageBubble key={`message-${entry.item.id}`} message={entry.item} t={t} />
      ) : entry.type === 'event' ? (
        <ToolEventCard key={`event-${entry.item.id}`} event={entry.item} />
      ) : (
        <ArtifactCard
          key={`artifact-${entry.item.id}`}
          artifact={entry.item}
          prospects={prospects}
          selectedIds={selectedIds}
          setSelectedIds={setSelectedIds}
          selectedCount={selectedCount}
          readyCount={readyCount}
          needsLookCount={needsLookCount}
          usableEmailCount={usableEmailCount}
          steps={steps}
          updateStep={updateStep}
          agentRunning={agentRunning}
          onAction={onAction}
          t={t}
        />
      ))}
      {agentRunning && (
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-background text-emerald-700 shadow-xs">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
          <div className="rounded-lg bg-muted/40 px-3 py-2 text-sm text-muted-foreground">{t.launch.chat.thinking}</div>
        </div>
      )}
    </div>
  );
}

function MessageBubble({ message, t }: { message: ThreadMessage; t: ReturnType<typeof useTranslation>['t'] }) {
  if (message.role === 'tool' || message.role === 'system') return null;
  const isUser = message.role === 'user';

  return (
    <div className={cn('flex items-start gap-3', isUser && 'justify-end')}>
      {!isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-background text-emerald-700 shadow-xs">
          <Sparkles className="h-4 w-4" />
        </div>
      )}
      <div className={cn(
        'max-w-[82%] rounded-lg px-4 py-3 text-sm leading-6 shadow-xs ring-1 ring-border',
        isUser ? 'bg-background' : message.status === 'failed' ? 'bg-red-50 text-red-700 ring-red-200' : 'bg-muted/35'
      )}>
        {!isUser && <div className="mb-1 text-xs font-medium text-muted-foreground">{t.launch.chat.assistant}</div>}
        <p className="whitespace-pre-line">{message.content}</p>
      </div>
    </div>
  );
}

function ToolEventCard({ event }: { event: ThreadEvent }) {
  const icon = event.status === 'running'
    ? <Loader2 className="h-4 w-4 animate-spin" />
    : event.status === 'failed'
      ? <Trash2 className="h-4 w-4" />
      : <Check className="h-4 w-4" />;

  return (
    <div className="flex items-start gap-3">
      <div className={cn(
        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-background shadow-xs',
        event.status === 'failed' ? 'text-red-600' : 'text-emerald-700'
      )}>
        {icon}
      </div>
      <div className="min-w-0 rounded-lg border bg-background px-3 py-2 text-sm shadow-xs">
        <div className="flex items-center gap-2">
          <span className="font-medium">{event.title}</span>
          <Badge variant="outline" className="h-5 text-[11px]">{event.status}</Badge>
        </div>
        {event.detail && <p className="mt-1 text-xs text-muted-foreground">{event.detail}</p>}
      </div>
    </div>
  );
}

function ArtifactCard({
  artifact,
  prospects: currentProspects,
  selectedIds,
  setSelectedIds,
  selectedCount,
  readyCount,
  needsLookCount,
  usableEmailCount,
  steps,
  updateStep,
  agentRunning,
  onAction,
  t,
}: {
  artifact: AgentArtifact;
  prospects: Prospect[];
  selectedIds: Set<string>;
  setSelectedIds: (value: Set<string>) => void;
  selectedCount: number;
  readyCount: number;
  needsLookCount: number;
  usableEmailCount: number;
  steps: EmailStep[];
  updateStep: (index: number, patch: Partial<EmailStep>) => void;
  agentRunning: boolean;
  onAction: (action: AgentAction) => void;
  t: ReturnType<typeof useTranslation>['t'];
}) {
  const data = artifact.data || {};
  const automations = Array.isArray(data.automations) ? data.automations as Array<Record<string, unknown>> : [];
  const threads = Array.isArray(data.threads) ? data.threads as Array<Record<string, unknown>> : [];
  const artifactProspects = Array.isArray(data.prospects) ? data.prospects as Prospect[] : [];
  const prospects = artifact.kind === 'prospect_list' && currentProspects.length ? currentProspects : artifactProspects;
  const draft = data.sequenceDraft && typeof data.sequenceDraft === 'object'
    ? data.sequenceDraft as Partial<SequenceDraft>
    : data.draft && typeof data.draft === 'object'
      ? data.draft as Partial<SequenceDraft>
      : null;
  const sequenceSteps = steps.length ? steps : Array.isArray(draft?.steps) ? draft.steps as EmailStep[] : [];
  const isPipeline = artifact.kind === 'pipeline_attention';
  const confirmationAction = typeof data.action === 'string'
    ? data.action as AgentAction
    : typeof data.toolName === 'string'
      ? data.toolName as AgentAction
      : null;

  return (
    <div className="ml-11 rounded-lg border bg-background p-3 shadow-xs">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold">{artifact.title}</div>
          {artifact.summary && <p className="mt-1 text-sm text-muted-foreground">{artifact.summary}</p>}
        </div>
        <Badge variant="outline" className="shrink-0">{artifact.kind.replace(/_/g, ' ')}</Badge>
      </div>

      {artifact.kind === 'status_snapshot' && (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Metric label={t.launch.artifacts.running} value={Number(data.runningTasks || 0)} />
          <Metric label={t.launch.artifacts.replies} value={Number(data.unreadReplies || 0)} />
          <Metric label={t.launch.artifacts.review} value={Number(data.pendingReview || 0)} />
          <Metric label={t.launch.artifacts.automations} value={Number(data.activeAutomations || 0)} />
        </div>
      )}

      {artifact.kind === 'confirmation_required' && confirmationAction && (
        <div className="mt-3 flex flex-col gap-2 rounded-md border bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-muted-foreground">
            {String(data.reason || t.launch.artifacts.confirmationRequired)}
          </div>
          <Button size="sm" onClick={() => onAction(confirmationAction)}>
            <Check className="h-4 w-4" />
            {t.launch.artifacts.confirm}
          </Button>
        </div>
      )}

      {isPipeline && (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Metric label={t.outbound.filters.pending} value={Number(data.pendingReview || 0)} />
            <Metric label={t.outbound.emailUnknown} value={Number(data.missingEmail || 0)} />
            <Metric label={t.outbound.filters.approved} value={Number(data.approved || 0)} />
            <Metric label={t.outbound.metrics.active} value={Number(data.activeEnrollments || 0)} />
          </div>
          {prospects.length > 0 && (
            <div className="mt-3 divide-y rounded-md border">
              {prospects.map((prospect) => {
                const name = [prospect.first_name, prospect.last_name].filter(Boolean).join(' ') || String(prospect.email || prospect.company_name || 'Prospect');
                const subtitle = [prospect.job_title, prospect.company_name, prospect.location].filter(Boolean).join(' · ');
                return (
                  <Link key={String(prospect.id)} href={`/contacts/${String(prospect.id)}`} className="flex items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-muted/45">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{name}</div>
                      {subtitle && <div className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</div>}
                    </div>
                    <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                      <span>{prospect.email ? String(prospect.email) : t.outbound.noEmail}</span>
                      <ChevronRight className="h-4 w-4" />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </>
      )}

      {automations.length > 0 && (
        <div className="mt-3 divide-y rounded-md border">
          {automations.slice(0, 5).map((automation) => (
            <div key={String(automation.id)} className="px-3 py-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium">{String(automation.name || t.launch.thread.automations)}</span>
                <Badge variant={automation.status === 'active' ? 'default' : 'outline'}>{String(automation.status || '')}</Badge>
              </div>
              <p className="mt-1 truncate text-xs text-muted-foreground">{String(automation.prompt || '')}</p>
            </div>
          ))}
        </div>
      )}

      {threads.length > 0 && (
        <div className="mt-3 divide-y rounded-md border">
          {threads.slice(0, 5).map((thread) => (
            <Link key={String(thread.id)} href={`/conversations?contactId=${String(thread.contact_id || '')}`} className="block px-3 py-2 text-sm hover:bg-muted/50">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium">{String(thread.subject || t.launch.thread.inbox)}</span>
                <span className="text-xs text-muted-foreground">{t.launch.artifacts.unread(Number(thread.unread_count || 0))}</span>
              </div>
              <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{String(thread.snippet || '')}</p>
            </Link>
          ))}
        </div>
      )}

      {artifact.kind === 'prospect_list' && (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-3 gap-2 text-center">
            <Metric label={t.launch.prospects.selected(selectedCount)} value={selectedCount} />
            <Metric label={t.launch.launchBox.verified} value={usableEmailCount} />
            <Metric label={t.launch.thread.needsLook} value={needsLookCount} />
          </div>
          <div className="divide-y rounded-md border">
            {prospects.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">{t.launch.prospects.empty}</div>
            ) : prospects.map((prospect) => (
              <ProspectRow
                key={prospect.id}
                prospect={prospect}
                selected={selectedIds.has(prospect.id)}
                onSelectedChange={(selected) => {
                  const next = new Set(selectedIds);
                  if (selected) next.add(prospect.id);
                  else next.delete(prospect.id);
                  setSelectedIds(next);
                }}
                t={t}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => onAction('enrich')} disabled={!selectedCount || agentRunning}>
              {agentRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              {t.launch.actions.enrich}
            </Button>
            <Button size="sm" variant="outline" onClick={() => onAction('draft_sequence')} disabled={!selectedCount || agentRunning}>
              <WandSparkles className="h-4 w-4" />
              {t.launch.actions.draftSequence}
            </Button>
            <Button size="sm" variant="outline" onClick={() => onAction('save')} disabled={!selectedCount || agentRunning}>
              <Save className="h-4 w-4" />
              {t.launch.actions.save}
            </Button>
          </div>
          {readyCount > 0 && <p className="text-xs text-muted-foreground">{t.launch.thread.reviewSummary(selectedCount, readyCount, needsLookCount)}</p>}
        </div>
      )}

      {artifact.kind === 'sequence_draft' && (
        <div className="mt-3 space-y-3">
          {draft?.name && <div className="text-sm font-medium">{draft.name}</div>}
          {sequenceSteps.map((step, index) => (
            <details key={index} className="rounded-md border bg-muted/20 p-3" open={index === 0}>
              <summary className="cursor-pointer text-sm font-medium">
                Email {index + 1} · {step.delayDays}d
              </summary>
              <div className="mt-3 space-y-2">
                <Input value={step.subject} onChange={(event) => updateStep(index, { subject: event.target.value })} className="h-9" />
                <Textarea value={step.body} onChange={(event) => updateStep(index, { body: event.target.value })} className="min-h-28 text-sm" />
                <Input type="number" min={0} value={step.delayDays} onChange={(event) => updateStep(index, { delayDays: Number(event.target.value) })} className="h-9 w-24" />
              </div>
            </details>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => onAction('revise_sequence')} disabled={agentRunning}>
              <WandSparkles className="h-4 w-4" />
              {t.launch.actions.revise}
            </Button>
            <Button size="sm" onClick={() => onAction('launch')} disabled={!selectedCount || !sequenceSteps.length || agentRunning}>
              <Send className="h-4 w-4" />
              {t.launch.actions.launch}
            </Button>
            <Button size="sm" variant="outline" onClick={() => onAction('automate')} disabled={!sequenceSteps.length || agentRunning}>
              <Sparkles className="h-4 w-4" />
              {t.launch.actions.automate}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ProspectRow({
  prospect,
  selected,
  onSelectedChange,
  t,
}: {
  prospect: Prospect;
  selected: boolean;
  onSelectedChange: (value: boolean) => void;
  t: ReturnType<typeof useTranslation>['t'];
}) {
  const email = prospectEmail(prospect);
  const emailStatus = prospectEmailStatus(prospect);
  const linkedinUrl = safeLinkedinUrl(prospect.linkedin_url);
  const sourceUrl = safeHttpUrl(prospect.source_url);

  return (
    <div className={cn('grid gap-2 px-3 py-3 text-sm', !selected && 'opacity-50')}>
      <div className="flex min-w-0 items-start gap-2">
        <Checkbox checked={selected} onCheckedChange={(value) => onSelectedChange(value === true)} className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate font-medium">{prospectName(prospect)}</span>
            <Badge variant={isUsableEmail(prospect) ? 'default' : 'outline'} className="h-5 text-[11px]">
              {email ? t.launch.prospects.emailFound : emailStatus === 'requested' ? t.launch.prospects.emailRequested : t.launch.prospects.noEmail}
            </Badge>
          </div>
          <div className="mt-1 truncate text-xs text-muted-foreground">
            {[prospect.job_title, prospect.company_name, prospect.location].filter(Boolean).join(' · ')}
          </div>
          {prospect.reason && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{prospect.reason}</p>}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 pl-7">
        {email && <span className="max-w-[180px] truncate text-xs text-muted-foreground">{email}</span>}
        {linkedinUrl && (
          <Button variant="outline" size="sm" asChild>
            <a href={linkedinUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="h-3.5 w-3.5" />
              {t.launch.actions.openLinkedin}
            </a>
          </Button>
        )}
        {sourceUrl && (
          <Button variant="ghost" size="sm" asChild>
            <a href={sourceUrl} target="_blank" rel="noreferrer">
              {t.launch.actions.openSource}
              <ChevronRight className="h-3.5 w-3.5" />
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-muted/20 px-2 py-3">
      <div className="font-mono text-xl font-semibold tabular-nums">{value}</div>
      <div className="mt-1 truncate text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}
