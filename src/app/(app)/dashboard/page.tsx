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
import { Loader2, Mail } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

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

function RecentSendsTable({ data, onClickContact }: { data: any[]; onClickContact: (id: string) => void }) {
  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 rounded-lg border bg-card py-8">
        <Mail className="h-10 w-10 text-muted-foreground mb-3" />
        <h3 className="text-sm font-medium mb-1">Aucun envoi récent</h3>
        <p className="text-xs text-muted-foreground">Les emails envoyés apparaîtront ici</p>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-auto rounded-lg border bg-card">
      <table className="text-sm border-collapse w-full">
        <thead className="bg-muted/50 sticky top-0 z-10">
          <tr className="border-b">
            <th className="h-9 px-3 text-left text-xs font-medium whitespace-nowrap">Destinataire</th>
            <th className="h-9 px-3 text-left text-xs font-medium whitespace-nowrap">Agence</th>
            <th className="h-9 px-3 text-left text-xs font-medium whitespace-nowrap">Statut</th>
            <th className="h-9 px-3 text-left text-xs font-medium whitespace-nowrap">Date</th>
            <th className="h-9 px-3 text-left text-xs font-medium whitespace-nowrap">Propriétaire</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row: any) => {
            const contact = row.contacts;
            const sentDate = row.sent_at ? format(new Date(row.sent_at), 'dd MMM yyyy', { locale: fr }) : '—';
            const ownerName = row.sent_by_email ? row.sent_by_email.split('@')[0].replace(/[._-]/g, ' ') : '—';

            return (
              <tr
                key={row.id}
                className="border-b hover:bg-muted/30 transition-colors cursor-pointer"
                onClick={() => contact?.id && onClickContact(contact.id)}
              >
                <td className="px-3 py-1.5">
                  <div className="font-medium text-sm">
                    {contact?.first_name || '—'} {contact?.last_name || ''}
                  </div>
                  <div className="text-xs text-muted-foreground font-mono">{contact?.email || '—'}</div>
                </td>
                <td className="px-3 py-1.5 text-sm text-muted-foreground">
                  {contact?.company_name || '—'}
                </td>
                <td className="px-3 py-1.5">
                  <ContactStatusBadge status={contact?.status || 'new'} />
                </td>
                <td className="px-3 py-1.5 text-xs text-muted-foreground font-mono whitespace-nowrap">
                  {sentDate}
                </td>
                <td className="px-3 py-1.5 text-sm text-muted-foreground capitalize">
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
        <SiteHeader title="Dashboard" />
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
      <SiteHeader title="Dashboard" />
      <div className="page-container">
        <Tabs defaultValue="team" className="flex flex-col flex-1 min-h-0">
          <div className="flex items-center justify-between px-4 lg:px-6 pt-3">
            <TabsList className="h-8">
              <TabsTrigger value="team" className="text-xs">Équipe</TabsTrigger>
              <TabsTrigger value="personal" className="text-xs">Mon activité</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="team" className="flex flex-col flex-1 min-h-0 mt-0">
            <div className="page-content">
              {/* Stats bar */}
              <CompactStatsBar stats={[
                { label: 'Contacts', value: teamStats?.totalContacts || 0 },
                { label: 'Leads chauds', value: teamStats?.hotLeadsCount || 0 },
                { label: "Emails aujourd'hui", value: teamStats?.emailsToday || 0 },
                { label: 'Taux réponse', value: `${teamStats?.replyRate || 0}%` },
              ]} />

              {/* Team members - compact */}
              {teamStats?.perUser && teamStats.perUser.length > 0 && (
                <div className="rounded-lg border bg-card shrink-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Membre</TableHead>
                        <TableHead className="text-xs">Contacts</TableHead>
                        <TableHead className="text-xs">Emails aujourd&apos;hui</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {teamStats.perUser.map((member, i) => (
                        <TableRow key={i}>
                          <TableCell className="py-1.5">
                            <div>
                              <span className="text-sm font-medium">{member.name}</span>
                              <span className="text-xs text-muted-foreground ml-2">{member.email}</span>
                            </div>
                          </TableCell>
                          <TableCell className="py-1.5 font-mono text-sm">{member.contacts}</TableCell>
                          <TableCell className="py-1.5">
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
                  <p className="text-xs font-medium text-muted-foreground shrink-0">Leads chauds (IA)</p>
                  <div className="rounded-lg border bg-card shrink-0">
                    <table className="text-sm border-collapse w-full">
                      <thead className="bg-muted/50">
                        <tr className="border-b">
                          <th className="h-9 px-3 text-left text-xs font-medium">Contact</th>
                          <th className="h-9 px-3 text-left text-xs font-medium">Agence</th>
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
                            <td className="px-3 py-1.5">
                              <div className="font-medium text-sm">
                                {lead.first_name || '—'} {lead.last_name || ''}
                              </div>
                              <div className="text-xs text-muted-foreground font-mono">{lead.email}</div>
                            </td>
                            <td className="px-3 py-1.5 text-sm text-muted-foreground">
                              {lead.company_name || '—'}
                            </td>
                            <td className="px-3 py-1.5">
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

              {/* Recent sends - scrollable table matching contacts page style */}
              <p className="text-xs font-medium text-muted-foreground shrink-0">Envois récents</p>
              <RecentSendsTable
                data={teamStats?.recentSends || []}
                onClickContact={handleClickContact}
              />
            </div>
          </TabsContent>

          <TabsContent value="personal" className="flex flex-col flex-1 min-h-0 mt-0">
            <div className="page-content">
              <CompactStatsBar stats={[
                { label: 'Mes contacts', value: myStats?.myContacts || 0 },
                { label: "Emails aujourd'hui", value: myStats?.myEmailsToday || 0 },
                { label: 'Taux réponse', value: `${myStats?.myReplyRate || 0}%` },
              ]} />

              <p className="text-xs font-medium text-muted-foreground shrink-0">Mes envois récents</p>
              <RecentSendsTable
                data={myStats?.myRecentSends || []}
                onClickContact={handleClickContact}
              />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
