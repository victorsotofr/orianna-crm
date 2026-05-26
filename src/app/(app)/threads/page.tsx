'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Archive,
  Copy,
  Edit3,
  History,
  Loader2,
  MoreHorizontal,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch } from '@/lib/api';
import { useTranslation } from '@/lib/i18n';
import { cn } from '@/lib/utils';

interface OutreachThread {
  id: string;
  prompt: string;
  title?: string | null;
  status: string;
  error: string | null;
  archived_at?: string | null;
  deleted_at?: string | null;
  last_message_at?: string | null;
  created_at: string;
  updated_at: string;
}

type ThreadFilter = 'active' | 'archived' | 'deleted';

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(url, init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || response.statusText);
  return data as T;
}

function threadLabel(thread: OutreachThread) {
  return thread.title?.trim() || thread.prompt || 'Untitled thread';
}

function threadDate(thread: OutreachThread) {
  return thread.last_message_at || thread.updated_at || thread.created_at;
}

export default function ThreadsPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [threads, setThreads] = useState<OutreachThread[]>([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ThreadFilter>('active');
  const [loading, setLoading] = useState(true);
  const [busyThreadId, setBusyThreadId] = useState<string | null>(null);

  const loadThreads = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter === 'archived') params.set('archived', 'only');
      if (filter === 'deleted') params.set('deleted', 'only');
      const data = await requestJson<{ sessions: OutreachThread[] }>(`/api/outreach/sessions${params.size ? `?${params}` : ''}`);
      setThreads(data.sessions || []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t.common.networkError);
    } finally {
      setLoading(false);
    }
  }, [filter, t.common.networkError]);

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  const filteredThreads = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return threads;
    return threads.filter((thread) => {
      const haystack = [thread.title, thread.prompt, thread.status, thread.error].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(needle);
    });
  }, [query, threads]);

  async function updateThread(thread: OutreachThread, patch: Record<string, unknown>, successMessage: string) {
    setBusyThreadId(thread.id);
    try {
      await requestJson<{ session: OutreachThread }>(`/api/outreach/sessions/${thread.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      toast.success(successMessage);
      await loadThreads();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t.common.networkError);
    } finally {
      setBusyThreadId(null);
    }
  }

  async function renameThread(thread: OutreachThread) {
    const nextTitle = window.prompt(t.threadsPage.renamePrompt, threadLabel(thread));
    if (nextTitle === null) return;
    const cleanTitle = nextTitle.trim();
    if (!cleanTitle) return;
    await updateThread(thread, { title: cleanTitle }, t.threadsPage.toasts.renamed);
  }

  async function duplicateThread(thread: OutreachThread) {
    setBusyThreadId(thread.id);
    try {
      const data = await requestJson<{ session: OutreachThread }>(`/api/outreach/sessions/${thread.id}/duplicate`, {
        method: 'POST',
      });
      toast.success(t.threadsPage.toasts.duplicated);
      router.push(`/launch?thread=${data.session.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t.common.networkError);
    } finally {
      setBusyThreadId(null);
    }
  }

  async function deleteThread(thread: OutreachThread) {
    if (!window.confirm(t.threadsPage.deleteConfirm)) return;
    setBusyThreadId(thread.id);
    try {
      await requestJson<{ session: OutreachThread }>(`/api/outreach/sessions/${thread.id}`, { method: 'DELETE' });
      toast.success(t.threadsPage.toasts.deleted);
      await loadThreads();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t.common.networkError);
    } finally {
      setBusyThreadId(null);
    }
  }

  return (
    <div className="flex h-[calc(100dvh-1rem)] min-h-0 flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col bg-muted/20 px-3 py-3 lg:px-5">
        <main className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col">
          <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-background shadow-xs">
            <header className="shrink-0 border-b px-4 py-4 sm:px-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    <History className="h-4 w-4 text-emerald-700" />
                    {t.threadsPage.title}
                  </div>
                  <h1 className="mt-1 text-xl font-semibold tracking-tight">{t.threadsPage.title}</h1>
                  <p className="mt-1 text-sm text-muted-foreground">{t.threadsPage.subtitle}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button variant="outline" size="sm" onClick={loadThreads} disabled={loading}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    {t.common.refresh}
                  </Button>
                  <Button size="sm" asChild>
                    <Link href="/launch">
                      <Plus className="h-4 w-4" />
                      {t.launch.thread.new}
                    </Link>
                  </Button>
                </div>
              </div>

              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="relative max-w-lg flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={t.threadsPage.searchPlaceholder}
                  />
                </div>
                <div className="flex rounded-lg border bg-muted/25 p-1">
                  {(['active', 'archived', 'deleted'] as ThreadFilter[]).map((value) => (
                    <Button
                      key={value}
                      type="button"
                      variant={filter === value ? 'secondary' : 'ghost'}
                      size="sm"
                      className="h-8"
                      onClick={() => setFilter(value)}
                    >
                      {t.threadsPage.filters[value]}
                    </Button>
                  ))}
                </div>
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-auto">
              {loading ? (
                <div className="grid gap-2 p-4 sm:p-5">
                  <Skeleton className="h-20 rounded-lg" />
                  <Skeleton className="h-20 rounded-lg" />
                  <Skeleton className="h-20 rounded-lg" />
                </div>
              ) : filteredThreads.length === 0 ? (
                <div className="flex min-h-[360px] items-center justify-center px-6 text-center">
                  <div className="max-w-sm">
                    <History className="mx-auto h-8 w-8 text-muted-foreground" />
                    <h2 className="mt-3 text-sm font-semibold">{t.threadsPage.emptyTitle}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">{t.threadsPage.emptyDescription}</p>
                    <Button className="mt-4" size="sm" asChild>
                      <Link href="/launch">
                        <Plus className="h-4 w-4" />
                        {t.launch.thread.new}
                      </Link>
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="divide-y">
                  {filteredThreads.map((thread) => (
                    <div key={thread.id} className="flex items-start gap-3 px-4 py-4 transition-colors hover:bg-muted/35 sm:px-5">
                      <Link href={`/launch?thread=${thread.id}`} className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="line-clamp-2 text-sm font-semibold">{threadLabel(thread)}</div>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                              <span>{new Date(threadDate(thread)).toLocaleString()}</span>
                              {thread.archived_at && <span>{t.threadsPage.archived}</span>}
                              {thread.deleted_at && <span>{t.threadsPage.deleted}</span>}
                              {thread.error && <span className="text-red-600">{thread.error}</span>}
                            </div>
                          </div>
                          <Badge className={cn('shrink-0', thread.status === 'failed' && 'border-red-200 text-red-700')} variant="outline">
                            {thread.status}
                          </Badge>
                        </div>
                      </Link>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" disabled={busyThreadId === thread.id}>
                            {busyThreadId === thread.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
                            <span className="sr-only">{t.threadsPage.actions.open}</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          {!thread.deleted_at && (
                            <>
                              <DropdownMenuItem onClick={() => void renameThread(thread)}>
                                <Edit3 className="h-4 w-4" />
                                {t.threadsPage.actions.rename}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => void duplicateThread(thread)}>
                                <Copy className="h-4 w-4" />
                                {t.threadsPage.actions.duplicate}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                            </>
                          )}
                          {thread.deleted_at ? (
                            <DropdownMenuItem onClick={() => void updateThread(thread, { restored: true }, t.threadsPage.toasts.restored)}>
                              <RotateCcw className="h-4 w-4" />
                              {t.threadsPage.actions.restore}
                            </DropdownMenuItem>
                          ) : thread.archived_at ? (
                            <DropdownMenuItem onClick={() => void updateThread(thread, { archived: false }, t.threadsPage.toasts.unarchived)}>
                              <RotateCcw className="h-4 w-4" />
                              {t.threadsPage.actions.unarchive}
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem onClick={() => void updateThread(thread, { archived: true }, t.threadsPage.toasts.archived)}>
                              <Archive className="h-4 w-4" />
                              {t.threadsPage.actions.archive}
                            </DropdownMenuItem>
                          )}
                          {!thread.deleted_at && (
                            <DropdownMenuItem variant="destructive" onClick={() => void deleteThread(thread)}>
                              <Trash2 className="h-4 w-4" />
                              {t.threadsPage.actions.delete}
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
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
