'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bot, Loader2, Pause, Play, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch } from '@/lib/api';
import { useTranslation } from '@/lib/i18n';

interface Automation {
  id: string;
  name: string;
  prompt: string;
  status: 'active' | 'paused' | 'archived';
  enabled: boolean;
  daily_limit: number;
  approval_required: boolean;
  next_run_at: string | null;
  sequence?: { id: string; name: string; status: string } | null;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(url, init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || response.statusText);
  return data as T;
}

export function AutomationsPanel({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const activeAutomations = automations.filter((automation) => automation.status === 'active');
  const nextAutomation = activeAutomations
    .filter((automation) => automation.next_run_at)
    .sort((left, right) => new Date(left.next_run_at || '').getTime() - new Date(right.next_run_at || '').getTime())[0];

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

  if (compact) {
    return (
      <div className="inline-flex min-w-0 max-w-full items-center gap-2 rounded-full border bg-background px-2.5 py-1 text-xs text-muted-foreground">
        <Bot className="h-3.5 w-3.5 shrink-0 text-emerald-700" />
        <span className="truncate">
          {loading
            ? t.common.loading
            : automations.length === 0
              ? t.launch.automation.empty
              : t.launch.automation.count(activeAutomations.length)}
        </span>
        {nextAutomation?.next_run_at && (
          <span className="hidden max-w-[180px] truncate text-muted-foreground/80 xl:inline">
            {new Date(nextAutomation.next_run_at).toLocaleString()}
          </span>
        )}
        {!loading && automations[0] && (
          <button
            type="button"
            className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
            disabled={actingId === automations[0].id}
            onClick={() => updateAutomation(automations[0].id, automations[0].status === 'active' ? 'paused' : 'active')}
            aria-label={automations[0].status === 'active' ? t.launch.automation.pause : t.launch.automation.resume}
          >
            {actingId === automations[0].id
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : automations[0].status === 'active'
                ? <Pause className="h-3.5 w-3.5" />
                : <Play className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>
    );
  }

  return (
    <section className="rounded-xl border bg-background px-4 py-4 shadow-xs sm:px-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
            <Bot className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold">{t.launch.automation.panelTitle}</h2>
            <p className="mt-1 truncate text-sm text-muted-foreground">{t.launch.automation.count(automations.length)}</p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="mt-4 grid gap-2">
          <Skeleton className="h-14 rounded-lg" />
          <Skeleton className="h-14 rounded-lg" />
        </div>
      ) : automations.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">
          {t.launch.automation.empty}
        </div>
      ) : (
        <div className="mt-4 divide-y rounded-lg border">
          {automations.map((automation) => (
            <div key={automation.id} className="grid gap-3 px-3 py-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-medium">{automation.name}</span>
                  <Badge variant={automation.status === 'active' ? 'default' : 'outline'}>
                    {automation.status === 'active' ? t.launch.automation.active : t.launch.automation.paused}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{automation.daily_limit}/day</span>
                </div>
                <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">{automation.prompt}</p>
                {automation.sequence && (
                  <p className="mt-1 text-xs text-muted-foreground">{automation.sequence.name}</p>
                )}
              </div>
              <div className="flex gap-2">
                {automation.status === 'active' ? (
                  <Button variant="outline" size="sm" onClick={() => updateAutomation(automation.id, 'paused')} disabled={actingId === automation.id}>
                    {actingId === automation.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pause className="h-4 w-4" />}
                    {t.launch.automation.pause}
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => updateAutomation(automation.id, 'active')} disabled={actingId === automation.id}>
                    {actingId === automation.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                    {t.launch.automation.resume}
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => updateAutomation(automation.id, 'archived')} disabled={actingId === automation.id}>
                  <Trash2 className="h-4 w-4" />
                  {t.launch.automation.archive}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
