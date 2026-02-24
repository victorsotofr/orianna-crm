'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SectionCards } from '@/components/section-cards';
import { SiteHeader } from '@/components/site-header';
import { EmailsSentDataTable } from '@/components/emails-sent-data-table';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

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
    fetchStats();
  }, []);

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

  if (loading) {
    return (
      <>
        <SiteHeader title="Dashboard" />
        <div className="flex flex-1 flex-col">
          <div className="flex items-center justify-center min-h-[400px]">
            <p className="text-muted-foreground">Chargement...</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <SiteHeader title="Dashboard" />
      <div className="flex flex-1 flex-col">
        <div className="flex flex-1 flex-col gap-4 py-4 md:gap-6 md:py-6">
          <Tabs defaultValue="team">
            <div className="px-4 lg:px-6">
              <TabsList>
                <TabsTrigger value="team">Équipe</TabsTrigger>
                <TabsTrigger value="personal">Mon activité</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="team" className="space-y-4 mt-4">
              <SectionCards
                stats={teamStats ? {
                  totalContacts: teamStats.totalContacts,
                  activeSequences: teamStats.activeSequences,
                  emailsToday: teamStats.emailsToday,
                  replyRate: teamStats.replyRate,
                } : undefined}
                variant="team"
              />

              {/* Per-user breakdown */}
              {teamStats?.perUser && teamStats.perUser.length > 0 && (
                <div className="px-4 lg:px-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Activité par membre</CardTitle>
                      <CardDescription>Performance de chaque membre aujourd&apos;hui</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Membre</TableHead>
                            <TableHead>Contacts assignés</TableHead>
                            <TableHead>Emails aujourd&apos;hui</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {teamStats.perUser.map((member, i) => (
                            <TableRow key={i}>
                              <TableCell>
                                <div>
                                  <div className="font-medium">{member.name}</div>
                                  <div className="text-sm text-muted-foreground">{member.email}</div>
                                </div>
                              </TableCell>
                              <TableCell>{member.contacts}</TableCell>
                              <TableCell>
                                <Badge variant={member.emailsToday > 0 ? "default" : "secondary"}>
                                  {member.emailsToday}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Recent sends */}
              <div className="px-4 lg:px-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Envois récents</CardTitle>
                    <CardDescription>Historique de tous les emails envoyés</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <EmailsSentDataTable data={teamStats?.recentSends || []} />
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="personal" className="space-y-4 mt-4">
              <SectionCards
                stats={myStats ? {
                  totalContacts: 0,
                  myContacts: myStats.myContacts,
                  myEmailsToday: myStats.myEmailsToday,
                  myActiveEnrollments: myStats.myActiveEnrollments,
                  myReplyRate: myStats.myReplyRate,
                } : undefined}
                variant="personal"
              />

              {/* My recent sends */}
              <div className="px-4 lg:px-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Mes envois récents</CardTitle>
                    <CardDescription>Mes derniers emails envoyés</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <EmailsSentDataTable data={myStats?.myRecentSends || []} />
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </>
  );
}
