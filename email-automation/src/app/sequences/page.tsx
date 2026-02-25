'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CompactStatsBar } from '@/components/compact-stats-bar';
import { SequenceBuilderSheet } from '@/components/sequence-builder-sheet';
import { SiteHeader } from '@/components/site-header';
import { toast } from 'sonner';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Plus, Loader2, Zap, Layers, Users, MoreHorizontal, Play, Pause, Trash2, Pencil } from 'lucide-react';

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

  // Sheet state
  const [selectedSequenceId, setSelectedSequenceId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

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

  useEffect(() => {
    fetchSequences();
  }, []);

  const handleCreate = async () => {
    try {
      const response = await fetch('/api/sequences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Nouvelle séquence', description: '' }),
      });

      if (response.ok) {
        const { sequence } = await response.json();
        // Open in sheet instead of navigating
        setSelectedSequenceId(sequence.id);
        setSheetOpen(true);
        fetchSequences();
      } else {
        toast.error('Erreur lors de la création');
      }
    } catch {
      toast.error('Erreur lors de la création');
    }
  };

  const openSequence = (id: string) => {
    setSelectedSequenceId(id);
    setSheetOpen(true);
  };

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

  const activeCount = sequences.filter(s => s.status === 'active').length;
  const totalEnrollments = sequences.reduce((sum, s) => sum + s.enrollment_count, 0);

  return (
    <>
      <SiteHeader title="Séquences" />
      <div className="page-container">
        <div className="page-content">
          {/* Toolbar */}
          <div className="flex items-center justify-between gap-3">
            <CompactStatsBar stats={[
              { label: 'Total', value: sequences.length },
              { label: 'Actives', value: activeCount },
              { label: 'Inscrits', value: totalEnrollments },
            ]} />
            <Button size="sm" onClick={handleCreate}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Nouvelle séquence
            </Button>
          </div>

          {/* Table */}
          {loading ? (
            <div className="flex items-center justify-center flex-1">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : sequences.length === 0 ? (
            <div className="flex flex-col items-center justify-center flex-1 text-center">
              <Zap className="h-10 w-10 text-muted-foreground mb-3" />
              <h3 className="text-sm font-medium mb-1">Aucune séquence</h3>
              <p className="text-xs text-muted-foreground mb-4">
                Créez votre première séquence pour automatiser vos emails
              </p>
              <Button size="sm" onClick={handleCreate}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Créer une séquence
              </Button>
            </div>
          ) : (
            <div className="table-container">
              <Table>
                <TableHeader className="bg-muted/50 sticky top-0 z-10">
                  <TableRow>
                    <TableHead className="text-xs">Nom</TableHead>
                    <TableHead className="text-xs">Statut</TableHead>
                    <TableHead className="text-xs">Étapes</TableHead>
                    <TableHead className="text-xs">Inscrits</TableHead>
                    <TableHead className="text-xs">Créé par</TableHead>
                    <TableHead className="text-xs">Date</TableHead>
                    <TableHead className="text-xs w-[60px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sequences.map((seq) => {
                    const badge = statusBadge[seq.status] || statusBadge.draft;
                    return (
                      <TableRow
                        key={seq.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => openSequence(seq.id)}
                      >
                        <TableCell className="py-2">
                          <div>
                            <div className="text-sm font-medium">{seq.name}</div>
                            {seq.description && (
                              <div className="text-xs text-muted-foreground truncate max-w-xs">{seq.description}</div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="py-2">
                          <Badge variant={badge.variant} className="text-xs">{badge.label}</Badge>
                        </TableCell>
                        <TableCell className="py-2">
                          <span className="flex items-center gap-1 text-sm font-mono">
                            <Layers className="h-3 w-3 text-muted-foreground" />
                            {seq.step_count}
                          </span>
                        </TableCell>
                        <TableCell className="py-2">
                          <span className="flex items-center gap-1 text-sm font-mono">
                            <Users className="h-3 w-3 text-muted-foreground" />
                            {seq.enrollment_count}
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
                              <DropdownMenuItem onClick={() => openSequence(seq.id)}>
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

      {/* Builder sheet */}
      <SequenceBuilderSheet
        sequenceId={selectedSequenceId}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onSequenceUpdated={fetchSequences}
      />
    </>
  );
}
