'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarClock, Loader2, Pause, Play, Plus, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { OutreachActivityStrip } from '@/components/outreach/outreach-activity-strip';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch } from '@/lib/api';
import { useTranslation } from '@/lib/i18n';
import { cn } from '@/lib/utils';

interface Automation {
  id: string;
  session_id: string | null;
  name: string;
  prompt: string;
  status: 'active' | 'paused' | 'archived';
  enabled: boolean;
  daily_limit: number;
  approval_required: boolean;
  next_run_at: string | null;
  last_run_at: string | null;
  sequence?: { id: string; name: string; status: string } | null;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(url, init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || response.statusText);
  return data as T;
}

export default function AutomationsPage() {
  const { t } = useTranslation();
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);

  const loadAutomations = useCallback(async () => {
    setLoading(true);
    try {
      const data = await requestJson<{ automations: Automation[] }>('/api/outreach/automations');
      setAutomations(data.automations || []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t.common.networkError);
    } finally {
      setLoading(false);
    }
  }, [t.common.networkError]);

  useEffect(() => {
    void loadAutomations();
  }, [loadAutomations]);

  const stats = useMemo(() => {
    const active = automations.filter((automation) => automation.status === 'active').length;
    const paused = automations.filter((automation) => automation.status === 'paused').length;
    const next = automations
      .filter((automation) => automation.status === 'active' && automation.next_run_at)
      .sort((left, right) => new Date(left.next_run_at || '').getTime() - new Date(right.next_run_at || '').getTime())[0];

    return { active, paused, total: automations.length, nextRun: next?.next_run_at || null };
  }, [automations]);

  async function updateAutomation(id: string, status: 'active' | 'paused' | 'archived') {
    setActingId(id);
    try {
      await requestJson(`/api/outreach/automations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      await loadAutomations();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t.common.networkError);
    } finally {
      setActingId(null);
    }
  }

  return (
    <div className="flex h-[calc(100dvh-1rem)] min-h-0 flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col bg-muted/20 px-3 py-3 lg:px-5">
        <main className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col">
          <OutreachActivityStrip className="mb-3" />

          <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-background shadow-xs">
            <header className="shrink-0 border-b px-4 py-4 sm:px-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    <CalendarClock className="h-4 w-4 text-emerald-700" />
                    {t.automationsPage.title}
                  </div>
                  <h1 className="mt-1 text-xl font-semibold tracking-tight">{t.automationsPage.title}</h1>
                  <p className="mt-1 text-sm text-muted-foreground">{t.automationsPage.subtitle}</p>
                </div>

                <div className="flex shrink-0 gap-2">
                  <Button variant="outline" size="sm" onClick={loadAutomations} disabled={loading}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    {t.common.refresh}
                  </Button>
                  <Button size="sm" asChild>
                    <Link href="/launch">
                      <Plus className="h-4 w-4" />
                      {t.automationsPage.newOutreach}
                    </Link>
                  </Button>
                </div>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-4">
                <AutomationStat label={t.automationsPage.active} value={stats.active} />
                <AutomationStat label={t.automationsPage.paused} value={stats.paused} />
                <AutomationStat label={t.automationsPage.total} value={stats.total} />
                <AutomationStat label={t.automationsPage.nextRun} value={stats.nextRun ? new Date(stats.nextRun).toLocaleString() : '-'} />
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-auto px-4 py-4 sm:px-5">
              {loading ? (
                <div className="grid gap-3 md:grid-cols-2">
                  <Skeleton className="h-36 rounded-lg" />
                  <Skeleton className="h-36 rounded-lg" />
                </div>
              ) : automations.length === 0 ? (
                <div className="flex min-h-[360px] items-center justify-center text-center">
                  <div className="max-w-sm">
                    <CalendarClock className="mx-auto h-8 w-8 text-muted-foreground" />
                    <h2 className="mt-3 text-sm font-semibold">{t.automationsPage.emptyTitle}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">{t.automationsPage.emptyDescription}</p>
                    <Button className="mt-4" size="sm" asChild>
                      <Link href="/launch">
                        <Plus className="h-4 w-4" />
                        {t.automationsPage.newOutreach}
                      </Link>
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {automations.map((automation) => (
                    <AutomationCard
                      key={automation.id}
                      automation={automation}
                      acting={actingId === automation.id}
                      onUpdate={updateAutomation}
                    />
                  ))}
                </div>
              )}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

function AutomationStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border bg-background px-3 py-3">
      <div className="truncate text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 truncate font-mono text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function AutomationCard({
  automation,
  acting,
  onUpdate,
}: {
  automation: Automation;
  acting: boolean;
  onUpdate: (id: string, status: 'active' | 'paused' | 'archived') => void;
}) {
  const { t } = useTranslation();
  const active = automation.status === 'active';

  return (
    <article className="rounded-lg border bg-background p-4 shadow-xs">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h2 className="truncate text-sm font-semibold">{automation.name}</h2>
            <Badge variant={active ? 'default' : 'outline'}>{active ? t.launch.automation.active : t.launch.automation.paused}</Badge>
          </div>
          <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">{automation.prompt}</p>
        </div>
        <div className={cn('mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full', active ? 'bg-emerald-600' : 'bg-muted-foreground/40')} />
      </div>

      <div className="mt-4 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
        <div className="rounded-md bg-muted/35 px-3 py-2">
          <div>{t.launch.automation.dailyLimit}</div>
          <div className="mt-1 font-medium text-foreground">{automation.daily_limit}/day</div>
        </div>
        <div className="rounded-md bg-muted/35 px-3 py-2">
          <div>{t.automationsPage.nextRun}</div>
          <div className="mt-1 truncate font-medium text-foreground">
            {automation.next_run_at ? new Date(automation.next_run_at).toLocaleString() : '-'}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5" />
        <span>{automation.approval_required ? t.automationsPage.review : t.automationsPage.auto}</span>
        {automation.sequence && <span className="truncate">· {automation.sequence.name}</span>}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {active ? (
          <Button variant="outline" size="sm" onClick={() => onUpdate(automation.id, 'paused')} disabled={acting}>
            {acting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pause className="h-4 w-4" />}
            {t.launch.automation.pause}
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={() => onUpdate(automation.id, 'active')} disabled={acting}>
            {acting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {t.launch.automation.resume}
          </Button>
        )}
        {automation.session_id && (
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/launch?thread=${automation.session_id}`}>{t.automationsPage.openControl}</Link>
          </Button>
        )}
        <Button variant="ghost" size="sm" asChild>
          <Link href="/outbound">{t.automationsPage.manageQueue}</Link>
        </Button>
        <Button variant="ghost" size="sm" onClick={() => onUpdate(automation.id, 'archived')} disabled={acting}>
          <Trash2 className="h-4 w-4" />
          {t.launch.automation.archive}
        </Button>
      </div>
    </article>
  );
}
