'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SiteHeader } from '@/components/site-header';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmailStatusBadge } from '@/components/email-status-badge';
import { Users, Flame, Send, MailOpen, MessageSquareText, UserCheck } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { useTranslation } from '@/lib/i18n';
import type { Translations } from '@/lib/i18n';
import { apiFetch } from '@/lib/api';

interface TeamStats {
  totalContacts: number;
  emailsToday: number;
  totalEmails: number;
  openRate: number;
  replyRate: number;
  hotLeadsCount: number;
  perUser: { name: string; email: string; contacts: number; totalEmails: number; emailsToday: number; opens: number; replies: number }[];
  recentSends: any[];
}

interface MyStats {
  myContacts: number;
  myEmailsToday: number;
  myTotalEmails: number;
  myOpenRate: number;
  myReplyRate: number;
  myRecentSends: any[];
}

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

// 8 rows * 41px per row = 328px max visible area
const ACTIVITY_MAX_HEIGHT = 8 * 41;

function RecentActivityTable({ data, onClickContact, t, dateFnsLocale }: { data: any[]; onClickContact: (id: string) => void; t: Translations; dateFnsLocale: import('date-fns').Locale }) {
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
          {data.map((row: any) => {
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
                  <EmailStatusBadge status={row.status || 'sent'} />
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [teamRes, myRes] = await Promise.all([
          apiFetch('/api/dashboard/team-stats'),
          apiFetch('/api/dashboard/my-stats'),
        ]);
        if (teamRes.ok) setTeamStats(await teamRes.json());
        if (myRes.ok) setMyStats(await myRes.json());
      } catch (error) {
        console.error('Error fetching stats:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  const handleClickContact = (contactId: string) => {
    router.push(`/contacts/${contactId}`);
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
