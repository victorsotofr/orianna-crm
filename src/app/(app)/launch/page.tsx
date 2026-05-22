'use client';

import { FormEvent, useMemo, useState } from 'react';
import {
  ArrowUp,
  CalendarClock,
  Check,
  ExternalLink,
  Loader2,
  Mail,
  RefreshCw,
  Rocket,
  Save,
  Send,
  Sparkles,
  Users,
  WandSparkles,
} from 'lucide-react';
import { toast } from 'sonner';

import { SiteHeader } from '@/components/site-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { apiFetch } from '@/lib/api';
import { useTranslation } from '@/lib/i18n';
import { cn } from '@/lib/utils';

type Stage = 'search' | 'enrich' | 'sequence' | 'launch' | 'automate';

interface OutreachSession {
  id: string;
  prompt: string;
  structured_brief: Record<string, unknown>;
  status: string;
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
}

interface LaunchResult {
  sequenceId: string;
  sequenceName: string;
  enrolled: number;
  skipped: Array<{ prospectId: string; reason: string }>;
  nextSendAt: string;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(url, init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || response.statusText);
  }
  return data as T;
}

function prospectName(prospect: Prospect) {
  return [prospect.first_name, prospect.last_name].filter(Boolean).join(' ') || prospect.company_name || 'Prospect';
}

function prospectEmail(prospect: Prospect) {
  return prospect.contact?.email || prospect.email || null;
}

function prospectEmailStatus(prospect: Prospect) {
  return prospect.contact?.email_verified_status || prospect.enrichment_status || null;
}

function isUsableEmail(prospect: Prospect) {
  const email = prospectEmail(prospect);
  const status = prospectEmailStatus(prospect);
  return Boolean(email && status !== 'INVALID');
}

function briefValue(brief: Record<string, unknown>, key: string, fallback = '—') {
  const value = brief[key];
  return typeof value === 'string' && value.trim() ? value : fallback;
}

export default function LaunchPage() {
  const { t } = useTranslation();
  const [prompt, setPrompt] = useState('');
  const [session, setSession] = useState<OutreachSession | null>(null);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sequenceName, setSequenceName] = useState('');
  const [steps, setSteps] = useState<EmailStep[]>([]);
  const [revisionPrompt, setRevisionPrompt] = useState('');
  const [stage, setStage] = useState<Stage>('search');
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [sequencing, setSequencing] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [automating, setAutomating] = useState(false);
  const [launchResult, setLaunchResult] = useState<LaunchResult | null>(null);
  const [automationCreated, setAutomationCreated] = useState(false);
  const [dailyLimit, setDailyLimit] = useState('20');
  const [approvalRequired, setApprovalRequired] = useState(true);

  const selectedProspects = useMemo(
    () => prospects.filter((prospect) => selectedIds.has(prospect.id)),
    [prospects, selectedIds]
  );
  const usableEmailCount = selectedProspects.filter(isUsableEmail).length;
  const selectedProspectIds = useMemo(() => selectedProspects.map((prospect) => prospect.id), [selectedProspects]);
  const showWorkingLayout = Boolean(session) || searching;
  const showProspects = Boolean(session && prospects.length > 0);
  const showSequenceEditor = Boolean(session && (steps.length > 0 || stage === 'sequence' || stage === 'launch' || stage === 'automate'));
  const showSidebar = Boolean(session && (showProspects || showSequenceEditor || launchResult));

  async function loadSession(sessionId: string) {
    const data = await requestJson<{
      session: OutreachSession;
      prospects: Prospect[];
      sequenceDraft: SequenceDraft | null;
    }>(`/api/outreach/sessions/${sessionId}`);

    setSession(data.session);
    setProspects(data.prospects || []);
    if (data.sequenceDraft) {
      setSequenceName(data.sequenceDraft.name);
      setSteps(data.sequenceDraft.steps || []);
    }

    setSelectedIds((current) => {
      if (current.size > 0) return current;
      return new Set((data.prospects || []).filter((prospect) => prospect.selected && !prospect.ignored).map((prospect) => prospect.id));
    });
  }

  async function handlePromptSubmit(event: FormEvent) {
    event.preventDefault();
    if (!prompt.trim()) {
      toast.error(t.launch.toasts.promptRequired);
      return;
    }

    setSearching(true);
    setLaunchResult(null);
    setAutomationCreated(false);
    setStage('search');

    try {
      const created = await requestJson<{ session: OutreachSession }>('/api/outreach/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });

      setSession(created.session);
      setProspects([]);
      setSelectedIds(new Set());
      setSteps([]);
      setSequenceName('');

      const searched = await requestJson<{ prospects: Prospect[] }>(`/api/outreach/sessions/${created.session.id}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 20 }),
      });

      setProspects(searched.prospects || []);
      setSelectedIds(new Set((searched.prospects || []).map((prospect) => prospect.id)));
      toast.success(t.launch.toasts.searchComplete(searched.prospects?.length || 0));
      setStage('enrich');
      await loadSession(created.session.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t.common.networkError);
    } finally {
      setSearching(false);
    }
  }

  async function handleRefresh() {
    if (!session) return;
    try {
      await loadSession(session.id);
      toast.success(t.common.refresh);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t.common.networkError);
    }
  }

  async function handleSaveProspects() {
    if (!session || selectedProspectIds.length === 0) return;
    setSaving(true);
    try {
      const data = await requestJson<{ saved: number }>(`/api/outreach/sessions/${session.id}/save-prospects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prospectIds: selectedProspectIds }),
      });
      toast.success(t.launch.toasts.saved(data.saved));
      await loadSession(session.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t.common.saveError);
    } finally {
      setSaving(false);
    }
  }

  async function handleEnrich() {
    if (!session || selectedProspectIds.length === 0) return;
    setEnriching(true);
    try {
      const data = await requestJson<{ contactCount: number }>(`/api/outreach/sessions/${session.id}/enrich`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prospectIds: selectedProspectIds }),
      });
      toast.success(t.launch.toasts.enrichStarted(data.contactCount));
      setStage('sequence');
      await loadSession(session.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t.common.networkError);
    } finally {
      setEnriching(false);
    }
  }

  async function handleSequence(revision?: string): Promise<EmailStep[]> {
    if (!session) return steps;
    setSequencing(true);
    try {
      const data = await requestJson<{ sequenceDraft: SequenceDraft }>(`/api/outreach/sessions/${session.id}/sequence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          steps,
          name: sequenceName,
          revisionPrompt: revision,
          prospectIds: selectedProspectIds,
        }),
      });
      setSequenceName(data.sequenceDraft.name);
      setSteps(data.sequenceDraft.steps || []);
      setStage('launch');
      setRevisionPrompt('');
      toast.success(t.launch.toasts.sequenceReady);
      return data.sequenceDraft.steps || [];
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t.common.networkError);
      return steps;
    } finally {
      setSequencing(false);
    }
  }

  async function handleLaunch() {
    if (!session || selectedProspectIds.length === 0) return;
    setLaunching(true);
    try {
      const launchSteps = steps.length ? steps : await handleSequence();
      const data = await requestJson<LaunchResult>(`/api/outreach/sessions/${session.id}/launch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prospectIds: selectedProspectIds,
          steps: launchSteps,
          sequenceName,
        }),
      });
      setLaunchResult(data);
      setStage('automate');
      toast.success(t.launch.toasts.launched(data.enrolled));
      await loadSession(session.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t.common.networkError);
    } finally {
      setLaunching(false);
    }
  }

  async function handleAutomate() {
    if (!session || !launchResult?.sequenceId) return;
    setAutomating(true);
    try {
      await requestJson(`/api/outreach/sessions/${session.id}/automate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sequenceId: launchResult.sequenceId,
          dailyLimit: Number(dailyLimit),
          approvalRequired,
          name: launchResult.sequenceName,
        }),
      });
      setAutomationCreated(true);
      toast.success(t.launch.toasts.automated);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t.common.networkError);
    } finally {
      setAutomating(false);
    }
  }

  function updateStep(index: number, patch: Partial<EmailStep>) {
    setSteps((current) => current.map((step, stepIndex) => stepIndex === index ? { ...step, ...patch } : step));
  }

  return (
    <>
      <SiteHeader title={t.launch.title} />
      <div className="page-container">
        <div className="page-content bg-muted/20">
          <main className={cn(
            'mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4',
            !showWorkingLayout && 'max-w-3xl justify-center'
          )}>
            {!showWorkingLayout ? (
              <ChatStart />
            ) : (
              <>
                <ChatThread />
                <div className={cn(
                  'grid min-h-0 flex-1 gap-4',
                  showSidebar && 'xl:grid-cols-[minmax(0,1fr)_360px]'
                )}>
                  <div className="flex min-w-0 flex-col gap-4">
                    <WorkflowRail active={stage} />

                    {searching && prospects.length === 0 && <SearchSkeleton />}

                    {showProspects && (
                      <ProspectList
                        prospects={prospects}
                        selectedIds={selectedIds}
                        onSelect={(id, checked) => {
                          setSelectedIds((current) => {
                            const next = new Set(current);
                            if (checked) next.add(id);
                            else next.delete(id);
                            return next;
                          });
                        }}
                        onSelectAll={() => setSelectedIds(new Set(prospects.map((prospect) => prospect.id)))}
                        onClear={() => setSelectedIds(new Set())}
                      />
                    )}

                    {showSequenceEditor && (
                      <SequenceEditor
                        name={sequenceName}
                        setName={setSequenceName}
                        steps={steps}
                        updateStep={updateStep}
                        revisionPrompt={revisionPrompt}
                        setRevisionPrompt={setRevisionPrompt}
                        onGenerate={() => void handleSequence()}
                        onRevise={() => void handleSequence(revisionPrompt)}
                        generating={sequencing}
                      />
                    )}
                  </div>

                  {showSidebar && (
                    <aside className="flex min-w-0 flex-col gap-4">
                      <BriefPanel session={session} />

                      {showProspects && <LaunchPanel />}

                      {launchResult && (
                        <section className="rounded-lg border bg-background p-4 shadow-xs">
                          <div className="flex items-start gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
                              <CalendarClock className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                              <h2 className="text-sm font-semibold">{t.launch.automation.title}</h2>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {launchResult.sequenceName} · {t.launch.launchBox.next} {new Date(launchResult.nextSendAt).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                          <div className="mt-4 grid gap-3">
                            <div className="space-y-1.5">
                              <Label className="text-xs">{t.launch.automation.dailyLimit}</Label>
                              <Input type="number" min={1} max={100} value={dailyLimit} onChange={(event) => setDailyLimit(event.target.value)} className="h-9" />
                            </div>
                            <div className="flex items-center justify-between rounded-md border px-3 py-2">
                              <Label className="text-xs">{t.launch.automation.approval}</Label>
                              <Switch checked={approvalRequired} onCheckedChange={setApprovalRequired} />
                            </div>
                            <Button size="sm" onClick={handleAutomate} disabled={automating || automationCreated}>
                              {automating ? <Loader2 className="h-4 w-4 animate-spin" /> : automationCreated ? <Check className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
                              {automationCreated ? t.launch.automation.created : t.launch.actions.automate}
                            </Button>
                          </div>
                        </section>
                      )}
                    </aside>
                  )}
                </div>
              </>
            )}
          </main>
        </div>
      </div>
    </>
  );

  function ChatStart() {
    return (
      <section className="mx-auto w-full max-w-3xl px-2">
        <div className="mb-5 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full border bg-background text-emerald-700 shadow-xs">
            <Rocket className="h-4 w-4" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">{t.launch.heading}</h1>
        </div>

        <form onSubmit={handlePromptSubmit} className="flex flex-col gap-3">
          <div className="rounded-[28px] border bg-background p-2 shadow-lg shadow-black/5 transition-shadow focus-within:shadow-xl focus-within:shadow-black/10">
            <Textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder={t.launch.promptPlaceholder}
              className="min-h-24 resize-none border-0 bg-transparent px-4 py-3 text-base shadow-none focus-visible:ring-0"
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <div className="flex items-center justify-end px-2 pb-1">
              <Button
                type="submit"
                size="icon-sm"
                className="rounded-full"
                disabled={searching || !prompt.trim()}
                aria-label={t.launch.runSearch}
                title={t.launch.runSearch}
              >
                {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap justify-center gap-2 px-1">
            {t.launch.examples.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => setPrompt(example)}
                className="rounded-full border bg-background/80 px-3 py-1.5 text-xs text-muted-foreground shadow-xs transition-colors hover:bg-background hover:text-foreground"
              >
                {example}
              </button>
            ))}
          </div>
        </form>
      </section>
    );
  }

  function ChatThread() {
    const userPrompt = session?.prompt || prompt;
    const assistantText = searching && prospects.length === 0
      ? t.launch.chat.thinking
      : t.launch.chat.ready(prospects.length);

    return (
      <section className="mx-auto w-full max-w-4xl px-1 py-2">
        <div className="flex justify-end">
          <div className="max-w-[82%] rounded-[24px] bg-background px-4 py-3 text-sm leading-relaxed shadow-xs ring-1 ring-border">
            {userPrompt}
          </div>
        </div>
        <div className="mt-4 flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-background text-emerald-700 shadow-xs">
            {searching && prospects.length === 0 ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          </div>
          <div className="max-w-3xl py-1 text-sm leading-relaxed">
            <div className="mb-1 text-xs font-medium text-muted-foreground">{t.launch.chat.assistant}</div>
            <p>{assistantText}</p>
          </div>
        </div>
      </section>
    );
  }

  function LaunchPanel() {
    return (
      <section className="rounded-lg border bg-background p-4 shadow-xs">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">{t.launch.launchBox.title}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{t.launch.launchBox.saveOnly}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <Metric label={t.launch.prospects.selected(selectedProspects.length)} value={selectedProspects.length} />
          <Metric label={t.launch.launchBox.verified} value={usableEmailCount} />
          <Metric label={t.launch.launchBox.skipped} value={launchResult?.skipped.length || 0} />
        </div>

        <div className="mt-4 grid gap-2">
          <Button variant="outline" size="sm" onClick={handleSaveProspects} disabled={selectedProspects.length === 0 || saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {t.launch.actions.save}
          </Button>
          <Button variant="outline" size="sm" onClick={handleEnrich} disabled={selectedProspects.length === 0 || enriching}>
            {enriching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
            {t.launch.actions.enrich}
          </Button>
          <Button variant="outline" size="sm" onClick={() => void handleSequence()} disabled={selectedProspects.length === 0 || sequencing}>
            {sequencing ? <Loader2 className="h-4 w-4 animate-spin" /> : <WandSparkles className="h-4 w-4" />}
            {t.launch.actions.draftSequence}
          </Button>
          <Button size="sm" onClick={handleLaunch} disabled={selectedProspects.length === 0 || launching}>
            {launching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {t.launch.actions.launch}
          </Button>
        </div>
      </section>
    );
  }

  function WorkflowRail({ active }: { active: Stage }) {
    const stages: Stage[] = ['search', 'enrich', 'sequence', 'launch', 'automate'];
    return (
      <div className="flex gap-2 overflow-x-auto">
        {stages.map((item) => (
          <div
            key={item}
            className={cn(
              'flex h-9 shrink-0 items-center rounded-full border px-3 text-sm font-medium',
              active === item ? 'border-foreground bg-foreground text-background' : 'bg-background text-muted-foreground'
            )}
          >
            {t.launch.stages[item]}
          </div>
        ))}
      </div>
    );
  }

  function ProspectList({
    prospects,
    selectedIds,
    onSelect,
    onSelectAll,
    onClear,
  }: {
    prospects: Prospect[];
    selectedIds: Set<string>;
    onSelect: (id: string, checked: boolean) => void;
    onSelectAll: () => void;
    onClear: () => void;
  }) {
    return (
      <section className="min-h-[320px] overflow-hidden rounded-lg border bg-background shadow-xs">
        <div className="flex flex-col gap-3 border-b px-4 py-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">{t.launch.prospects.title}</h2>
            <Badge variant="outline">{t.launch.prospects.selected(selectedIds.size)}</Badge>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onSelectAll} disabled={prospects.length === 0}>{t.launch.actions.selectAll}</Button>
            <Button variant="ghost" size="sm" onClick={onClear} disabled={selectedIds.size === 0}>{t.launch.actions.clear}</Button>
          </div>
        </div>

        {prospects.length === 0 ? (
          <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
            {t.launch.prospects.empty}
          </div>
        ) : (
          <div className="divide-y">
            {prospects.map((prospect) => {
              const email = prospectEmail(prospect);
              const emailStatus = prospectEmailStatus(prospect);
              return (
                <div key={prospect.id} className="grid gap-3 px-4 py-3 transition-colors hover:bg-muted/40 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:items-center">
                  <Checkbox checked={selectedIds.has(prospect.id)} onCheckedChange={(value) => onSelect(prospect.id, value === true)} />
                  <div className="min-w-0">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-semibold">{prospectName(prospect)}</span>
                      <Badge variant={isUsableEmail(prospect) ? 'default' : 'outline'} className="h-5">
                        {email ? t.launch.prospects.emailFound : emailStatus === 'requested' ? t.launch.prospects.emailRequested : t.launch.prospects.noEmail}
                      </Badge>
                      {prospect.confidence && <span className="text-xs text-muted-foreground">{t.launch.prospects.confidence}: {prospect.confidence}</span>}
                    </div>
                    <div className="mt-1 truncate text-sm text-muted-foreground">
                      {[prospect.job_title, prospect.company_name, prospect.location].filter(Boolean).join(' · ')}
                    </div>
                    {prospect.reason && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{prospect.reason}</p>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                    {email && <span className="max-w-[220px] truncate text-xs text-muted-foreground">{email}</span>}
                    {prospect.linkedin_url && (
                      <Button variant="outline" size="sm" asChild>
                        <a href={prospect.linkedin_url} target="_blank" rel="noreferrer">
                          <ExternalLink className="h-3.5 w-3.5" />
                          {t.launch.actions.openLinkedin}
                        </a>
                      </Button>
                    )}
                    {prospect.source_url && (
                      <Button variant="ghost" size="sm" asChild>
                        <a href={prospect.source_url} target="_blank" rel="noreferrer">
                          <ExternalLink className="h-3.5 w-3.5" />
                          {t.launch.actions.openSource}
                        </a>
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    );
  }

  function SequenceEditor({
    name,
    setName,
    steps,
    updateStep,
    revisionPrompt,
    setRevisionPrompt,
    onGenerate,
    onRevise,
    generating,
  }: {
    name: string;
    setName: (value: string) => void;
    steps: EmailStep[];
    updateStep: (index: number, patch: Partial<EmailStep>) => void;
    revisionPrompt: string;
    setRevisionPrompt: (value: string) => void;
    onGenerate: () => void;
    onRevise: () => void;
    generating: boolean;
  }) {
    return (
      <section className="rounded-lg border bg-background p-4 shadow-xs">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-sm font-semibold">{t.launch.sequence.title}</h2>
            <div className="mt-2 max-w-sm">
              <Label className="text-xs">{t.launch.sequence.name}</Label>
              <Input value={name} onChange={(event) => setName(event.target.value)} className="mt-1 h-9" />
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={revisionPrompt}
              onChange={(event) => setRevisionPrompt(event.target.value)}
              placeholder={t.launch.sequence.revisionPlaceholder}
              className="h-9 sm:w-80"
            />
            <Button variant="outline" size="sm" onClick={onRevise} disabled={generating || !revisionPrompt.trim()}>
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {t.launch.actions.revise}
            </Button>
            <Button size="sm" onClick={onGenerate} disabled={generating}>
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <WandSparkles className="h-4 w-4" />}
              {t.launch.actions.draftSequence}
            </Button>
          </div>
        </div>

        {steps.length > 0 && (
          <div className="mt-4 grid gap-3 xl:grid-cols-3">
            {steps.map((step, index) => (
              <div key={index} className="rounded-lg border bg-muted/20 p-3">
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-sm font-medium">Email {index + 1}</div>
                  <Badge variant="outline">{t.launch.sequence.delayDays(step.delayDays)}</Badge>
                </div>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t.launch.sequence.subject}</Label>
                    <Input value={step.subject} onChange={(event) => updateStep(index, { subject: event.target.value })} className="h-9" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t.launch.sequence.body}</Label>
                    <Textarea value={step.body} onChange={(event) => updateStep(index, { body: event.target.value })} className="min-h-44 resize-y text-sm" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t.launch.sequence.delay}</Label>
                    <Input type="number" min={0} value={step.delayDays} onChange={(event) => updateStep(index, { delayDays: Number(event.target.value) })} className="h-9 w-24" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    );
  }

  function BriefPanel({ session }: { session: OutreachSession | null }) {
    const brief = session?.structured_brief || {};
    return (
      <section className="rounded-lg border bg-background p-4 shadow-xs">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-emerald-700" />
          <h2 className="text-sm font-semibold">{t.launch.brief.title}</h2>
        </div>
        {session ? (
          <div className="mt-3 space-y-3 text-sm">
            <BriefLine label={t.launch.brief.target} value={briefValue(brief, 'target', session.prompt)} />
            <BriefLine label={t.launch.brief.location} value={briefValue(brief, 'location')} />
            <BriefLine label={t.launch.brief.size} value={briefValue(brief, 'companySize')} />
            <BriefLine label={t.launch.brief.angle} value={briefValue(brief, 'outreachAngle')} />
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        )}
      </section>
    );
  }

  function BriefLine({ label, value }: { label: string; value: string }) {
    return (
      <div>
        <div className="text-xs font-medium text-muted-foreground">{label}</div>
        <div className="mt-0.5 break-words">{value}</div>
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

  function SearchSkeleton() {
    return (
      <section className="rounded-lg border bg-background p-4 shadow-xs">
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="flex items-center gap-3">
              <Skeleton className="h-5 w-5 rounded" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-2/3" />
              </div>
              <Skeleton className="h-8 w-24" />
            </div>
          ))}
        </div>
      </section>
    );
  }
}
