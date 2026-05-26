'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ChevronRight, Loader2, Radio } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api';
import { useTranslation } from '@/lib/i18n';
import { cn } from '@/lib/utils';

interface ActivitySession {
  id: string;
  prompt: string;
  status: string;
  error: string | null;
  updated_at: string;
}

interface ActivityEvent {
  id: string;
  session_id: string;
  kind: string;
  title: string;
  detail: string | null;
  status: 'running' | 'failed' | 'complete';
  updated_at: string;
  session?: ActivitySession | ActivitySession[] | null;
}

interface ActivityResponse {
  events: ActivityEvent[];
  sessions: ActivitySession[];
}

function eventSession(event: ActivityEvent) {
  if (Array.isArray(event.session)) return event.session[0] || null;
  return event.session || null;
}

export function OutreachActivityStrip({ className }: { className?: string }) {
  const { t } = useTranslation();
  const [activity, setActivity] = useState<ActivityResponse>({ events: [], sessions: [] });
  const [loading, setLoading] = useState(false);

  const loadActivity = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiFetch('/api/outreach/activity');
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        setActivity({
          events: data.events || [],
          sessions: data.sessions || [],
        });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadActivity();
    const interval = setInterval(loadActivity, 10_000);
    return () => clearInterval(interval);
  }, [loadActivity]);

  const runningEvents = activity.events.filter((event) => event.status === 'running');
  const failedEvents = activity.events.filter((event) => event.status === 'failed');
  const runningSessions = activity.sessions.filter((session) => !runningEvents.some((event) => event.session_id === session.id));
  const visibleItems = useMemo(() => [...runningEvents, ...failedEvents].slice(0, 3), [failedEvents, runningEvents]);

  if (!visibleItems.length && !runningSessions.length) return null;

  const primary = visibleItems[0];
  const primarySession = primary ? eventSession(primary) : runningSessions[0];
  const href = primarySession?.id ? `/launch?thread=${primarySession.id}` : '/launch';
  const runningCount = runningEvents.length + runningSessions.length;

  return (
    <section className={cn('rounded-lg border bg-background px-3 py-2.5 shadow-xs', className)}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className={cn(
            'mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border',
            failedEvents.length ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'
          )}>
            {failedEvents.length ? <AlertCircle className="h-4 w-4" /> : <Radio className="h-4 w-4" />}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium">
                {failedEvents.length ? t.outreachActivity.needsAttention : t.outreachActivity.running(runningCount)}
              </p>
              {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            </div>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {primary
                ? `${primary.title}${primary.detail ? ` · ${primary.detail}` : ''}`
                : primarySession?.prompt || t.outreachActivity.sessionRunning}
            </p>
          </div>
        </div>

        <Button asChild variant="outline" size="sm" className="shrink-0">
          <Link href={href}>
            {t.outreachActivity.open}
            <ChevronRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </section>
  );
}
