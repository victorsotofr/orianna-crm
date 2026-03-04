'use client';

import { useState, useEffect } from 'react';
import { useBackgroundJobs, type BackgroundJob } from '@/lib/background-jobs';
import { useTranslation } from '@/lib/i18n';
import { Loader2, CheckCircle2, XCircle, ChevronDown, ChevronUp, X, AlertTriangle } from 'lucide-react';

function ElapsedTimer({ startedAt }: { startedAt: number }) {
  const [elapsed, setElapsed] = useState(() => Math.floor((Date.now() - startedAt) / 1000));

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  return <span className="tabular-nums">{mins}:{secs.toString().padStart(2, '0')}</span>;
}

function getTypeName(job: BackgroundJob, t: any): string {
  const typeNames: Record<string, string> = {
    enrich: t.backgroundJobs.types.enrich,
    score: t.backgroundJobs.types.score,
    personalize: t.backgroundJobs.types.personalize,
    ai_search: t.backgroundJobs.types.aiSearch,
    email_send: t.backgroundJobs.types.emailSend,
  };
  return typeNames[job.type] || job.type;
}

function getJobMessage(job: BackgroundJob, t: any): string {
  const typeName = getTypeName(job, t);

  if (job.status === 'running') {
    if (job.type === 'email_send' && job.totalCount) {
      return t.backgroundJobs.emailProgress(job.processedCount || 0, job.totalCount);
    }
    if (job.type === 'ai_search') {
      return t.backgroundJobs.aiSearchRunning;
    }
    return t.backgroundJobs.running(typeName, job.contactIds.length);
  }
  if (job.status === 'completed') {
    if (job.type === 'email_send') {
      return t.backgroundJobs.emailCompleted(job.resultCount ?? 0);
    }
    if (job.type === 'ai_search') {
      return t.backgroundJobs.aiSearchCompleted(job.resultCount ?? 0);
    }
    return t.backgroundJobs.completed(typeName, job.resultCount ?? job.contactIds.length);
  }
  return t.backgroundJobs.failed(typeName, job.error || 'Unknown');
}

export function BackgroundJobsPanel() {
  const { t } = useTranslation();
  const { jobs, dismissJob, clearCompleted, hasRunningJobs } = useBackgroundJobs();
  const [minimized, setMinimized] = useState(false);

  const visibleJobs = jobs;
  const runningCount = visibleJobs.filter(j => j.status === 'running').length;
  const hasJobs = visibleJobs.length > 0;

  if (!hasJobs) return null;

  if (minimized) {
    return (
      <button
        onClick={() => setMinimized(false)}
        className="fixed bottom-20 right-4 z-40 flex items-center gap-1.5 bg-background border shadow-lg rounded-full px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
      >
        {runningCount > 0 && <Loader2 className="h-3 w-3 animate-spin" />}
        {t.backgroundJobs.badge(visibleJobs.length)}
        <ChevronUp className="h-3 w-3" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-20 right-4 z-40 w-80 bg-background border shadow-lg rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
        <span className="text-xs font-medium">{t.backgroundJobs.title}</span>
        <div className="flex items-center gap-1">
          {visibleJobs.some(j => j.status !== 'running') && (
            <button
              onClick={clearCompleted}
              className="text-[10px] text-muted-foreground hover:text-foreground transition-colors px-1"
            >
              {t.backgroundJobs.clearAll}
            </button>
          )}
          <button
            onClick={() => setMinimized(true)}
            className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Warning banner */}
      {hasRunningJobs && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-900">
          <AlertTriangle className="h-3 w-3 text-amber-600 shrink-0" />
          <p className="text-[10px] text-amber-700 dark:text-amber-400">{t.backgroundJobs.doNotClose}</p>
        </div>
      )}

      {/* Jobs list */}
      <div className="max-h-60 overflow-y-auto">
        {visibleJobs.map(job => (
          <div key={job.id} className="flex items-start gap-2 px-3 py-2 border-b last:border-b-0">
            <div className="mt-0.5 shrink-0">
              {job.status === 'running' && (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
              )}
              {job.status === 'completed' && (
                <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
              )}
              {job.status === 'failed' && (
                <XCircle className="h-3.5 w-3.5 text-red-500" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs leading-snug">
                {getJobMessage(job, t)}
              </p>
              {job.status === 'running' && (
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  <ElapsedTimer startedAt={job.startedAt} />
                </p>
              )}
            </div>
            <button
              onClick={() => dismissJob(job.id)}
              className="shrink-0 text-muted-foreground hover:text-foreground transition-colors p-0.5 mt-0.5"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
