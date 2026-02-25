'use client';

import { useEffect, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CompactStatsBar } from '@/components/compact-stats-bar';
import { SiteHeader } from '@/components/site-header';
import { EmailsSentDataTable } from '@/components/emails-sent-data-table';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';

interface TeamStats {
  totalContacts: number;
  activeSequences: number;
  emailsToday: number;
  totalEmails: number;
  replyRate: number;
  activeEnrollments: number;
  perUser: { name: string; email: string; contacts: number; emailsToday: number }[];
  recentSends: any[];
}

interface MyStats {
  myContacts: number;
  myEmailsToday: number;
  myTotalEmails: number;
  myReplyRate: number;
  myActiveEnrollments: number;
  myRecentSends: any[];
}

export default function DashboardPage() {
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

  if (loading) {
    return (
      <>
        <SiteHeader title="Dashboard" />
        <div className="page-container">
          <div className="flex items-center justify-center flex-1">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
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
                { label: 'Séquences actives', value: teamStats?.activeSequences || 0 },
                { label: "Emails aujourd'hui", value: teamStats?.emailsToday || 0 },
                { label: 'Taux réponse', value: `${teamStats?.replyRate || 0}%` },
              ]} />

              {/* Team members - compact */}
              {teamStats?.perUser && teamStats.perUser.length > 0 && (
                <div className="rounded-lg border bg-card">
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
                          <TableCell className="py-2">
                            <div>
                              <span className="text-sm font-medium">{member.name}</span>
                              <span className="text-xs text-muted-foreground ml-2">{member.email}</span>
                            </div>
                          </TableCell>
                          <TableCell className="py-2 font-mono text-sm">{member.contacts}</TableCell>
                          <TableCell className="py-2">
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

              {/* Recent sends */}
              <div className="flex-1 min-h-0">
                <p className="text-xs font-medium text-muted-foreground mb-2">Envois récents</p>
                <EmailsSentDataTable data={teamStats?.recentSends || []} />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="personal" className="flex flex-col flex-1 min-h-0 mt-0">
            <div className="page-content">
              <CompactStatsBar stats={[
                { label: 'Mes contacts', value: myStats?.myContacts || 0 },
                { label: "Emails aujourd'hui", value: myStats?.myEmailsToday || 0 },
                { label: 'Inscriptions actives', value: myStats?.myActiveEnrollments || 0 },
                { label: 'Taux réponse', value: `${myStats?.myReplyRate || 0}%` },
              ]} />

              <div className="flex-1 min-h-0">
                <p className="text-xs font-medium text-muted-foreground mb-2">Mes envois récents</p>
                <EmailsSentDataTable data={myStats?.myRecentSends || []} />
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
