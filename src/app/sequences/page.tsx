'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CompactStatsBar } from '@/components/compact-stats-bar';
import { SiteHeader } from '@/components/site-header';
import { toast } from 'sonner';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Plus, Loader2, Zap, Users, MoreHorizontal, Play, Pause, Trash2, Pencil, Archive, RotateCcw } from 'lucide-react';

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
  const [showArchived, setShowArchived] = useState(false);

  const fetchSequences = async () => {
    try {
      const url = showArchived ? '/api/sequences?include_archived=true' : '/api/sequences';
      const response = await fetch(url);
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

  useEffect(() => {
    setLoading(true);
    fetchSequences();
  }, [showArchived]);

  const handleToggleStatus = async (id: string, currentStatus: string) => {
    try {
      if (currentStatus === 'active') {
        await fetch(`/api/sequences/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'paused' }),
        });
        toast.success('Séquence mise en pause');
      } else if (currentStatus === 'draft' || currentStatus === 'paused') {
        const res = await fetch(`/api/sequences/${id}/activate`, { method: 'POST' });
        const result = await res.json();
        if (!res.ok) { toast.error(result.error || 'Erreur'); return; }
        toast.success('Séquence activée');
      }
      fetchSequences();
    } catch {
      toast.error('Erreur');
    }
  };

  const handleArchive = async (id: string) => {
    if (!confirm('Archiver cette séquence ?')) return;
    try {
      await fetch(`/api/sequences/${id}`, { method: 'DELETE' });
      toast.success('Séquence archivée');
      fetchSequences();
    } catch {
      toast.error('Erreur');
    }
  };

  const handleRestore = async (id: string) => {
    try {
      await fetch(`/api/sequences/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'draft' }),
      });
      toast.success('Séquence restaurée');
      fetchSequences();
    } catch {
      toast.error('Erreur');
    }
  };

  const displayed = showArchived
    ? sequences
    : sequences.filter(s => s.status !== 'archived');
  const activeCount = sequences.filter(s => s.status === 'active').length;
  const archivedCount = sequences.filter(s => s.status === 'archived').length;
  const totalEnrollments = sequences.reduce((sum, s) => sum + (s.enrollment_count || 0), 0);

  return (
    <>
      <SiteHeader title="Séquences" />
      <div className="page-container">
        <div className="page-content">
          {/* Toolbar */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-4">
              <CompactStatsBar stats={[
                { label: 'Total', value: sequences.filter(s => s.status !== 'archived').length },
                { label: 'Actives', value: activeCount },
                { label: 'Inscrits', value: totalEnrollments },
              ]} />
              {archivedCount > 0 && (
                <Button
                  variant={showArchived ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setShowArchived(!showArchived)}
                  className="text-xs"
                >
                  <Archive className="mr-1.5 h-3 w-3" />
                  {showArchived ? 'Masquer archivées' : `Archivées (${archivedCount})`}
                </Button>
              )}
            </div>
            <Button size="sm" onClick={() => router.push('/sequences/new')}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Nouvelle séquence
            </Button>
          </div>

          {/* Table */}
          {loading ? (
            <div className="flex items-center justify-center flex-1">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : displayed.length === 0 ? (
            <div className="flex flex-col items-center justify-center flex-1 text-center">
              <Zap className="h-10 w-10 text-muted-foreground mb-3" />
              <h3 className="text-sm font-medium mb-1">
                {showArchived ? 'Aucune séquence archivée' : 'Aucune séquence'}
              </h3>
              <p className="text-xs text-muted-foreground mb-4">
                {showArchived ? 'Les séquences archivées apparaîtront ici' : 'Créez votre première séquence pour automatiser vos emails'}
              </p>
              {!showArchived && (
                <Button size="sm" onClick={() => router.push('/sequences/new')}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Créer une séquence
                </Button>
              )}
            </div>
          ) : (
            <div className="table-container">
              <Table>
                <TableHeader className="bg-muted/50 sticky top-0 z-10">
                  <TableRow>
                    <TableHead className="text-xs">Nom</TableHead>
                    <TableHead className="text-xs">Statut</TableHead>
                    <TableHead className="text-xs">Inscrits</TableHead>
                    <TableHead className="text-xs">Créé par</TableHead>
                    <TableHead className="text-xs">Date</TableHead>
                    <TableHead className="text-xs w-[60px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayed.map((seq) => {
                    const badge = statusBadge[seq.status] || statusBadge.draft;
                    const isArchived = seq.status === 'archived';
                    return (
                      <TableRow
                        key={seq.id}
                        className={`cursor-pointer hover:bg-muted/50 ${isArchived ? 'opacity-60' : ''}`}
                        onClick={() => router.push(`/sequences/${seq.id}`)}
                      >
                        <TableCell className="py-2">
                          <div className="text-sm font-medium">{seq.name}</div>
                        </TableCell>
                        <TableCell className="py-2">
                          <Badge variant={badge.variant} className="text-xs">{badge.label}</Badge>
                        </TableCell>
                        <TableCell className="py-2">
                          <span className="flex items-center gap-1 text-sm font-mono">
                            <Users className="h-3 w-3 text-muted-foreground" />
                            {seq.enrollment_count || 0}
                          </span>
                        </TableCell>
                        <TableCell className="py-2 text-xs text-muted-foreground">
                          {seq.created_by_name || '—'}
                        </TableCell>
                        <TableCell className="py-2 text-xs text-muted-foreground font-mono">
                          {new Date(seq.created_at).toLocaleDateString('fr-FR')}
                        </TableCell>
                        <TableCell className="py-2" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7">
                                <MoreHorizontal className="h-3.5 w-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {isArchived ? (
                                <DropdownMenuItem onClick={() => handleRestore(seq.id)}>
                                  <RotateCcw className="mr-2 h-3.5 w-3.5" />
                                  Restaurer
                                </DropdownMenuItem>
                              ) : (
                                <>
                                  <DropdownMenuItem onClick={() => router.push(`/sequences/${seq.id}`)}>
                                    <Pencil className="mr-2 h-3.5 w-3.5" />
                                    Modifier
                                  </DropdownMenuItem>
                                  {(seq.status === 'draft' || seq.status === 'paused') && (
                                    <DropdownMenuItem onClick={() => handleToggleStatus(seq.id, seq.status)}>
                                      <Play className="mr-2 h-3.5 w-3.5" />
                                      Activer
                                    </DropdownMenuItem>
                                  )}
                                  {seq.status === 'active' && (
                                    <DropdownMenuItem onClick={() => handleToggleStatus(seq.id, seq.status)}>
                                      <Pause className="mr-2 h-3.5 w-3.5" />
                                      Pause
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onClick={() => handleArchive(seq.id)} className="text-destructive">
                                    <Trash2 className="mr-2 h-3.5 w-3.5" />
                                    Archiver
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
