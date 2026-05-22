'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
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
  Settings,
  Sparkles,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import { SiteHeader } from '@/components/site-header';
import { AutomationsPanel } from '@/components/outreach/automations-panel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { apiFetch } from '@/lib/api';
import { useTranslation, type Translations } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { useWorkspace } from '@/lib/workspace-context';

type TaskView = 'needs_work' | 'ready' | 'queued';
type ReviewFilter = 'pending' | 'ready' | 'blocked' | 'approved' | 'rejected' | 'queued';
type ReviewAction = 'approve_queue' | 'reject' | 'hold' | 'reenrich';
type PrimaryActionKind = 'setup' | 'run' | 'show_ready' | 'approve_ready' | 'show_needs_work' | 'enrich_visible';

const VIEW_TO_FILTER: Record<TaskView, ReviewFilter> = {
  needs_work: 'blocked',
  ready: 'ready',
  queued: 'queued',
};

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
  preview: { subject: string | null; text: string | null };
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

interface SetupSettings {
  enabled: boolean;
  setEnabled: (value: boolean) => void;
  requiresApproval: boolean;
  setRequiresApproval: (value: boolean) => void;
  dailyLimit: string;
  setDailyLimit: (value: string) => void;
  activeSequenceId: string;
  setActiveSequenceId: (value: string) => void;
}

interface PrimaryAction {
  kind: PrimaryActionKind;
  title: string;
  detail: string;
  label: string;
}

export default function OutboundPage() {
  const { t } = useTranslation();
  const { workspace, isLoading: workspaceLoading } = useWorkspace();
  const [status, setStatus] = useState<GtmStatus | null>(null);
  const [queue, setQueue] = useState<ReviewQueue | null>(null);
  const [view, setView] = useState<TaskView>('needs_work');
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actingIds, setActingIds] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [requiresApproval, setRequiresApproval] = useState(true);
  const [dailyLimit, setDailyLimit] = useState('20');
  const [activeSequenceId, setActiveSequenceId] = useState('none');

  const fetchData = useCallback(async () => {
    if (!workspace?.id) return;
    setLoading(true);
    try {
      const [statusRes, queueRes] = await Promise.all([
        apiFetch('/api/gtm/status'),
        apiFetch(`/api/gtm/review?status=${VIEW_TO_FILTER[view]}&limit=100`),
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
      toast.error(error instanceof Error ? error.message : t.outbound.toasts.loadError);
    } finally {
      setLoading(false);
    }
  }, [t.outbound.toasts.loadError, view, workspace?.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!status) return;
    setEnabled(Boolean(status.workspace.gtm_enabled));
    setRequiresApproval(status.workspace.gtm_requires_approval !== false);
    setDailyLimit(String(status.workspace.gtm_daily_contact_limit || 20));
    setActiveSequenceId(status.workspace.gtm_active_sequence_id || 'none');
  }, [status]);

  const items = useMemo(() => queue?.items || [], [queue?.items]);
  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedId) || items[0] || null,
    [items, selectedId]
  );
  const readyIds = useMemo(() => items.filter((item) => item.readyForApproval && !item.isQueued).map((item) => item.id), [items]);
  const visibleIds = useMemo(() => items.map((item) => item.id), [items]);
  const primaryAction = getPrimaryAction(queue, status, view, t);
  const checklist = buildChecklist(status, queue, t);
  const settings: SetupSettings = {
    enabled,
    setEnabled,
    requiresApproval,
    setRequiresApproval,
    dailyLimit,
    setDailyLimit,
    activeSequenceId,
    setActiveSequenceId,
  };

  useEffect(() => {
    if (!selectedItem) {
      setSelectedId(null);
    } else if (!selectedId || !items.some((item) => item.id === selectedId)) {
      setSelectedId(selectedItem.id);
    }
  }, [items, selectedId, selectedItem]);

  const saveSettings = async () => {
    const parsedLimit = Number(dailyLimit);
    if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
      toast.error(t.outbound.toasts.invalidLimit);
      return;
    }

    setSaving(true);
    try {
      const response = await apiFetch('/api/gtm/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled,
          requiresApproval,
          activeSequenceId: activeSequenceId === 'none' ? null : activeSequenceId,
          dailyLimit: parsedLimit,
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || response.statusText);
      }
      toast.success(t.outbound.toasts.saved);
      await fetchData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t.outbound.toasts.saveError);
    } finally {
      setSaving(false);
    }
  };

  const runOutbound = async () => {
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
      toast.success(t.outbound.toasts.runComplete);
      await fetchData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t.outbound.toasts.runError);
    } finally {
      setRunning(false);
    }
  };

  const applyAction = async (action: ReviewAction, contactIds: string[]) => {
    if (contactIds.length === 0) return;
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
        ? t.outbound.toasts.approved(data.updated || 0, data.queued || 0)
        : action === 'reject'
          ? t.outbound.toasts.rejected(data.updated || 0)
          : action === 'reenrich'
            ? t.outbound.toasts.reenrich(data.enrichmentStarted || 0)
            : t.outbound.toasts.held(data.updated || 0);
      toast.success(message);
      await fetchData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t.outbound.toasts.actionError);
    } finally {
      setActingIds((prev) => {
        const next = new Set(prev);
        contactIds.forEach((id) => next.delete(id));
        return next;
      });
    }
  };

  const handlePrimaryAction = () => {
    switch (primaryAction.kind) {
      case 'setup':
        setSetupOpen(true);
        break;
      case 'run':
        runOutbound();
        break;
      case 'show_ready':
        setView('ready');
        break;
      case 'approve_ready':
        applyAction('approve_queue', readyIds);
        break;
      case 'show_needs_work':
        setView('needs_work');
        break;
      case 'enrich_visible':
        applyAction('reenrich', visibleIds);
        break;
    }
  };

  const openDetail = (item: ReviewItem) => {
    setSelectedId(item.id);
    setDetailOpen(true);
  };

  const primaryDisabled = loading || running || actingIds.size > 0
    || (primaryAction.kind === 'approve_ready' && readyIds.length === 0)
    || (primaryAction.kind === 'enrich_visible' && visibleIds.length === 0);

  return (
    <>
      <SiteHeader title={t.sidebar.control} />
      <div className="page-container">
        <div className="page-content bg-muted/20">
          <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4">
            {workspaceLoading || (loading && !status) ? (
              <LoadingState />
            ) : (
              <>
                <AutomationsPanel />
                <section className="rounded-xl border bg-background px-4 py-4 shadow-xs sm:px-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <StatusPill active={enabled}>
                          {enabled ? t.outbound.agent.statusOn : t.outbound.agent.statusOff}
                        </StatusPill>
                        <StatusPill active={requiresApproval}>
                          {requiresApproval ? t.outbound.agent.reviewOn : t.outbound.agent.reviewOff}
                        </StatusPill>
                      </div>
                      <h1 className="truncate text-2xl font-semibold">
                        {t.outbound.heading(workspace?.name || t.outbound.workspaceFallback)}
                      </h1>
                      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t.outbound.subtitle}</p>
                    </div>

                    <div className="flex shrink-0 flex-wrap gap-2">
                      <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                        {t.outbound.actions.refresh}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setSetupOpen(true)}>
                        <Settings className="h-4 w-4" />
                        {t.outbound.actions.setup}
                      </Button>
                      <Button size="sm" onClick={handlePrimaryAction} disabled={primaryDisabled}>
                        {running || actingIds.size > 0 ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                        {primaryAction.label}
                      </Button>
                    </div>
                  </div>

                  <div className="mt-5 rounded-lg bg-muted/45 p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <Bot className="h-4 w-4 text-emerald-700" />
                          {primaryAction.title}
                        </div>
                        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{primaryAction.detail}</p>
                      </div>
                      <div className="shrink-0 text-sm text-muted-foreground">
                        {t.outbound.agent.summary(
                          queue?.counts.ready || 0,
                          queue?.counts.blocked || 0,
                          queue?.counts.queued || 0,
                          status?.metrics.addedToday || 0
                        )}
                      </div>
                    </div>
                  </div>
                </section>

                <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-background shadow-xs">
                  <div className="flex shrink-0 flex-col gap-3 border-b px-4 py-4 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <h2 className="text-base font-semibold">{t.outbound.queue.title}</h2>
                      <p className="mt-1 text-sm text-muted-foreground">{t.outbound.queue.description}</p>
                    </div>

                    <div className="flex shrink-0 items-center gap-2 overflow-x-auto">
                      <QueueViewButton
                        active={view === 'needs_work'}
                        label={t.outbound.queue.needsWork}
                        count={queue?.counts.blocked || 0}
                        onClick={() => setView('needs_work')}
                      />
                      <QueueViewButton
                        active={view === 'ready'}
                        label={t.outbound.queue.ready}
                        count={queue?.counts.ready || 0}
                        onClick={() => setView('ready')}
                      />
                      <QueueViewButton
                        active={view === 'queued'}
                        label={t.outbound.queue.queued}
                        count={queue?.counts.queued || 0}
                        onClick={() => setView('queued')}
                      />
                    </div>
                  </div>

                  <div className="min-h-0 flex-1 overflow-auto">
                    {items.length > 0 ? (
                      <div className="divide-y">
                        {items.map((item) => (
                          <ProspectTaskRow
                            key={item.id}
                            item={item}
                            acting={actingIds.has(item.id)}
                            selected={selectedId === item.id}
                            onOpen={() => openDetail(item)}
                            onAction={(action) => applyAction(action, [item.id])}
                            t={t}
                          />
                        ))}
                      </div>
                    ) : (
                      <EmptyQueue status={status} view={view} onRun={runOutbound} running={running} t={t} />
                    )}
                  </div>
                </section>

                <Sheet open={setupOpen} onOpenChange={setSetupOpen}>
                  <SheetContent side="right" className="flex w-[min(520px,calc(100vw-1rem))] max-w-none flex-col p-0 sm:max-w-none">
                    <SetupSheetContent
                      status={status}
                      checklist={checklist}
                      settings={settings}
                      saving={saving}
                      onSave={saveSettings}
                      t={t}
                    />
                  </SheetContent>
                </Sheet>

                <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
                  <SheetContent side="right" className="flex w-[min(600px,calc(100vw-1rem))] max-w-none flex-col p-0 sm:max-w-none">
                    <ProspectDetailSheetContent
                      item={selectedItem}
                      acting={selectedItem ? actingIds.has(selectedItem.id) : false}
                      onAction={(action) => selectedItem && applyAction(action, [selectedItem.id])}
                      t={t}
                    />
                  </SheetContent>
                </Sheet>
              </>
            )}
          </main>
        </div>
      </div>
    </>
  );
}

function StatusPill({ active, children }: { active: boolean; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center rounded-full px-2.5 text-xs font-medium',
        active ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-muted text-muted-foreground ring-1 ring-border'
      )}
    >
      {children}
    </span>
  );
}

function QueueViewButton({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-3 text-sm font-medium transition-colors',
        active ? 'border-foreground bg-foreground text-background' : 'border-border bg-background text-muted-foreground hover:text-foreground'
      )}
      onClick={onClick}
    >
      <span>{label}</span>
      <span className={cn('font-mono text-xs tabular-nums', active ? 'text-background/80' : 'text-muted-foreground')}>{count}</span>
    </button>
  );
}

function ProspectTaskRow({
  item,
  acting,
  selected,
  onOpen,
  onAction,
  t,
}: {
  item: ReviewItem;
  acting: boolean;
  selected: boolean;
  onOpen: () => void;
  onAction: (action: ReviewAction) => void;
  t: Translations;
}) {
  const subtitle = [item.jobTitle, item.companyName, item.location].filter(Boolean).join(' · ') || t.outbound.noCompany;
  const note = item.personalizedLine || item.blockers[0] || item.icpFit || t.outbound.noPreview;
  const action = getRowAction(item, t);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen();
        }
      }}
      className={cn(
        'grid cursor-pointer gap-3 px-4 py-4 outline-none transition-colors hover:bg-muted/40 focus-visible:bg-muted/50 sm:px-5 md:grid-cols-[minmax(0,1fr)_auto]',
        selected && 'bg-muted/40'
      )}
    >
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="truncate text-sm font-semibold" title={item.name}>{item.name}</span>
          <ReadinessBadge item={item} t={t} />
          {item.aiScoreLabel && <span className="text-xs uppercase text-muted-foreground">{item.aiScoreLabel}</span>}
          {acting && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />}
        </div>
        <div className="mt-1 truncate text-sm text-muted-foreground" title={subtitle}>{subtitle}</div>
        <p className="mt-2 line-clamp-2 max-w-3xl text-sm leading-relaxed text-muted-foreground" title={note}>{note}</p>
      </div>

      <div className="flex items-center justify-between gap-3 md:justify-end">
        <div className="min-w-0 text-sm text-muted-foreground md:text-right">
          <div className="truncate">{item.email || t.outbound.noEmail}</div>
          <div className="text-xs">{item.emailVerifiedStatus || t.outbound.emailUnknown}</div>
        </div>
        <Button
          size="sm"
          variant={action.action === 'approve_queue' ? 'default' : 'outline'}
          disabled={acting}
          onClick={(event) => {
            event.stopPropagation();
            if (action.action) {
              onAction(action.action);
            } else {
              onOpen();
            }
          }}
        >
          {acting ? <Loader2 className="h-4 w-4 animate-spin" /> : action.icon}
          {action.label}
        </Button>
      </div>
    </div>
  );
}

function SetupSheetContent({
  status,
  checklist,
  settings,
  saving,
  onSave,
  t,
}: {
  status: GtmStatus | null;
  checklist: Array<{ ok: boolean; label: string; detail: string }>;
  settings: SetupSettings;
  saving: boolean;
  onSave: () => void;
  t: Translations;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <SheetHeader className="border-b px-5 py-4 pr-12 text-left">
        <SheetTitle className="text-base">{t.outbound.setup.title}</SheetTitle>
        <SheetDescription>{t.outbound.setup.description}</SheetDescription>
      </SheetHeader>

      <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
        <div className="space-y-3">
          <SettingToggle
            label={t.outbound.setup.enabled}
            detail={settings.enabled ? t.outbound.agent.statusOn : t.outbound.agent.statusOff}
            checked={settings.enabled}
            onCheckedChange={settings.setEnabled}
          />
          <SettingToggle
            label={t.outbound.setup.approval}
            detail={settings.requiresApproval ? t.outbound.agent.reviewOn : t.outbound.agent.reviewOff}
            checked={settings.requiresApproval}
            onCheckedChange={settings.setRequiresApproval}
          />

          <div className="grid gap-4 rounded-lg border bg-background p-4">
            <div className="space-y-1.5">
              <Label className="text-xs">{t.outbound.setup.sequence}</Label>
              <Select value={settings.activeSequenceId} onValueChange={settings.setActiveSequenceId}>
                <SelectTrigger className="h-9 w-full min-w-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-w-[480px]">
                  <SelectItem value="none">{t.outbound.setup.noSequence}</SelectItem>
                  {(status?.sequences || []).map((sequence) => (
                    <SelectItem key={sequence.id} value={sequence.id}>{sequence.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">{t.outbound.setup.limit}</Label>
              <Input
                className="h-9 w-28"
                type="number"
                min={1}
                max={100}
                value={settings.dailyLimit}
                onChange={(event) => settings.setDailyLimit(event.target.value)}
              />
            </div>
          </div>

          <details className="rounded-lg border bg-background p-4">
            <summary className="cursor-pointer text-sm font-medium">{t.outbound.setup.checklist}</summary>
            <div className="mt-3 space-y-2">
              {checklist.map((check) => (
                <div key={check.label} className="flex items-start gap-2 text-xs">
                  {check.ok ? <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />}
                  <div className="min-w-0">
                    <div className="font-medium">{check.label}</div>
                    <div className="break-words text-muted-foreground">{check.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          </details>
        </div>
      </div>

      <div className="border-t px-5 py-4">
        <Button className="w-full" size="sm" onClick={onSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {t.outbound.setup.save}
        </Button>
      </div>
    </div>
  );
}

function SettingToggle({
  label,
  detail,
  checked,
  onCheckedChange,
}: {
  label: string;
  detail: string;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border bg-background p-4">
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        <div className="truncate text-xs text-muted-foreground">{detail}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function ProspectDetailSheetContent({
  item,
  acting,
  onAction,
  t,
}: {
  item: ReviewItem | null;
  acting: boolean;
  onAction: (action: ReviewAction) => void;
  t: Translations;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <SheetHeader className="border-b px-5 py-4 pr-12 text-left">
        <SheetTitle className="text-base">{item ? item.name : t.outbound.detail.title}</SheetTitle>
        <SheetDescription>
          {item
            ? [item.jobTitle, item.companyName, item.location].filter(Boolean).join(' · ') || t.outbound.noCompany
            : t.outbound.detail.description}
        </SheetDescription>
      </SheetHeader>

      <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
        {item ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <ReadinessBadge item={item} t={t} />
              <Badge variant="outline">{item.emailVerifiedStatus || t.outbound.emailUnknown}</Badge>
            </div>

            <InfoBlock icon={<Mail className="h-4 w-4" />} title={t.outbound.detail.preview}>
              {item.preview.subject || item.preview.text ? (
                <div className="space-y-3">
                  <div className="text-sm font-semibold">{item.preview.subject}</div>
                  <p className="whitespace-pre-line text-sm leading-6 text-muted-foreground">{item.preview.text}</p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t.outbound.noPreview}</p>
              )}
            </InfoBlock>

            <InfoBlock icon={<Sparkles className="h-4 w-4" />} title={t.outbound.detail.personalization}>
              <p className="text-sm leading-6 text-muted-foreground">
                {item.personalizedLine || item.icpFit || t.outbound.detail.noPersonalization}
              </p>
            </InfoBlock>

            {(item.blockers.length > 0 || item.warnings.length > 0) && (
              <div className="flex flex-wrap gap-1.5">
                {item.blockers.map((blocker) => (
                  <Badge key={blocker} variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">{blocker}</Badge>
                ))}
                {item.warnings.map((warning) => (
                  <Badge key={warning} variant="outline">{warning}</Badge>
                ))}
              </div>
            )}

            <details className="rounded-lg border bg-background p-4">
              <summary className="cursor-pointer text-sm font-medium">{t.outbound.detail.details}</summary>
              <div className="mt-3 space-y-3 text-sm text-muted-foreground">
                <div className="flex flex-wrap gap-3 text-xs">
                  <span className="inline-flex items-center gap-1">
                    <Mail className="h-3.5 w-3.5" />
                    {item.email || t.outbound.noEmail}
                  </span>
                  {item.linkedinUrl && <a className="hover:text-foreground" href={item.linkedinUrl} target="_blank" rel="noreferrer">LinkedIn</a>}
                  {item.sourceUrl && (
                    <a className="inline-flex items-center gap-1 hover:text-foreground" href={item.sourceUrl} target="_blank" rel="noreferrer">
                      {t.outbound.source}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
                {item.aiScore != null && (
                  <p>{item.aiScore}/100 {item.aiScoreLabel || ''}</p>
                )}
                {item.aiScoreReasoning && <p>{item.aiScoreReasoning}</p>}
                {item.sourceQuery && <p>{item.sourceQuery}</p>}
              </div>
            </details>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-center text-sm text-muted-foreground">
            {t.outbound.empty}
          </div>
        )}
      </div>

      <div className="border-t px-5 py-4">
        <div className="grid grid-cols-2 gap-2">
          <Button size="sm" onClick={() => onAction('approve_queue')} disabled={!item?.readyForApproval || Boolean(item?.isQueued) || acting}>
            {acting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {t.outbound.actions.approveQueue}
          </Button>
          <Button size="sm" variant="outline" onClick={() => onAction('reenrich')} disabled={!item || acting}>
            <RefreshCw className="h-4 w-4" />
            {t.outbound.actions.reenrich}
          </Button>
          <Button size="sm" variant="outline" onClick={() => onAction('hold')} disabled={!item || acting}>
            <CirclePause className="h-4 w-4" />
            {t.outbound.actions.hold}
          </Button>
          <Button size="sm" variant="outline" onClick={() => onAction('reject')} disabled={!item || acting}>
            <X className="h-4 w-4" />
            {t.outbound.actions.reject}
          </Button>
        </div>
        {item && (
          <Button className="mt-2 w-full" size="sm" variant="ghost" asChild>
            <Link href={`/contacts/${item.id}`}>{t.outbound.actions.openContact}</Link>
          </Button>
        )}
      </div>
    </div>
  );
}

function InfoBlock({ title, icon, children }: { title: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-lg border bg-background p-4">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
        {icon}
        {title}
      </div>
      {children}
    </section>
  );
}

function ReadinessBadge({ item, t }: { item: ReviewItem; t: Translations }) {
  const tone = item.readiness === 'ready'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : item.readiness === 'blocked'
      ? 'border-amber-200 bg-amber-50 text-amber-700'
      : item.readiness === 'rejected'
        ? 'border-red-200 bg-red-50 text-red-700'
        : 'border-zinc-200 bg-zinc-50 text-zinc-700';

  return <Badge variant="outline" className={tone}>{t.outbound.readiness[item.readiness]}</Badge>;
}

function EmptyQueue({
  status,
  view,
  onRun,
  running,
  t,
}: {
  status: GtmStatus | null;
  view: TaskView;
  onRun: () => void;
  running: boolean;
  t: Translations;
}) {
  const description = status?.workspace.gtm_active_sequence_id
    ? t.outbound.emptyByView[view]
    : t.outbound.emptySetupDescription;

  return (
    <div className="flex h-full min-h-[360px] items-center justify-center px-6">
      <div className="max-w-sm text-center">
        <Bot className="mx-auto h-8 w-8 text-muted-foreground" />
        <h3 className="mt-3 text-sm font-semibold">{t.outbound.emptyTitle}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        <Button className="mt-4" size="sm" onClick={onRun} disabled={running}>
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          {t.outbound.actions.run}
        </Button>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4">
      <Skeleton className="h-44 rounded-xl" />
      <Skeleton className="h-[520px] rounded-xl" />
    </div>
  );
}

function getPrimaryAction(queue: ReviewQueue | null, status: GtmStatus | null, view: TaskView, t: Translations): PrimaryAction {
  if (!status?.workspace.gtm_active_sequence_id) {
    return {
      kind: 'setup',
      title: t.outbound.recommendations.sequenceTitle,
      detail: t.outbound.recommendations.sequenceDetail,
      label: t.outbound.actions.setup,
    };
  }

  if ((queue?.counts.ready || 0) > 0) {
    if (view !== 'ready') {
      return {
        kind: 'show_ready',
        title: t.outbound.recommendations.readyTitle(queue?.counts.ready || 0),
        detail: t.outbound.recommendations.readyDetail(queue?.counts.blocked || 0),
        label: t.outbound.actions.reviewReady,
      };
    }
    return {
      kind: 'approve_ready',
      title: t.outbound.recommendations.readyTitle(queue?.counts.ready || 0),
      detail: t.outbound.recommendations.readyDetail(queue?.counts.blocked || 0),
      label: t.outbound.actions.approveReady(queue?.counts.ready || 0),
    };
  }

  if ((queue?.counts.blocked || 0) > 0) {
    if (view !== 'needs_work') {
      return {
        kind: 'show_needs_work',
        title: t.outbound.recommendations.blockedTitle,
        detail: t.outbound.recommendations.blockedDetail,
        label: t.outbound.actions.showNeedsWork,
      };
    }
    return {
      kind: 'enrich_visible',
      title: t.outbound.recommendations.blockedTitle,
      detail: t.outbound.recommendations.blockedDetail,
      label: t.outbound.actions.enrichVisible,
    };
  }

  return {
    kind: 'run',
    title: t.outbound.recommendations.idleTitle,
    detail: t.outbound.recommendations.idleDetail,
    label: t.outbound.actions.run,
  };
}

function getRowAction(item: ReviewItem, t: Translations): { action: ReviewAction | null; label: string; icon: ReactNode } {
  if (item.readyForApproval && !item.isQueued) {
    return { action: 'approve_queue', label: t.outbound.actions.approve, icon: <Check className="h-4 w-4" /> };
  }
  if (item.isQueued) {
    return { action: null, label: t.outbound.actions.viewDetails, icon: <Sparkles className="h-4 w-4" /> };
  }
  return { action: 'reenrich', label: t.outbound.actions.reenrich, icon: <RefreshCw className="h-4 w-4" /> };
}

function buildChecklist(status: GtmStatus | null, queue: ReviewQueue | null, t: Translations) {
  return [
    {
      ok: Boolean(status?.workspace.gtm_active_sequence_id && !queue?.sequence.blocker),
      label: t.outbound.checklist.sequence,
      detail: queue?.sequence.sequenceName || queue?.sequence.blocker || t.outbound.checklist.noSequence,
    },
    {
      ok: Boolean(status?.workspace.gtm_requires_approval),
      label: t.outbound.checklist.approval,
      detail: status?.workspace.gtm_requires_approval ? t.outbound.checklist.approvalOn : t.outbound.checklist.approvalOff,
    },
    {
      ok: (status?.workspace.gtm_daily_contact_limit || 0) <= 20,
      label: t.outbound.checklist.limit,
      detail: `${status?.workspace.gtm_daily_contact_limit || 0}/day`,
    },
    {
      ok: (queue?.counts.ready || 0) > 0 || (queue?.counts.pending || 0) === 0,
      label: t.outbound.checklist.readiness,
      detail: t.outbound.checklist.readinessDetail(queue?.counts.ready || 0, queue?.counts.blocked || 0),
    },
  ];
}
