'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SequenceTimeline } from '@/components/sequence-timeline';
import { SiteHeader } from '@/components/site-header';
import { SequenceStatsPanel } from '@/components/sequence-stats-panel';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Save, Play, Pause, Users, Layers, CheckCircle } from 'lucide-react';
import type { Sequence, SequenceStep, Template, Contact } from '@/types/database';

interface SequenceDetail {
  sequence: Sequence;
  steps: (SequenceStep & { templates?: { id: string; name: string; subject: string } | null })[];
  stats: { active: number; completed: number; total: number };
}

export default function SequenceDetailPage() {
  const router = useRouter();
  const params = useParams();
  const sequenceId = params.id as string;

  const [data, setData] = useState<SequenceDetail | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Editable fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  // Enroll form
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [enrolling, setEnrolling] = useState(false);

  useEffect(() => {
    fetchAll();
  }, [sequenceId]);

  const fetchAll = async () => {
    try {
      const [seqRes, tplRes, contactsRes] = await Promise.all([
        fetch(`/api/sequences/${sequenceId}`),
        fetch('/api/templates'),
        fetch('/api/contacts?limit=500'),
      ]);

      if (seqRes.ok) {
        const d = await seqRes.json();
        setData(d);
        setName(d.sequence.name);
        setDescription(d.sequence.description || '');
      }

      if (tplRes.ok) {
        const { templates: tpls } = await tplRes.json();
        setTemplates(tpls || []);
      }

      if (contactsRes.ok) {
        const { contacts: cts } = await contactsRes.json();
        setContacts(cts || []);
      }
    } catch (error) {
      console.error('Error loading sequence:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch(`/api/sequences/${sequenceId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description }),
      });

      if (response.ok) {
        toast.success('Séquence mise à jour');
        fetchAll();
      } else {
        toast.error('Erreur lors de la mise à jour');
      }
    } catch {
      toast.error('Erreur lors de la mise à jour');
    } finally {
      setSaving(false);
    }
  };

  const handleActivate = async () => {
    try {
      const response = await fetch(`/api/sequences/${sequenceId}/activate`, { method: 'POST' });
      const result = await response.json();

      if (response.ok) {
        toast.success('Séquence activée');
        fetchAll();
      } else {
        toast.error(result.error || 'Erreur lors de l\'activation');
      }
    } catch {
      toast.error('Erreur lors de l\'activation');
    }
  };

  const handlePause = async () => {
    try {
      const response = await fetch(`/api/sequences/${sequenceId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'paused' }),
      });

      if (response.ok) {
        toast.success('Séquence mise en pause');
        fetchAll();
      }
    } catch {
      toast.error('Erreur');
    }
  };

  const handleAddStep = async (
    stepData: { step_type: string; template_id: string | null; delay_days: number; instructions: string | null },
    insertAfterOrder?: number
  ) => {
    const response = await fetch(`/api/sequences/${sequenceId}/steps`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...stepData,
        insert_after_order: insertAfterOrder,
      }),
    });

    if (response.ok) {
      toast.success('Étape ajoutée');
      await fetchAll();
    } else {
      const result = await response.json();
      toast.error(result.error || "Erreur lors de l'ajout");
    }
  };

  const handleDeleteStep = async (stepId: string) => {
    if (!confirm('Supprimer cette étape ?')) return;

    const response = await fetch(`/api/sequences/${sequenceId}/steps/${stepId}`, { method: 'DELETE' });
    if (response.ok) {
      toast.success('Étape supprimée');
      await fetchAll();
    } else {
      toast.error('Erreur lors de la suppression');
    }
  };

  const handleMoveStep = async (stepId: string, direction: "up" | "down") => {
    if (!data) return;
    const currentSteps = data.steps;
    const idx = currentSteps.findIndex(s => s.id === stepId);
    if (idx === -1) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= currentSteps.length) return;

    const stepA = currentSteps[idx];
    const stepB = currentSteps[swapIdx];

    try {
      await Promise.all([
        fetch(`/api/sequences/${sequenceId}/steps/${stepA.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ step_order: stepB.step_order }),
        }),
        fetch(`/api/sequences/${sequenceId}/steps/${stepB.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ step_order: stepA.step_order }),
        }),
      ]);
      await fetchAll();
    } catch {
      toast.error("Erreur lors du déplacement");
    }
  };

  const handleEnroll = async () => {
    if (selectedContacts.length === 0) {
      toast.error('Sélectionnez au moins un contact');
      return;
    }

    setEnrolling(true);
    try {
      const response = await fetch(`/api/sequences/${sequenceId}/enroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_ids: selectedContacts }),
      });

      if (response.ok) {
        const result = await response.json();
        toast.success(`${result.enrolled} contact(s) inscrit(s)${result.skipped > 0 ? `, ${result.skipped} déjà inscrit(s)` : ''}`);
        setSelectedContacts([]);
        fetchAll();
      } else {
        const result = await response.json();
        toast.error(result.error || "Erreur lors de l'inscription");
      }
    } catch {
      toast.error("Erreur lors de l'inscription");
    } finally {
      setEnrolling(false);
    }
  };

  if (loading || !data) {
    return (
      <>
        <SiteHeader title="Séquence" />
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </>
    );
  }

  const { sequence, steps, stats } = data;
  const isDraft = sequence.status === 'draft';
  const isActive = sequence.status === 'active';

  return (
    <>
      <SiteHeader title={sequence.name} />
      <div className="flex flex-1 flex-col">
        <div className="flex flex-1 flex-col gap-4 py-4 md:gap-6 md:py-6 px-4 lg:px-6">
          {/* Top bar */}
          <div className="flex items-center justify-between">
            <Button variant="ghost" onClick={() => router.push('/sequences')}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Retour
            </Button>
            <div className="flex items-center gap-2">
              <Badge variant={sequence.status === 'active' ? 'default' : 'secondary'}>
                {sequence.status === 'draft' ? 'Brouillon' :
                 sequence.status === 'active' ? 'Active' :
                 sequence.status === 'paused' ? 'Pausée' : 'Archivée'}
              </Badge>
              {isDraft && (
                <Button onClick={handleActivate} disabled={steps.length === 0}>
                  <Play className="mr-2 h-4 w-4" />
                  Activer
                </Button>
              )}
              {isActive && (
                <Button variant="outline" onClick={handlePause}>
                  <Pause className="mr-2 h-4 w-4" />
                  Pause
                </Button>
              )}
              <Button variant="outline" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Enregistrer
              </Button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Étapes</CardDescription>
                <CardTitle className="text-2xl flex items-center gap-2">
                  <Layers className="h-5 w-5 text-muted-foreground" />
                  {steps.length}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Inscrits actifs</CardDescription>
                <CardTitle className="text-2xl flex items-center gap-2">
                  <Users className="h-5 w-5 text-muted-foreground" />
                  {stats.active}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Terminés</CardDescription>
                <CardTitle className="text-2xl flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-muted-foreground" />
                  {stats.completed}
                </CardTitle>
              </CardHeader>
            </Card>
          </div>

          <Tabs defaultValue="steps" className="space-y-4">
            <TabsList>
              <TabsTrigger value="steps">Étapes</TabsTrigger>
              <TabsTrigger value="enroll">Inscrire des contacts</TabsTrigger>
              <TabsTrigger value="stats">Statistiques</TabsTrigger>
              <TabsTrigger value="settings">Paramètres</TabsTrigger>
            </TabsList>

            <TabsContent value="steps">
              <SequenceTimeline
                steps={steps}
                templates={templates}
                onAddStep={handleAddStep}
                onDeleteStep={handleDeleteStep}
                onMoveStep={handleMoveStep}
              />
            </TabsContent>

            <TabsContent value="enroll" className="space-y-4">
              {!isActive ? (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    La séquence doit être active pour inscrire des contacts.
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardHeader>
                    <CardTitle>Inscrire des contacts</CardTitle>
                    <CardDescription>
                      Sélectionnez les contacts à inscrire dans cette séquence
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="max-h-[300px] overflow-y-auto border rounded-lg p-2 space-y-1">
                      {contacts.map((contact) => (
                        <label
                          key={contact.id}
                          className="flex items-center gap-2 p-2 rounded hover:bg-muted cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={selectedContacts.includes(contact.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedContacts([...selectedContacts, contact.id]);
                              } else {
                                setSelectedContacts(selectedContacts.filter((id) => id !== contact.id));
                              }
                            }}
                            className="rounded"
                          />
                          <span className="text-sm">
                            {contact.first_name} {contact.last_name}
                          </span>
                          <span className="text-xs text-muted-foreground">{contact.email}</span>
                        </label>
                      ))}
                      {contacts.length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-4">Aucun contact disponible</p>
                      )}
                    </div>
                    <Button onClick={handleEnroll} disabled={enrolling || selectedContacts.length === 0}>
                      {enrolling ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Users className="mr-2 h-4 w-4" />}
                      Inscrire {selectedContacts.length} contact(s)
                    </Button>
                  </CardContent>
                </Card>
              )}

              {stats.total > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Inscriptions ({stats.total})</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex gap-4 text-sm">
                      <span>Actifs: {stats.active}</span>
                      <span>Terminés: {stats.completed}</span>
                      <span>Total: {stats.total}</span>
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="stats" className="space-y-4">
              <SequenceStatsPanel sequenceId={sequenceId} />
            </TabsContent>

            <TabsContent value="settings" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Paramètres de la séquence</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Nom</Label>
                    <Input value={name} onChange={(e) => setName(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
                  </div>
                  <Button onClick={handleSave} disabled={saving}>
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Enregistrer
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </>
  );
}
