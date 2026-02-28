'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CompactStatsBar } from '@/components/compact-stats-bar';
import { SiteHeader } from '@/components/site-header';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ContactStatusBadge } from '@/components/contact-status-badge';
import { AIScoreBadge } from '@/components/ai-score-badge';
import { Badge } from '@/components/ui/badge';
import { Mail } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { useTranslation } from '@/lib/i18n';
import type { Translations } from '@/lib/i18n';

interface TeamStats {
  totalContacts: number;
  emailsToday: number;
  totalEmails: number;
  replyRate: number;
  hotLeadsCount: number;
  hotLeads: any[];
  perUser: { name: string; email: string; contacts: number; emailsToday: number }[];
  recentSends: any[];
}

interface MyStats {
  myContacts: number;
  myEmailsToday: number;
  myTotalEmails: number;
  myReplyRate: number;
  myRecentSends: any[];
}

function RecentSendsTable({ data, onClickContact, t, dateFnsLocale }: { data: any[]; onClickContact: (id: string) => void; t: Translations; dateFnsLocale: import('date-fns').Locale }) {
  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 rounded-lg border bg-card py-8">
        <Mail className="h-10 w-10 text-muted-foreground mb-3" />
        <h3 className="text-sm font-medium mb-1">{t.dashboard.emptyState.title}</h3>
        <p className="text-xs text-muted-foreground">{t.dashboard.emptyState.description}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-auto rounded-lg border bg-card">
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
            const sentDate = row.sent_at ? format(new Date(row.sent_at), 'dd MMM yyyy', { locale: dateFnsLocale }) : '—';
            const ownerName = row.sent_by_email ? row.sent_by_email.split('@')[0].replace(/[._-]/g, ' ') : '—';

            return (
              <tr
                key={row.id}
                className="border-b hover:bg-muted/30 transition-colors cursor-pointer"
                onClick={() => contact?.id && onClickContact(contact.id)}
              >
                <td className="px-3 py-1">
                  <div className="font-medium text-xs">
                    {contact?.first_name || '—'} {contact?.last_name || ''}
                  </div>
                  <div className="text-xs text-muted-foreground">{contact?.email || '—'}</div>
                </td>
                <td className="px-3 py-1 text-xs text-muted-foreground">
                  {contact?.company_name || '—'}
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [teamRes, myRes] = await Promise.all([
          fetch('/api/dashboard/team-stats'),
          fetch('/api/dashboard/my-stats'),
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
            <div className="flex gap-3 shrink-0">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 flex-1 rounded-lg" />
              ))}
            </div>
            <Skeleton className="h-[120px] rounded-lg shrink-0" />
            <Skeleton className="h-4 w-32 rounded shrink-0" />
            <div className="flex-1 min-h-0 rounded-lg border bg-card overflow-hidden">
              <div className="p-3 space-y-3">
                <Skeleton className="h-8 w-full rounded" />
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full rounded" />
                ))}
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
              {/* Stats bar */}
              <CompactStatsBar stats={[
                { label: t.dashboard.stats.contacts, value: teamStats?.totalContacts || 0 },
                { label: t.dashboard.stats.hotLeads, value: teamStats?.hotLeadsCount || 0 },
                { label: t.dashboard.stats.emailsToday, value: teamStats?.emailsToday || 0 },
                { label: t.dashboard.stats.responseRate, value: `${teamStats?.replyRate || 0}%` },
              ]} />

              {/* Team members - compact */}
              {teamStats?.perUser && teamStats.perUser.length > 0 && (
                <div className="rounded-lg border bg-card shrink-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">{t.dashboard.teamTable.member}</TableHead>
                        <TableHead className="text-xs">{t.dashboard.teamTable.contacts}</TableHead>
                        <TableHead className="text-xs">{t.dashboard.teamTable.emailsToday}</TableHead>
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
                          <TableCell className="text-xs">{member.contacts}</TableCell>
                          <TableCell>
                            <Badge variant={member.emailsToday > 0 ? "default" : "secondary"} className="font-mono text-xs">
                              {member.emailsToday}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {/* Hot leads */}
              {teamStats?.hotLeads && teamStats.hotLeads.length > 0 && (
                <>
                  <p className="text-xs font-medium text-muted-foreground shrink-0">{t.dashboard.hotLeads}</p>
                  <div className="rounded-lg border bg-card shrink-0">
                    <table className="text-sm border-collapse w-full">
                      <thead className="bg-muted/50">
                        <tr className="border-b">
                          <th className="h-9 px-3 text-left text-xs font-medium">Contact</th>
                          <th className="h-9 px-3 text-left text-xs font-medium">{t.dashboard.tableHeaders.company}</th>
                          <th className="h-9 px-3 text-left text-xs font-medium">Score</th>
                        </tr>
                      </thead>
                      <tbody>
                        {teamStats.hotLeads.map((lead: any) => (
                          <tr
                            key={lead.id}
                            className="border-b hover:bg-muted/30 transition-colors cursor-pointer"
                            onClick={() => handleClickContact(lead.id)}
                          >
                            <td className="px-3 py-1">
                              <div className="font-medium text-xs">
                                {lead.first_name || '—'} {lead.last_name || ''}
                              </div>
                              <div className="text-xs text-muted-foreground">{lead.email}</div>
                            </td>
                            <td className="px-3 py-1 text-xs text-muted-foreground">
                              {lead.company_name || '—'}
                            </td>
                            <td className="px-3 py-1">
                              <AIScoreBadge
                                score={lead.ai_score}
                                label={lead.ai_score_label}
                                reasoning={lead.ai_score_reasoning}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {/* Recent sends */}
              <p className="text-xs font-medium text-muted-foreground shrink-0">{t.dashboard.recentEmails}</p>
              <RecentSendsTable
                data={teamStats?.recentSends || []}
                onClickContact={handleClickContact}
                t={t}
                dateFnsLocale={dateFnsLocale}
              />
            </div>
          </TabsContent>

          <TabsContent value="personal" className="flex flex-col flex-1 min-h-0 mt-0">
            <div className="page-content">
              <CompactStatsBar stats={[
                { label: t.dashboard.stats.myContacts, value: myStats?.myContacts || 0 },
                { label: t.dashboard.stats.emailsToday, value: myStats?.myEmailsToday || 0 },
                { label: t.dashboard.stats.responseRate, value: `${myStats?.myReplyRate || 0}%` },
              ]} />

              <p className="text-xs font-medium text-muted-foreground shrink-0">{t.dashboard.myRecentEmails}</p>
              <RecentSendsTable
                data={myStats?.myRecentSends || []}
                onClickContact={handleClickContact}
                t={t}
                dateFnsLocale={dateFnsLocale}
              />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
