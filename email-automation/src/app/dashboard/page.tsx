'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { SectionCards } from '@/components/section-cards';
import { SiteHeader } from '@/components/site-header';
import { EmailsSentDataTable } from '@/components/emails-sent-data-table';

interface DashboardStats {
  totalContacts: number;
  emailsSentToday: number;
  totalEmailsSent: number;
  averageSendingRate: number;
  recentSends: any[];
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/dashboard/stats');
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
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
          <SectionCards stats={stats || undefined} />

          {/* Recent Sends */}
          <div className="px-4 lg:px-6">
            <Card>
              <CardHeader>
                <CardTitle>Envois récents</CardTitle>
                <CardDescription>Historique de tous les emails envoyés</CardDescription>
              </CardHeader>
              <CardContent>
                <EmailsSentDataTable data={stats?.recentSends || []} />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}

