'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SequenceStepCard } from '@/components/sequence-step-card';
import { EnrollmentTable } from '@/components/enrollment-table';
import { SiteHeader } from '@/components/site-header';
import { toast } from 'sonner';
import { ArrowLeft, Plus, Loader2, Save, Play, Pause, Users, Layers, CheckCircle } from 'lucide-react';
import type { Sequence, SequenceStep, SequenceEnrollment, Template, Contact } from '@/types/database';

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
  const [enrollments, setEnrollments] = useState<(SequenceEnrollment & { contacts?: Contact })[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Editable fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  // New step form
  const [newStepType, setNewStepType] = useState<string>('email');
  const [newStepTemplateId, setNewStepTemplateId] = useState<string>('');
  const [newStepDelay, setNewStepDelay] = useState('0');
  const [newStepInstructions, setNewStepInstructions] = useState('');
  const [addingStep, setAddingStep] = useState(false);

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

      // Fetch enrollments
      await fetchEnrollments();
    } catch (error) {
      console.error('Error loading sequence:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchEnrollments = async () => {
    try {
      // Use supabase client through an API - for now just refetch sequence detail which has stats
      // We'll create a simple enrollments fetch from the sequence detail
      const res = await fetch(`/api/sequences/${sequenceId}`);
      if (res.ok) {
        const d = await res.json();
        setData(d);
      }
    } catch (error) {
      console.error('Error fetching enrollments:', error);
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
    } catch (error) {
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
    } catch (error) {
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
    } catch (error) {
      toast.error('Erreur');
    }
  };

  const handleAddStep = async () => {
    setAddingStep(true);
    try {
      const response = await fetch(`/api/sequences/${sequenceId}/steps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step_type: newStepType,
          template_id: newStepType === 'email' ? newStepTemplateId || null : null,
          delay_days: parseInt(newStepDelay) || 0,
          instructions: newStepInstructions || null,
        }),
      });

      if (response.ok) {
        toast.success('Étape ajoutée');
        setNewStepType('email');
        setNewStepTemplateId('');
        setNewStepDelay('0');
        setNewStepInstructions('');
        fetchAll();
      } else {
        const result = await response.json();
        toast.error(result.error || "Erreur lors de l'ajout");
      }
    } catch (error) {
      toast.error("Erreur lors de l'ajout de l'étape");
    } finally {
      setAddingStep(false);
    }
  };

  const handleDeleteStep = async (stepId: string) => {
    if (!confirm('Supprimer cette étape ?')) return;

    try {
      const response = await fetch(`/api/sequences/${sequenceId}/steps/${stepId}`, { method: 'DELETE' });
      if (response.ok) {
        toast.success('Étape supprimée');
        fetchAll();
      }
    } catch (error) {
      toast.error('Erreur lors de la suppression');
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
    } catch (error) {
      toast.error("Erreur lors de l'inscription");
    } finally {
      setEnrolling(false);
    }
  };

  const handleEnrollmentAction = async (enrollmentId: string, action: string) => {
    try {
      const response = await fetch(`/api/enrollments/${enrollmentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });

      if (response.ok) {
        toast.success('Action effectuée');
        fetchAll();
      } else {
        toast.error("Erreur lors de l'action");
      }
    } catch (error) {
      toast.error("Erreur lors de l'action");
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
              <TabsTrigger value="settings">Paramètres</TabsTrigger>
            </TabsList>

            <TabsContent value="steps" className="space-y-4">
              {/* Existing steps */}
              {steps.length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-center py-8">
                    <p className="text-muted-foreground mb-4">Aucune étape. Ajoutez votre première étape ci-dessous.</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {steps.map((step) => (
                    <SequenceStepCard key={step.id} step={step} onDelete={handleDeleteStep} />
                  ))}
                </div>
              )}

              {/* Add step form */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Ajouter une étape</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Type</Label>
                      <Select value={newStepType} onValueChange={setNewStepType}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="email">Email</SelectItem>
                          <SelectItem value="manual_task">Tâche manuelle</SelectItem>
                          <SelectItem value="wait">Attente</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Délai (jours)</Label>
                      <Input type="number" min="0" value={newStepDelay} onChange={(e) => setNewStepDelay(e.target.value)} />
                    </div>
                  </div>

                  {newStepType === 'email' && (
                    <div className="space-y-2">
                      <Label>Template</Label>
                      <Select value={newStepTemplateId} onValueChange={setNewStepTemplateId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Sélectionner un template..." />
                        </SelectTrigger>
                        <SelectContent>
                          {templates.map((tpl) => (
                            <SelectItem key={tpl.id} value={tpl.id}>{tpl.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {newStepType === 'manual_task' && (
                    <div className="space-y-2">
                      <Label>Instructions</Label>
                      <Textarea
                        value={newStepInstructions}
                        onChange={(e) => setNewStepInstructions(e.target.value)}
                        placeholder="Instructions pour la tâche manuelle..."
                        rows={2}
                      />
                    </div>
                  )}

                  <Button onClick={handleAddStep} disabled={addingStep}>
                    {addingStep ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                    Ajouter l&apos;étape
                  </Button>
                </CardContent>
              </Card>
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

              {/* Enrollment stats summary */}
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
