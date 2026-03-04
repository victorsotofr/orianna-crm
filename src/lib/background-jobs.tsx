'use client';

import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { apiFetch } from '@/lib/api';

export type JobType = 'score' | 'personalize' | 'enrich' | 'ai_search' | 'email_send';
export type JobStatus = 'running' | 'completed' | 'failed';

export interface BackgroundJob {
  id: string;
  type: JobType;
  contactIds: string[];
  status: JobStatus;
  startedAt: number;
  enrichmentId?: string;
  resultCount?: number;
  error?: string;
  dismissedAt?: number;
  label?: string; // custom display label (e.g. search query, "5 emails")
  totalCount?: number; // for progress tracking (email send)
  processedCount?: number; // current progress
}

interface BackgroundJobsContextValue {
  jobs: BackgroundJob[];
  startScoring: (contactIds: string[]) => void;
  startPersonalizing: (contactIds: string[]) => void;
  startEnrichment: (contactIds: string[]) => void;
  // Generic lifecycle methods for externally-managed jobs
  addJob: (type: JobType, opts?: { contactIds?: string[]; label?: string; totalCount?: number }) => string;
  completeJob: (jobId: string, resultCount?: number) => void;
  failJob: (jobId: string, error: string) => void;
  updateJobProgress: (jobId: string, processedCount: number) => void;
  dismissJob: (jobId: string) => void;
  clearCompleted: () => void;
  getRunningJobContactIds: (type: JobType) => Set<string>;
  onJobCompleted: (callback: () => void) => () => void;
  hasRunningJobs: boolean;
}

const BackgroundJobsContext = createContext<BackgroundJobsContextValue | null>(null);

const STORAGE_KEY = 'orianna_background_jobs';
const ENRICH_POLL_INTERVAL = 10_000;
const ENRICH_TIMEOUT = 300_000; // 5 min
const AUTO_DISMISS_DELAY = 15_000;

function generateId() {
  return `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function loadJobs(): BackgroundJob[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveJobs(jobs: BackgroundJob[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
  } catch {}
}

export function BackgroundJobProvider({ children }: { children: React.ReactNode }) {
  const [jobs, setJobs] = useState<BackgroundJob[]>(() => loadJobs());
  const completionCallbacksRef = useRef<Set<() => void>>(new Set());
  const pollIntervalsRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());
  const autoDismissTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const hasRunningJobs = jobs.some(j => j.status === 'running');

  // Persist to localStorage on every change
  useEffect(() => {
    saveJobs(jobs);
  }, [jobs]);

  // Warn user before leaving when jobs are running
  useEffect(() => {
    if (!hasRunningJobs) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasRunningJobs]);

  const notifyCompletion = useCallback(() => {
    completionCallbacksRef.current.forEach(cb => cb());
  }, []);

  const updateJob = useCallback((jobId: string, updates: Partial<BackgroundJob>) => {
    setJobs(prev => prev.map(j => j.id === jobId ? { ...j, ...updates } : j));
  }, []);

  const scheduleAutoDismiss = useCallback((jobId: string) => {
    const timer = setTimeout(() => {
      setJobs(prev => prev.filter(j => j.id !== jobId));
      autoDismissTimersRef.current.delete(jobId);
    }, AUTO_DISMISS_DELAY);
    autoDismissTimersRef.current.set(jobId, timer);
  }, []);

  const startEnrichmentPolling = useCallback((jobId: string, enrichmentId: string) => {
    const startTime = Date.now();

    const interval = setInterval(async () => {
      if (Date.now() - startTime > ENRICH_TIMEOUT) {
        clearInterval(interval);
        pollIntervalsRef.current.delete(jobId);
        updateJob(jobId, { status: 'completed', resultCount: 0 });
        notifyCompletion();
        scheduleAutoDismiss(jobId);
        return;
      }

      try {
        const res = await apiFetch(`/api/contacts/enrich/${enrichmentId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.finished) {
            clearInterval(interval);
            pollIntervalsRef.current.delete(jobId);
            updateJob(jobId, { status: 'completed', resultCount: data.updated || 0 });
            notifyCompletion();
            scheduleAutoDismiss(jobId);
          }
        }
      } catch {}
    }, ENRICH_POLL_INTERVAL);

    pollIntervalsRef.current.set(jobId, interval);
  }, [updateJob, notifyCompletion, scheduleAutoDismiss]);

  // On mount: recover orphaned jobs
  useEffect(() => {
    setJobs(prev => {
      const updated = prev.map(job => {
        if (job.status !== 'running') return job;

        if (job.type === 'enrich' && job.enrichmentId) {
          // Resume polling for enrichment jobs
          startEnrichmentPolling(job.id, job.enrichmentId);
          return job;
        }

        // ai_search / email_send: if still running after refresh, mark as failed (no way to recover)
        if (job.type === 'ai_search' || job.type === 'email_send') {
          return { ...job, status: 'failed' as const, error: 'Interrupted' };
        }

        // Score/personalize: server already wrote to DB, mark completed
        return { ...job, status: 'completed' as const };
      });

      // Schedule auto-dismiss for jobs we just marked completed/failed
      updated.forEach(job => {
        const wasPrev = prev.find(p => p.id === job.id);
        if (wasPrev?.status === 'running' && job.status !== 'running' && job.type !== 'enrich') {
          scheduleAutoDismiss(job.id);
        }
      });

      const hasNewCompletions = updated.some((j, i) => prev[i]?.status === 'running' && j.status === 'completed' && j.type !== 'enrich');
      if (hasNewCompletions) {
        // Defer notification to after render
        setTimeout(() => notifyCompletion(), 0);
      }

      return updated;
    });

    return () => {
      // Cleanup poll intervals and timers
      pollIntervalsRef.current.forEach(interval => clearInterval(interval));
      pollIntervalsRef.current.clear();
      autoDismissTimersRef.current.forEach(timer => clearTimeout(timer));
      autoDismissTimersRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startScoring = useCallback((contactIds: string[]) => {
    const jobId = generateId();
    const job: BackgroundJob = {
      id: jobId,
      type: 'score',
      contactIds,
      status: 'running',
      startedAt: Date.now(),
    };
    setJobs(prev => [...prev, job]);

    apiFetch('/api/ai/score-contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contactIds }),
    })
      .then(async res => {
        if (res.ok) {
          const { scores } = await res.json();
          const succeeded = scores.filter((s: any) => !s.error).length;
          updateJob(jobId, { status: 'completed', resultCount: succeeded });
        } else {
          updateJob(jobId, { status: 'failed', error: 'API error' });
        }
        notifyCompletion();
        scheduleAutoDismiss(jobId);
      })
      .catch(() => {
        updateJob(jobId, { status: 'failed', error: 'Network error' });
        scheduleAutoDismiss(jobId);
      });
  }, [updateJob, notifyCompletion, scheduleAutoDismiss]);

  const startPersonalizing = useCallback((contactIds: string[]) => {
    const jobId = generateId();
    const job: BackgroundJob = {
      id: jobId,
      type: 'personalize',
      contactIds,
      status: 'running',
      startedAt: Date.now(),
    };
    setJobs(prev => [...prev, job]);

    apiFetch('/api/ai/personalize-contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contactIds }),
    })
      .then(async res => {
        if (res.ok) {
          const { results } = await res.json();
          const succeeded = results.filter((r: any) => !r.error).length;
          updateJob(jobId, { status: 'completed', resultCount: succeeded });
        } else {
          updateJob(jobId, { status: 'failed', error: 'API error' });
        }
        notifyCompletion();
        scheduleAutoDismiss(jobId);
      })
      .catch(() => {
        updateJob(jobId, { status: 'failed', error: 'Network error' });
        scheduleAutoDismiss(jobId);
      });
  }, [updateJob, notifyCompletion, scheduleAutoDismiss]);

  const startEnrichment = useCallback((contactIds: string[]) => {
    const jobId = generateId();
    const job: BackgroundJob = {
      id: jobId,
      type: 'enrich',
      contactIds,
      status: 'running',
      startedAt: Date.now(),
    };
    setJobs(prev => [...prev, job]);

    apiFetch('/api/contacts/enrich', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contactIds }),
    })
      .then(async res => {
        if (res.ok) {
          const { enrichmentId } = await res.json();
          updateJob(jobId, { enrichmentId });
          startEnrichmentPolling(jobId, enrichmentId);
        } else {
          const data = await res.json().catch(() => ({}));
          updateJob(jobId, { status: 'failed', error: data.error || 'API error' });
          scheduleAutoDismiss(jobId);
        }
      })
      .catch(() => {
        updateJob(jobId, { status: 'failed', error: 'Network error' });
        scheduleAutoDismiss(jobId);
      });
  }, [updateJob, startEnrichmentPolling, scheduleAutoDismiss]);

  // Generic lifecycle: add a job tracked externally
  const addJob = useCallback((type: JobType, opts?: { contactIds?: string[]; label?: string; totalCount?: number }): string => {
    const jobId = generateId();
    const job: BackgroundJob = {
      id: jobId,
      type,
      contactIds: opts?.contactIds || [],
      status: 'running',
      startedAt: Date.now(),
      label: opts?.label,
      totalCount: opts?.totalCount,
      processedCount: 0,
    };
    setJobs(prev => [...prev, job]);
    return jobId;
  }, []);

  const completeJob = useCallback((jobId: string, resultCount?: number) => {
    updateJob(jobId, { status: 'completed', resultCount });
    notifyCompletion();
    scheduleAutoDismiss(jobId);
  }, [updateJob, notifyCompletion, scheduleAutoDismiss]);

  const failJob = useCallback((jobId: string, error: string) => {
    updateJob(jobId, { status: 'failed', error });
    scheduleAutoDismiss(jobId);
  }, [updateJob, scheduleAutoDismiss]);

  const updateJobProgress = useCallback((jobId: string, processedCount: number) => {
    updateJob(jobId, { processedCount });
  }, [updateJob]);

  const dismissJob = useCallback((jobId: string) => {
    const timer = autoDismissTimersRef.current.get(jobId);
    if (timer) {
      clearTimeout(timer);
      autoDismissTimersRef.current.delete(jobId);
    }
    const interval = pollIntervalsRef.current.get(jobId);
    if (interval) {
      clearInterval(interval);
      pollIntervalsRef.current.delete(jobId);
    }
    setJobs(prev => prev.filter(j => j.id !== jobId));
  }, []);

  const clearCompleted = useCallback(() => {
    setJobs(prev => prev.filter(j => j.status === 'running'));
  }, []);

  const getRunningJobContactIds = useCallback((type: JobType): Set<string> => {
    const ids = new Set<string>();
    jobs.forEach(j => {
      if (j.type === type && j.status === 'running') {
        j.contactIds.forEach(id => ids.add(id));
      }
    });
    return ids;
  }, [jobs]);

  const onJobCompleted = useCallback((callback: () => void): (() => void) => {
    completionCallbacksRef.current.add(callback);
    return () => {
      completionCallbacksRef.current.delete(callback);
    };
  }, []);

  return (
    <BackgroundJobsContext.Provider
      value={{
        jobs,
        startScoring,
        startPersonalizing,
        startEnrichment,
        addJob,
        completeJob,
        failJob,
        updateJobProgress,
        dismissJob,
        clearCompleted,
        getRunningJobContactIds,
        onJobCompleted,
        hasRunningJobs,
      }}
    >
      {children}
    </BackgroundJobsContext.Provider>
  );
}

export function useBackgroundJobs() {
  const ctx = useContext(BackgroundJobsContext);
  if (!ctx) throw new Error('useBackgroundJobs must be used within BackgroundJobProvider');
  return ctx;
}
