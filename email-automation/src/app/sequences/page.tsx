'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SiteHeader } from '@/components/site-header';
import { toast } from 'sonner';
import { Plus, Zap, Users, Layers } from 'lucide-react';

interface SequenceItem {
  id: string;
  name: string;
  description: string | null;
  status: string;
  step_count: number;
  enrollment_count: number;
  created_by_name: string | null;
  created_at: string;
}

const statusBadge: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  draft: { label: "Brouillon", variant: "secondary" },
  active: { label: "Active", variant: "default" },
  paused: { label: "Pausée", variant: "outline" },
  archived: { label: "Archivée", variant: "destructive" },
};

export default function SequencesPage() {
  const router = useRouter();
  const [sequences, setSequences] = useState<SequenceItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSequences();
  }, []);

  const fetchSequences = async () => {
    try {
      const response = await fetch('/api/sequences');
      if (response.ok) {
        const data = await response.json();
        setSequences(data.sequences);
      }
    } catch (error) {
      console.error('Error fetching sequences:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    try {
      const response = await fetch('/api/sequences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Nouvelle séquence', description: '' }),
      });

      if (response.ok) {
        const { sequence } = await response.json();
        router.push(`/sequences/${sequence.id}`);
      } else {
        toast.error('Erreur lors de la création');
      }
    } catch (error) {
      toast.error('Erreur lors de la création');
    }
  };

  return (
    <>
      <SiteHeader title="Séquences" />
      <div className="flex flex-1 flex-col">
        <div className="flex flex-1 flex-col gap-4 py-4 md:gap-6 md:py-6 px-4 lg:px-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Séquences automatisées</h2>
              <p className="text-sm text-muted-foreground">
                Créez des séquences multi-étapes pour automatiser vos campagnes
              </p>
            </div>
            <Button onClick={handleCreate}>
              <Plus className="mr-2 h-4 w-4" />
              Nouvelle séquence
            </Button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center min-h-[400px]">
              <p className="text-muted-foreground">Chargement...</p>
            </div>
          ) : sequences.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Zap className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">Aucune séquence</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Créez votre première séquence pour automatiser vos emails
                </p>
                <Button onClick={handleCreate}>
                  <Plus className="mr-2 h-4 w-4" />
                  Créer une séquence
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {sequences.map((seq) => {
                const badge = statusBadge[seq.status] || statusBadge.draft;
                return (
                  <Card
                    key={seq.id}
                    className="cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => router.push(`/sequences/${seq.id}`)}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base truncate">{seq.name}</CardTitle>
                        <Badge variant={badge.variant}>{badge.label}</Badge>
                      </div>
                      {seq.description && (
                        <CardDescription className="line-clamp-2">{seq.description}</CardDescription>
                      )}
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Layers className="h-4 w-4" />
                          {seq.step_count} étape(s)
                        </div>
                        <div className="flex items-center gap-1">
                          <Users className="h-4 w-4" />
                          {seq.enrollment_count} inscrit(s)
                        </div>
                      </div>
                      {seq.created_by_name && (
                        <p className="text-xs text-muted-foreground mt-2">
                          Par {seq.created_by_name}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
