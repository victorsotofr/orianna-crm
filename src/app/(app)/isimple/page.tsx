'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Bot,
  Check,
  CirclePause,
  ExternalLink,
  Loader2,
  Mail,
  Play,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import { SiteHeader } from '@/components/site-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch } from '@/lib/api';
import { useTranslation } from '@/lib/i18n';
import type { Translations } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { useWorkspace } from '@/lib/workspace-context';

type ReviewFilter = 'pending' | 'ready' | 'blocked' | 'approved' | 'rejected' | 'queued';
type ReviewAction = 'approve_queue' | 'reject' | 'hold' | 'reenrich';

interface GtmStatus {
  workspace: {
    name: string;
    gtm_enabled: boolean;
    gtm_daily_contact_limit: number;
    gtm_requires_approval: boolean;
    gtm_active_sequence_id: string | null;
    gtm_last_run_status: string | null;
  };
  metrics: {
    sourcedContacts: number;
    addedToday: number;
    hotSourcedLeads: number;
    pendingReview: number;
    readyReview: number;
    blockedReview: number;
    approvedReview: number;
    queuedReview: number;
    activeEnrollments: number;
  };
  lastRun: {
    status: string;
    imported_count: number;
    prepared_count: number;
    enrolled_count: number;
    skipped_count: number;
    error: string | null;
    finished_at: string | null;
  } | null;
  sequences: Array<{ id: string; name: string; status: string }>;
}

interface ReviewItem {
  id: string;
  name: string;
  email: string | null;
  companyName: string | null;
  companyDomain: string | null;
  jobTitle: string | null;
  linkedinUrl: string | null;
  location: string | null;
  sourceUrl: string | null;
  sourceQuery: string | null;
  icpFit: string | null;
  aiScore: number | null;
  aiScoreLabel: string | null;
  aiScoreReasoning: string | null;
  personalizedLine: string | null;
  emailVerifiedStatus: string | null;
  reviewStatus: 'pending' | 'approved' | 'rejected';
  sendApprovedAt: string | null;
  isQueued: boolean;
  readyForApproval: boolean;
  readiness: 'ready' | 'blocked' | 'queued' | 'approved' | 'rejected';
  blockers: string[];
  warnings: string[];
  preview: {
    subject: string | null;
    text: string | null;
  };
  createdAt: string;
}

interface ReviewQueue {
  counts: {
    total: number;
    pending: number;
    ready: number;
    blocked: number;
    approved: number;
    rejected: number;
    queued: number;
  };
  sequence: {
    sequenceId: string | null;
    sequenceName: string | null;
    sequenceStatus: string | null;
    blocker: string | null;
  };
  items: ReviewItem[];
}

export default function IsimplePage() {
  const { t } = useTranslation();
  const { workspace, workspaces, switchWorkspace, refresh, isLoading: workspaceLoading } = useWorkspace();
  const [status, setStatus] = useState<GtmStatus | null>(null);
  const [queue, setQueue] = useState<ReviewQueue | null>(null);
  const [filter, setFilter] = useState<ReviewFilter>('pending');
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [running, setRunning] = useState(false);
  const [actingIds, setActingIds] = useState<Set<string>>(new Set());

  const isimpleWorkspace = useMemo(
    () => workspaces.find((candidate) => candidate.slug === 'isimple' || candidate.name.toLowerCase() === 'isimple'),
    [workspaces]
  );
  const isInIsimpleWorkspace = workspace?.id && isimpleWorkspace?.id === workspace.id;

  useEffect(() => {
    if (workspaceLoading || switching) return;

    if (isimpleWorkspace && workspace?.id !== isimpleWorkspace.id) {
      setSwitching(true);
      switchWorkspace(isimpleWorkspace.id);
      return;
    }

    if (!isimpleWorkspace) {
      setSwitching(true);
      fetch('/api/gtm/isimple-workspace', { method: 'POST' })
        .then(async (response) => {
          if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.error || response.statusText);
          }
          await refresh();
          window.location.reload();
        })
        .catch((error) => {
          toast.error(error instanceof Error ? error.message : t.isimple.toasts.ensureError);
          setSwitching(false);
        });
    }
  }, [isimpleWorkspace, refresh, switchWorkspace, switching, t.isimple.toasts.ensureError, workspace?.id, workspaceLoading]);

  const fetchData = useCallback(async () => {
    if (!isInIsimpleWorkspace) return;
    setLoading(true);
    try {
      const [statusRes, queueRes] = await Promise.all([
        apiFetch('/api/gtm/status'),
        apiFetch(`/api/gtm/review?status=${filter}&limit=50`),
      ]);

      if (!statusRes.ok) {
        const data = await statusRes.json().catch(() => ({}));
        throw new Error(data.error || statusRes.statusText);
      }
      if (!queueRes.ok) {
        const data = await queueRes.json().catch(() => ({}));
        throw new Error(data.error || queueRes.statusText);
      }

      setStatus(await statusRes.json());
      setQueue(await queueRes.json());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t.isimple.toasts.loadError);
    } finally {
      setLoading(false);
    }
  }, [filter, isInIsimpleWorkspace, t.isimple.toasts.loadError]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const runGtm = async () => {
    setRunning(true);
    try {
      const response = await apiFetch('/api/gtm/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'import_prepare' }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || response.statusText);
      }
      toast.success(t.isimple.toasts.runComplete);
      await fetchData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t.isimple.toasts.runError);
    } finally {
      setRunning(false);
    }
  };

  const applyAction = async (action: ReviewAction, contactIds: string[]) => {
    setActingIds((prev) => new Set([...prev, ...contactIds]));
    try {
      const response = await apiFetch('/api/gtm/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, contactIds, source: 'web' }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || response.statusText);
      }

      const message = action === 'approve_queue'
        ? t.isimple.toasts.approved(data.updated || 0, data.queued || 0)
        : action === 'reject'
          ? t.isimple.toasts.rejected(data.updated || 0)
          : action === 'reenrich'
            ? t.isimple.toasts.reenrich(data.enrichmentStarted || 0)
            : t.isimple.toasts.held(data.updated || 0);
      toast.success(message);
      await fetchData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t.isimple.toasts.actionError);
    } finally {
      setActingIds((prev) => {
        const next = new Set(prev);
        contactIds.forEach((id) => next.delete(id));
        return next;
      });
    }
  };

  const readyIds = (queue?.items || []).filter((item) => item.readyForApproval).map((item) => item.id);
  const checklist = buildChecklist(status, queue, workspace, isimpleWorkspace?.id || null, t);

  return (
    <>
      <SiteHeader title={t.isimple.title} />
      <div className="page-container">
        <div className="page-content">
          {switching || !isInIsimpleWorkspace ? (
            <div className="flex h-full items-center justify-center">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {isimpleWorkspace ? t.isimple.switchingWorkspace : t.isimple.ensureWorkspace}
              </div>
            </div>
          ) : loading && !queue ? (
            <LoadingState />
          ) : (
            <>
              <section className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-lg font-semibold">{t.isimple.heading}</h1>
                    <Badge variant={status?.workspace.gtm_requires_approval ? 'secondary' : 'destructive'}>
                      {status?.workspace.gtm_requires_approval ? t.isimple.reviewMode : t.isimple.fullAutoWarning}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{t.isimple.subtitle}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    {t.isimple.actions.refresh}
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                    <Link href="/contacts?source=gtm_autopilot">
                      <Search className="h-4 w-4" />
                      {t.isimple.actions.contacts}
                    </Link>
                  </Button>
                  <Button size="sm" onClick={runGtm} disabled={running}>
                    {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                    {t.isimple.actions.run}
                  </Button>
                </div>
              </section>

              <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                <Metric label={t.isimple.metrics.ready} value={queue?.counts.ready || 0} tone="emerald" />
                <Metric label={t.isimple.metrics.blocked} value={queue?.counts.blocked || 0} tone="amber" />
                <Metric label={t.isimple.metrics.pending} value={queue?.counts.pending || 0} tone="slate" />
                <Metric label={t.isimple.metrics.queued} value={queue?.counts.queued || 0} tone="blue" />
                <Metric label={t.isimple.metrics.addedToday} value={status?.metrics.addedToday || 0} tone="violet" />
                <Metric label={t.isimple.metrics.activeEnrollments} value={status?.metrics.activeEnrollments || 0} tone="slate" />
              </section>

              <section className="grid gap-3 xl:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.7fr)]">
                <div className="space-y-3">
                  <div className="rounded-lg border bg-card p-4">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-emerald-600" />
                      <h2 className="text-sm font-semibold">{t.isimple.checklist.title}</h2>
                    </div>
                    <div className="mt-3 space-y-2">
                      {checklist.map((item) => (
                        <div key={item.label} className="flex items-start gap-2 text-sm">
                          {item.ok ? (
                            <Check className="mt-0.5 h-4 w-4 text-emerald-600" />
                          ) : (
                            <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600" />
                          )}
                          <div>
                            <div className="font-medium leading-tight">{item.label}</div>
                            <div className="text-xs text-muted-foreground">{item.detail}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {queue?.sequence.blocker && (
                    <Alert>
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>{t.isimple.sequenceBlocked}</AlertTitle>
                      <AlertDescription>{queue.sequence.blocker}</AlertDescription>
                    </Alert>
                  )}

                  <div className="rounded-lg border bg-card p-4">
                    <div className="flex items-center gap-2">
                      <Bot className="h-4 w-4 text-emerald-600" />
                      <h2 className="text-sm font-semibold">{t.isimple.telegram.title}</h2>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">{t.isimple.telegram.description}</p>
                    <div className="mt-3 space-y-1 text-xs font-mono text-muted-foreground">
                      <div>/gtm</div>
                      <div>/gtm_review</div>
                      <div>{t.isimple.telegram.voiceExample}</div>
                    </div>
                  </div>
                </div>

                <div className="min-w-0 rounded-lg border bg-card">
                  <div className="flex flex-col gap-3 border-b p-4 xl:flex-row xl:items-center xl:justify-between">
                    <div>
                      <h2 className="text-sm font-semibold">{t.isimple.reviewQueue}</h2>
                      <p className="text-xs text-muted-foreground">{t.isimple.reviewHint}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(['pending', 'ready', 'blocked', 'queued', 'approved', 'rejected'] as ReviewFilter[]).map((value) => (
                        <button
                          key={value}
                          type="button"
                          className={cn(
                            'rounded-md border px-2.5 py-1 text-xs transition-colors',
                            filter === value ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'
                          )}
                          onClick={() => setFilter(value)}
                        >
                          {t.isimple.filters[value]}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
                    <div className="text-xs text-muted-foreground">
                      {t.isimple.readyBatch(readyIds.length)}
                    </div>
                    <Button size="sm" onClick={() => applyAction('approve_queue', readyIds)} disabled={readyIds.length === 0 || actingIds.size > 0}>
                      {actingIds.size > 0 ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      {t.isimple.actions.approveReady}
                    </Button>
                  </div>

                  <div className="max-h-[calc(100vh-330px)] min-h-[360px] overflow-auto">
                    {queue?.items.length ? (
                      <div className="divide-y">
                        {queue.items.map((item) => (
                          <ReviewRow
                            key={item.id}
                            item={item}
                            acting={actingIds.has(item.id)}
                            onAction={(action) => applyAction(action, [item.id])}
                            t={t}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                        {t.isimple.empty}
                      </div>
                    )}
                  </div>
                </div>
              </section>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone: 'emerald' | 'amber' | 'slate' | 'blue' | 'violet' }) {
  const colors = {
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    slate: 'bg-card text-foreground border-border',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    violet: 'bg-violet-50 text-violet-700 border-violet-200',
  };

  return (
    <div className={cn('rounded-lg border p-3', colors[tone])}>
      <div className="text-xs opacity-80">{label}</div>
      <div className="mt-1 font-mono text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function ReviewRow({
  item,
  acting,
  onAction,
  t,
}: {
  item: ReviewItem;
  acting: boolean;
  onAction: (action: ReviewAction) => void;
  t: Translations;
}) {
  const tone = item.readiness === 'ready'
    ? 'bg-emerald-100 text-emerald-700'
    : item.readiness === 'blocked'
      ? 'bg-amber-100 text-amber-700'
      : item.readiness === 'rejected'
        ? 'bg-red-100 text-red-700'
        : 'bg-blue-100 text-blue-700';

  return (
    <article className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)_auto]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate text-sm font-semibold">{item.name}</h3>
          <Badge variant="outline" className={tone}>{t.isimple.readiness[item.readiness]}</Badge>
          {item.aiScore != null && (
            <Badge variant="outline">{item.aiScore}/100 {item.aiScoreLabel}</Badge>
          )}
        </div>
        <div className="mt-1 text-sm text-muted-foreground">
          {[item.jobTitle, item.companyName, item.location].filter(Boolean).join(' · ') || t.isimple.noCompany}
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Mail className="h-3.5 w-3.5" />
            {item.email || t.isimple.noEmail}
          </span>
          {item.emailVerifiedStatus && <span>{item.emailVerifiedStatus}</span>}
          {item.sourceUrl && (
            <a className="inline-flex items-center gap-1 hover:text-foreground" href={item.sourceUrl} target="_blank" rel="noreferrer">
              {t.isimple.source}
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
        {item.personalizedLine && (
          <p className="mt-3 text-sm italic leading-relaxed">&ldquo;{item.personalizedLine}&rdquo;</p>
        )}
        {(item.blockers.length > 0 || item.warnings.length > 0) && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {item.blockers.map((blocker) => (
              <Badge key={blocker} variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">{blocker}</Badge>
            ))}
            {item.warnings.map((warning) => (
              <Badge key={warning} variant="outline">{warning}</Badge>
            ))}
          </div>
        )}
      </div>

      <div className="min-w-0 rounded-md border bg-background p-3">
        <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5" />
          {t.isimple.emailPreview}
        </div>
        {item.preview.subject || item.preview.text ? (
          <>
            <div className="truncate text-xs font-semibold">{item.preview.subject}</div>
            <p className="mt-2 line-clamp-5 whitespace-pre-line text-xs leading-relaxed text-muted-foreground">
              {item.preview.text}
            </p>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">{t.isimple.noPreview}</p>
        )}
      </div>

      <div className="flex flex-row gap-2 xl:w-36 xl:flex-col">
        <Button size="sm" onClick={() => onAction('approve_queue')} disabled={!item.readyForApproval || item.isQueued || acting}>
          {acting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {t.isimple.actions.approveQueue}
        </Button>
        <Button size="sm" variant="outline" onClick={() => onAction('reenrich')} disabled={acting}>
          <RefreshCw className="h-4 w-4" />
          {t.isimple.actions.reenrich}
        </Button>
        <Button size="sm" variant="outline" onClick={() => onAction('hold')} disabled={acting}>
          <CirclePause className="h-4 w-4" />
          {t.isimple.actions.hold}
        </Button>
        <Button size="sm" variant="outline" onClick={() => onAction('reject')} disabled={acting}>
          <X className="h-4 w-4" />
          {t.isimple.actions.reject}
        </Button>
        <Button size="sm" variant="ghost" asChild>
          <Link href={`/contacts/${item.id}`}>{t.isimple.actions.open}</Link>
        </Button>
      </div>
    </article>
  );
}

function LoadingState() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-16 w-full rounded-lg" />
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-20 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-[520px] w-full rounded-lg" />
    </div>
  );
}

function buildChecklist(
  status: GtmStatus | null,
  queue: ReviewQueue | null,
  workspace: { id: string; name: string; slug: string } | null,
  isimpleWorkspaceId: string | null,
  t: Translations
) {
  return [
    {
      ok: Boolean(workspace?.id && workspace.id === isimpleWorkspaceId),
      label: t.isimple.checklist.workspace,
      detail: workspace?.name || t.isimple.checklist.noWorkspace,
    },
    {
      ok: Boolean(status?.workspace.gtm_requires_approval),
      label: t.isimple.checklist.approvalGate,
      detail: status?.workspace.gtm_requires_approval ? t.isimple.checklist.manualApproval : t.isimple.checklist.fullAuto,
    },
    {
      ok: Boolean(status?.workspace.gtm_active_sequence_id && !queue?.sequence.blocker),
      label: t.isimple.checklist.activeSequence,
      detail: queue?.sequence.sequenceName || queue?.sequence.blocker || t.isimple.checklist.noSequence,
    },
    {
      ok: (status?.workspace.gtm_daily_contact_limit || 0) <= 20,
      label: t.isimple.checklist.dailyLimit,
      detail: `${status?.workspace.gtm_daily_contact_limit || 0}/day`,
    },
    {
      ok: (queue?.counts.ready || 0) > 0 || (queue?.counts.pending || 0) === 0,
      label: t.isimple.checklist.reviewReadiness,
      detail: t.isimple.checklist.reviewReadinessDetail(queue?.counts.ready || 0, queue?.counts.blocked || 0),
    },
  ];
}
