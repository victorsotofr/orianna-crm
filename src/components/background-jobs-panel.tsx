'use client';

import { useState, useEffect } from 'react';
import { useBackgroundJobs, type BackgroundJob } from '@/lib/background-jobs';
import { useTranslation } from '@/lib/i18n';
import { Loader2, CheckCircle2, XCircle, ChevronDown, ChevronUp, X } from 'lucide-react';

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
  };
  return typeNames[job.type] || job.type;
}

export function BackgroundJobsPanel() {
  const { t } = useTranslation();
  const { jobs, dismissJob, clearCompleted } = useBackgroundJobs();
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
                {job.status === 'running' && t.backgroundJobs.running(getTypeName(job, t), job.contactIds.length)}
                {job.status === 'completed' && t.backgroundJobs.completed(getTypeName(job, t), job.resultCount ?? job.contactIds.length)}
                {job.status === 'failed' && t.backgroundJobs.failed(getTypeName(job, t), job.error || 'Unknown')}
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
