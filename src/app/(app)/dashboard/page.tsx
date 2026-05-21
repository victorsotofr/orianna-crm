'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SiteHeader } from '@/components/site-header';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ContactStatusBadge } from '@/components/contact-status-badge';
import { Bot, Flame, Loader2, MailOpen, MessageSquareText, Play, Save, Send, Target, UserCheck, Users } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { useTranslation } from '@/lib/i18n';
import type { Translations } from '@/lib/i18n';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

interface TeamStats {
  totalContacts: number;
  emailsToday: number;
  totalEmails: number;
  openRate: number;
  replyRate: number;
  hotLeadsCount: number;
  perUser: { name: string; email: string; contacts: number; totalEmails: number; emailsToday: number; opens: number; replies: number }[];
  recentSends: RecentSend[];
}

interface MyStats {
  myContacts: number;
  myEmailsToday: number;
  myTotalEmails: number;
  myOpenRate: number;
  myReplyRate: number;
  myRecentSends: RecentSend[];
}

interface RecentSend {
  id: string;
  sent_at: string | null;
  sent_by_email: string | null;
  contacts: {
    id: string;
    email: string | null;
    first_name: string | null;
    last_name: string | null;
    company_name: string | null;
    status: string | null;
  } | null;
}

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
  sequences: {
    id: string;
    name: string;
    status: string;
  }[];
}

interface GtmSettingsUpdate {
  enabled: boolean;
  requiresApproval: boolean;
  activeSequenceId: string | null;
  dailyLimit: number;
}

type GtmRunMode = 'dry_run' | 'import_prepare' | 'full_auto';

interface KpiCardProps {
  icon: React.ReactNode;
  value: string | number;
  label: string;
  iconBg: string;
}

function KpiCard({ icon, value, label, iconBg }: KpiCardProps) {
  return (
    <div className="rounded-lg border bg-card p-4 flex items-center gap-3">
      <div className={`flex items-center justify-center h-9 w-9 rounded-lg shrink-0 ${iconBg}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-2xl font-semibold font-mono tabular-nums leading-tight">{value}</div>
        <div className="text-xs text-muted-foreground truncate">{label}</div>
      </div>
    </div>
  );
}

function GtmAutopilotPanel({
  status,
  isRunning,
  isSaving,
  onRun,
  onUpdateSettings,
  t,
}: {
  status: GtmStatus | null;
  isRunning: boolean;
  isSaving: boolean;
  onRun: (mode: GtmRunMode) => void;
  onUpdateSettings: (settings: GtmSettingsUpdate) => Promise<void>;
  t: Translations;
}) {
  if (!status) return null;

  const workspace = status.workspace;
  const stateKey = [
    workspace.gtm_enabled,
    workspace.gtm_requires_approval,
    workspace.gtm_daily_contact_limit,
    workspace.gtm_active_sequence_id,
    status.sequences.length,
  ].join(':');

  return (
    <GtmAutopilotPanelContent
      key={stateKey}
      status={status}
      isRunning={isRunning}
      isSaving={isSaving}
      onRun={onRun}
      onUpdateSettings={onUpdateSettings}
      t={t}
    />
  );
}

function GtmAutopilotPanelContent({
  status,
  isRunning,
  isSaving,
  onRun,
  onUpdateSettings,
  t,
}: {
  status: GtmStatus;
  isRunning: boolean;
  isSaving: boolean;
  onRun: (mode: GtmRunMode) => void;
  onUpdateSettings: (settings: GtmSettingsUpdate) => Promise<void>;
  t: Translations;
}) {
  const gtm = t.dashboard.gtm;
  const workspace = status.workspace;
  const [enabled, setEnabled] = useState(Boolean(workspace.gtm_enabled));
  const [requiresApproval, setRequiresApproval] = useState(Boolean(workspace.gtm_requires_approval));
  const [dailyLimit, setDailyLimit] = useState(String(workspace.gtm_daily_contact_limit || 20));
  const [activeSequenceId, setActiveSequenceId] = useState(workspace.gtm_active_sequence_id || 'none');
  const selectedSequenceId = activeSequenceId === 'none' ? null : activeSequenceId;
  const parsedDailyLimit = Number(dailyLimit);
  const hasValidDailyLimit = Number.isInteger(parsedDailyLimit) && parsedDailyLimit >= 1 && parsedDailyLimit <= 100;
  const hasSettingsChanges =
    enabled !== Boolean(workspace.gtm_enabled) ||
    requiresApproval !== Boolean(workspace.gtm_requires_approval) ||
    selectedSequenceId !== workspace.gtm_active_sequence_id ||
    parsedDailyLimit !== (workspace.gtm_daily_contact_limit || 20);
  const canFullAuto = Boolean(workspace.gtm_active_sequence_id) && !workspace.gtm_requires_approval;

  const lastRunText = status.lastRun
    ? gtm.lastRunSummary(status.lastRun.status, status.lastRun.imported_count || 0, status.lastRun.enrolled_count || 0)
    : gtm.noRun;

  const handleSave = async () => {
    if (!hasValidDailyLimit) {
      toast.error(gtm.invalidLimit);
      return;
    }

    await onUpdateSettings({
      enabled,
      requiresApproval,
      activeSequenceId: selectedSequenceId,
      dailyLimit: parsedDailyLimit,
    });
  };

  return (
    <section className="rounded-lg border bg-card p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            <Bot className="h-4 w-4" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold">{gtm.title}</h3>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${workspace.gtm_enabled ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-muted text-muted-foreground'}`}>
                {workspace.gtm_enabled ? gtm.on : gtm.off}
              </span>
              {!workspace.gtm_active_sequence_id && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                  {gtm.sequenceMissing}
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {workspace.name} · {gtm.perDay(workspace.gtm_daily_contact_limit || 20)} · {workspace.gtm_requires_approval ? gtm.manualApproval : gtm.fullAuto}
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button size="sm" variant="outline" onClick={() => onRun('dry_run')} disabled={isRunning} className="gap-2">
            {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Target className="h-4 w-4" />}
            {gtm.dryRun}
          </Button>
          <Button size="sm" onClick={() => onRun('import_prepare')} disabled={isRunning} className="gap-2">
            {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {isRunning ? gtm.running : gtm.importPrepare}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => onRun('full_auto')}
            disabled={isRunning || !canFullAuto}
            className="gap-2"
          >
            {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {gtm.fullAutoRun}
          </Button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(180px,1fr)_minmax(220px,1.6fr)_120px_minmax(130px,auto)_auto] lg:items-end">
        <div className="flex items-center justify-between rounded-md border bg-background px-3 py-2">
          <Label htmlFor="gtm-enabled" className="text-xs font-medium">
            {gtm.dailyAutopilot}
          </Label>
          <Switch id="gtm-enabled" size="sm" checked={enabled} onCheckedChange={setEnabled} disabled={isSaving} />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">{gtm.activeSequence}</Label>
          <Select value={activeSequenceId} onValueChange={setActiveSequenceId} disabled={isSaving}>
            <SelectTrigger className="h-9 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{gtm.noSequence}</SelectItem>
              {status.sequences.map((sequence) => (
                <SelectItem key={sequence.id} value={sequence.id}>
                  {sequence.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="gtm-daily-limit" className="text-xs">{gtm.dailyLimit}</Label>
          <Input
            id="gtm-daily-limit"
            type="number"
            min={1}
            max={100}
            value={dailyLimit}
            onChange={(event) => setDailyLimit(event.target.value)}
            disabled={isSaving}
            className="h-9"
          />
        </div>

        <div className="flex items-center justify-between rounded-md border bg-background px-3 py-2">
          <Label htmlFor="gtm-approval" className="text-xs font-medium">
            {gtm.approvalRequired}
          </Label>
          <Switch id="gtm-approval" size="sm" checked={requiresApproval} onCheckedChange={setRequiresApproval} disabled={isSaving} />
        </div>

        <Button
          size="sm"
          variant="outline"
          onClick={handleSave}
          disabled={isSaving || !hasSettingsChanges || !hasValidDailyLimit}
          className="gap-2"
        >
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {gtm.saveSettings}
        </Button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-6">
        <div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Target className="h-3.5 w-3.5" />
            {gtm.addedToday}
          </div>
          <div className="mt-1 font-mono text-xl font-semibold tabular-nums">{status.metrics.addedToday}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">{gtm.sourcedIcp}</div>
          <div className="mt-1 font-mono text-xl font-semibold tabular-nums">{status.metrics.sourcedContacts}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">{gtm.hotSourced}</div>
          <div className="mt-1 font-mono text-xl font-semibold tabular-nums">{status.metrics.hotSourcedLeads}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">{gtm.pendingReview}</div>
          <div className="mt-1 font-mono text-xl font-semibold tabular-nums">{status.metrics.pendingReview}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">{gtm.activeEnrollments}</div>
          <div className="mt-1 font-mono text-xl font-semibold tabular-nums">{status.metrics.activeEnrollments}</div>
        </div>
        <div className="col-span-2 lg:col-span-1">
          <div className="text-xs text-muted-foreground">{gtm.lastRun}</div>
          <div className="mt-1 truncate text-xs font-medium">{lastRunText}</div>
          {status.lastRun?.error && <div className="mt-1 truncate text-xs text-destructive">{status.lastRun.error}</div>}
        </div>
      </div>
    </section>
  );
}

// 8 rows * 41px per row = 328px max visible area
const ACTIVITY_MAX_HEIGHT = 8 * 41;

function RecentActivityTable({ data, onClickContact, t, dateFnsLocale }: { data: RecentSend[]; onClickContact: (id: string) => void; t: Translations; dateFnsLocale: import('date-fns').Locale }) {
  if (data.length === 0) {
    return (
      <div className="rounded-lg border bg-card" style={{ minHeight: ACTIVITY_MAX_HEIGHT + 36 }}>
        <table className="text-sm border-collapse w-full">
          <thead className="bg-muted/50">
            <tr className="border-b">
              <th className="h-9 px-3 text-left text-xs font-medium whitespace-nowrap">{t.dashboard.tableHeaders.recipient}</th>
              <th className="h-9 px-3 text-left text-xs font-medium whitespace-nowrap">{t.dashboard.tableHeaders.company}</th>
              <th className="h-9 px-3 text-left text-xs font-medium whitespace-nowrap">{t.dashboard.tableHeaders.status}</th>
              <th className="h-9 px-3 text-left text-xs font-medium whitespace-nowrap">{t.dashboard.tableHeaders.date}</th>
              <th className="h-9 px-3 text-left text-xs font-medium whitespace-nowrap">{t.dashboard.tableHeaders.owner}</th>
            </tr>
          </thead>
        </table>
        <div className="flex items-center justify-center text-xs text-muted-foreground" style={{ height: ACTIVITY_MAX_HEIGHT }}>
          {t.dashboard.emptyState.title}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card overflow-auto" style={{ maxHeight: ACTIVITY_MAX_HEIGHT + 36 }}>
      <table className="text-sm border-collapse w-full">
        <thead className="bg-muted/50 sticky top-0 z-10">
          <tr className="border-b">
            <th className="h-9 px-3 text-left text-xs font-medium whitespace-nowrap">{t.dashboard.tableHeaders.recipient}</th>
            <th className="h-9 px-3 text-left text-xs font-medium whitespace-nowrap">{t.dashboard.tableHeaders.company}</th>
            <th className="h-9 px-3 text-left text-xs font-medium whitespace-nowrap">{t.dashboard.tableHeaders.status}</th>
            <th className="h-9 px-3 text-left text-xs font-medium whitespace-nowrap">{t.dashboard.tableHeaders.date}</th>
            <th className="h-9 px-3 text-left text-xs font-medium whitespace-nowrap">{t.dashboard.tableHeaders.owner}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => {
            const contact = row.contacts;
            const sentDate = row.sent_at ? format(new Date(row.sent_at), 'dd MMM yyyy', { locale: dateFnsLocale }) : '\u2014';
            const ownerName = row.sent_by_email ? row.sent_by_email.split('@')[0].replace(/[._-]/g, ' ') : '\u2014';

            return (
              <tr
                key={row.id}
                className="border-b hover:bg-muted/30 transition-colors cursor-pointer h-[41px]"
                onClick={() => contact?.id && onClickContact(contact.id)}
              >
                <td className="px-3 py-1">
                  <div className="font-medium text-xs">
                    {contact?.first_name || '\u2014'} {contact?.last_name || ''}
                  </div>
                  <div className="text-xs text-muted-foreground">{contact?.email || '\u2014'}</div>
                </td>
                <td className="px-3 py-1 text-xs text-muted-foreground">
                  {contact?.company_name || '\u2014'}
                </td>
                <td className="px-3 py-1">
                  <ContactStatusBadge status={contact?.status || 'new'} />
                </td>
                <td className="px-3 py-1 text-xs text-muted-foreground whitespace-nowrap">
                  {sentDate}
                </td>
                <td className="px-3 py-1 text-xs text-muted-foreground capitalize">
                  {ownerName}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const { t, dateFnsLocale } = useTranslation();
  const [teamStats, setTeamStats] = useState<TeamStats | null>(null);
  const [myStats, setMyStats] = useState<MyStats | null>(null);
  const [gtmStatus, setGtmStatus] = useState<GtmStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [gtmRunning, setGtmRunning] = useState(false);
  const [gtmSaving, setGtmSaving] = useState(false);

  const fetchStats = useCallback(async () => {
    try {
      const [teamRes, myRes, gtmRes] = await Promise.all([
        apiFetch('/api/dashboard/team-stats'),
        apiFetch('/api/dashboard/my-stats'),
        apiFetch('/api/gtm/status'),
      ]);
      if (teamRes.ok) setTeamStats(await teamRes.json());
      if (myRes.ok) setMyStats(await myRes.json());
      if (gtmRes.ok) setGtmStatus(await gtmRes.json());
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleClickContact = (contactId: string) => {
    router.push(`/contacts/${contactId}`);
  };

  const handleRunGtm = async (mode: GtmRunMode) => {
    setGtmRunning(true);
    try {
      const response = await apiFetch('/api/gtm/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || response.statusText);
      }
      await fetchStats();
      toast.success(t.dashboard.gtm.toasts.runComplete);
    } catch (error) {
      console.error('GTM run error:', error);
      toast.error(error instanceof Error ? error.message : t.dashboard.gtm.toasts.runError);
    } finally {
      setGtmRunning(false);
    }
  };

  const handleUpdateGtmSettings = async (settings: GtmSettingsUpdate) => {
    setGtmSaving(true);
    try {
      const response = await apiFetch('/api/gtm/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || response.statusText);
      }

      await fetchStats();
      toast.success(t.dashboard.gtm.toasts.saved);
    } catch (error) {
      console.error('GTM settings update error:', error);
      toast.error(error instanceof Error ? error.message : t.dashboard.gtm.toasts.saveError);
    } finally {
      setGtmSaving(false);
    }
  };

  if (loading) {
    return (
      <>
        <SiteHeader title={t.dashboard.title} />
        <div className="page-container">
          <div className="page-content">
            {/* KPI cards skeleton */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-[76px] rounded-lg" />
              ))}
            </div>
            {/* Leaderboard skeleton */}
            <div className="space-y-2">
              <Skeleton className="h-4 w-24 rounded" />
              <div className="rounded-lg border bg-card overflow-hidden">
                <div className="p-3 space-y-2">
                  <Skeleton className="h-8 w-full rounded" />
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full rounded" />
                  ))}
                </div>
              </div>
            </div>
            {/* Recent activity skeleton */}
            <div className="space-y-2">
              <Skeleton className="h-4 w-32 rounded" />
              <div className="rounded-lg border bg-card overflow-hidden">
                <div className="p-3 space-y-2">
                  <Skeleton className="h-8 w-full rounded" />
                  {Array.from({ length: 8 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full rounded" />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <SiteHeader title={t.dashboard.title} />
      <div className="page-container">
        <Tabs defaultValue="team" className="flex flex-col flex-1 min-h-0">
          <div className="flex items-center justify-between px-4 lg:px-6 pt-3">
            <TabsList className="h-8">
              <TabsTrigger value="team" className="text-xs">{t.dashboard.tabs.team}</TabsTrigger>
              <TabsTrigger value="personal" className="text-xs">{t.dashboard.tabs.myActivity}</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="team" className="flex flex-col flex-1 min-h-0 mt-0">
            <div className="page-content">
              <GtmAutopilotPanel
                status={gtmStatus}
                isRunning={gtmRunning}
                isSaving={gtmSaving}
                onRun={handleRunGtm}
                onUpdateSettings={handleUpdateGtmSettings}
                t={t}
              />

              {/* KPI Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                <KpiCard
                  icon={<Users className="h-4 w-4" />}
                  value={teamStats?.totalContacts || 0}
                  label={t.dashboard.stats.contacts}
                  iconBg="bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400"
                />
                <KpiCard
                  icon={<Flame className="h-4 w-4" />}
                  value={teamStats?.hotLeadsCount || 0}
                  label={t.dashboard.stats.hotLeads}
                  iconBg="bg-orange-100 text-orange-600 dark:bg-orange-950 dark:text-orange-400"
                />
                <KpiCard
                  icon={<Send className="h-4 w-4" />}
                  value={teamStats?.emailsToday || 0}
                  label={t.dashboard.stats.emailsToday}
                  iconBg="bg-green-100 text-green-600 dark:bg-green-950 dark:text-green-400"
                />
                <KpiCard
                  icon={<MailOpen className="h-4 w-4" />}
                  value={`${teamStats?.openRate || 0}%`}
                  label={t.dashboard.stats.openRate}
                  iconBg="bg-purple-100 text-purple-600 dark:bg-purple-950 dark:text-purple-400"
                />
                <KpiCard
                  icon={<MessageSquareText className="h-4 w-4" />}
                  value={`${teamStats?.replyRate || 0}%`}
                  label={t.dashboard.stats.responseRate}
                  iconBg="bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400"
                />
              </div>

              {/* Leaderboard */}
              {teamStats?.perUser && teamStats.perUser.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">{t.dashboard.leaderboard}</h3>
                  <div className="rounded-lg border bg-card">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">{t.dashboard.teamTable.member}</TableHead>
                          <TableHead className="text-xs text-right">{t.dashboard.teamTable.contacts}</TableHead>
                          <TableHead className="text-xs text-right">{t.dashboard.teamTable.totalEmails}</TableHead>
                          <TableHead className="text-xs text-right">{t.dashboard.teamTable.emailsToday}</TableHead>
                          <TableHead className="text-xs text-right">{t.dashboard.teamTable.opens}</TableHead>
                          <TableHead className="text-xs text-right">{t.dashboard.teamTable.replies}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {teamStats.perUser.map((member, i) => (
                          <TableRow key={i}>
                            <TableCell>
                              <div>
                                <span className="text-xs font-medium">{member.name}</span>
                                <span className="text-xs text-muted-foreground ml-2">{member.email}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-xs font-mono tabular-nums text-right">{member.contacts}</TableCell>
                            <TableCell className="text-xs font-mono tabular-nums text-right">{member.totalEmails}</TableCell>
                            <TableCell className="text-xs font-mono tabular-nums text-right">{member.emailsToday}</TableCell>
                            <TableCell className="text-xs font-mono tabular-nums text-right">{member.opens}</TableCell>
                            <TableCell className="text-xs font-mono tabular-nums text-right">{member.replies}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {/* Recent Activity */}
              <div className="space-y-2">
                <h3 className="text-sm font-medium">{t.dashboard.recentActivity}</h3>
                <RecentActivityTable
                  data={teamStats?.recentSends || []}
                  onClickContact={handleClickContact}
                  t={t}
                  dateFnsLocale={dateFnsLocale}
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="personal" className="flex flex-col flex-1 min-h-0 mt-0">
            <div className="page-content">
              {/* KPI Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <KpiCard
                  icon={<UserCheck className="h-4 w-4" />}
                  value={myStats?.myContacts || 0}
                  label={t.dashboard.stats.myContacts}
                  iconBg="bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400"
                />
                <KpiCard
                  icon={<Send className="h-4 w-4" />}
                  value={myStats?.myEmailsToday || 0}
                  label={t.dashboard.stats.emailsToday}
                  iconBg="bg-green-100 text-green-600 dark:bg-green-950 dark:text-green-400"
                />
                <KpiCard
                  icon={<MailOpen className="h-4 w-4" />}
                  value={`${myStats?.myOpenRate || 0}%`}
                  label={t.dashboard.stats.openRate}
                  iconBg="bg-purple-100 text-purple-600 dark:bg-purple-950 dark:text-purple-400"
                />
                <KpiCard
                  icon={<MessageSquareText className="h-4 w-4" />}
                  value={`${myStats?.myReplyRate || 0}%`}
                  label={t.dashboard.stats.responseRate}
                  iconBg="bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400"
                />
              </div>

              {/* My Recent Activity */}
              <div className="space-y-2">
                <h3 className="text-sm font-medium">{t.dashboard.myRecentActivity}</h3>
                <RecentActivityTable
                  data={myStats?.myRecentSends || []}
                  onClickContact={handleClickContact}
                  t={t}
                  dateFnsLocale={dateFnsLocale}
                />
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
