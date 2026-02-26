'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SiteHeader } from '@/components/site-header';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Save, Play, Pause, Users, Mail, Clock, Archive } from 'lucide-react';
import type { Sequence, SequenceStep, Template, Contact } from '@/types/database';

interface StepWithTemplate extends SequenceStep {
  templates?: { id: string; name: string; subject: string } | null;
}

interface StepStat {
  step_id: string;
  step_order: number;
  total_sent: number;
  total_opened: number;
  total_replied: number;
  total_bounced: number;
}

interface SequenceDetail {
  sequence: Sequence;
  steps: StepWithTemplate[];
  stats: { active: number; completed: number; total: number };
  enrolledContactIds: string[];
}

const STEP_LABELS = ['Premier Contact', 'Première Relance', 'Dernier Contact'];
const STEP_COLORS = [
  { bg: 'bg-blue-50 dark:bg-blue-950/40', border: 'border-blue-200 dark:border-blue-800', text: 'text-blue-700 dark:text-blue-300', numBg: 'bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-400' },
  { bg: 'bg-orange-50 dark:bg-orange-950/40', border: 'border-orange-200 dark:border-orange-800', text: 'text-orange-700 dark:text-orange-300', numBg: 'bg-orange-100 text-orange-600 dark:bg-orange-900 dark:text-orange-400' },
  { bg: 'bg-red-50 dark:bg-red-950/40', border: 'border-red-200 dark:border-red-800', text: 'text-red-700 dark:text-red-300', numBg: 'bg-red-100 text-red-600 dark:bg-red-900 dark:text-red-400' },
];

const statusBadge: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  draft: { label: 'Brouillon', variant: 'secondary' },
  active: { label: 'Active', variant: 'default' },
  paused: { label: 'Pausée', variant: 'outline' },
  archived: { label: 'Archivée', variant: 'destructive' },
};

export default function SequenceDetailPage() {
  const router = useRouter();
  const params = useParams();
  const sequenceId = params.id as string;

  const [data, setData] = useState<SequenceDetail | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [stepStats, setStepStats] = useState<StepStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Editable fields
  const [name, setName] = useState('');

  // Step edits: template_id and delay_days for each of the 3 steps
  const [stepEdits, setStepEdits] = useState<{ template_id: string; delay_days: number }[]>([]);

  // Enroll form
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [enrolling, setEnrolling] = useState(false);

  useEffect(() => {
    fetchAll();
  }, [sequenceId]);

  const fetchAll = async () => {
    try {
      const [seqRes, tplRes, contactsRes, statsRes] = await Promise.all([
        fetch(`/api/sequences/${sequenceId}`),
        fetch('/api/templates'),
        fetch('/api/contacts?limit=500'),
        fetch(`/api/sequences/${sequenceId}/stats`),
      ]);

      if (seqRes.ok) {
        const d: SequenceDetail = await seqRes.json();
        setData(d);
        setName(d.sequence.name);
        // Initialize step edits from existing steps
        const edits = d.steps
          .sort((a, b) => a.step_order - b.step_order)
          .map(s => ({
            template_id: s.template_id || '',
            delay_days: s.delay_days,
          }));
        // Ensure we always have 3 entries
        while (edits.length < 3) {
          edits.push({ template_id: '', delay_days: edits.length === 0 ? 0 : 3 });
        }
        setStepEdits(edits.slice(0, 3));
      }

      if (tplRes.ok) {
        const { templates: tpls } = await tplRes.json();
        setTemplates(tpls || []);
      }

      if (contactsRes.ok) {
        const { contacts: cts } = await contactsRes.json();
        setContacts(cts || []);
      }

      if (statsRes.ok) {
        const { stats: ss } = await statsRes.json();
        setStepStats(ss || []);
      }
    } catch (error) {
      console.error('Error loading sequence:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!data) return;

    // Validate
    for (let i = 0; i < 3; i++) {
      if (!stepEdits[i]?.template_id) {
        toast.error(`Sélectionnez un template pour l'étape ${i + 1}`);
        return;
      }
    }
    if (stepEdits[1].delay_days < 1 || stepEdits[2].delay_days < 1) {
      toast.error('Les délais des étapes 2 et 3 doivent être d\'au moins 1 jour');
      return;
    }

    setSaving(true);
    try {
      // Update sequence name
      const nameRes = await fetch(`/api/sequences/${sequenceId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!nameRes.ok) throw new Error('Failed to update name');

      // Update each step
      const steps = data.steps.sort((a, b) => a.step_order - b.step_order);
      for (let i = 0; i < Math.min(steps.length, 3); i++) {
        await fetch(`/api/sequences/${sequenceId}/steps/${steps[i].id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            template_id: stepEdits[i].template_id,
            delay_days: i === 0 ? 0 : stepEdits[i].delay_days,
          }),
        });
      }

      toast.success('Séquence mise à jour');
      fetchAll();
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
        toast.error(result.error || "Erreur lors de l'activation");
      }
    } catch {
      toast.error("Erreur lors de l'activation");
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

  const handleArchive = async () => {
    if (!confirm('Archiver cette séquence ?')) return;
    try {
      await fetch(`/api/sequences/${sequenceId}`, { method: 'DELETE' });
      toast.success('Séquence archivée');
      router.push('/sequences');
    } catch {
      toast.error('Erreur');
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

  const updateStepEdit = (index: number, field: 'template_id' | 'delay_days', value: string | number) => {
    setStepEdits(prev => prev.map((s, i) => i === index ? { ...s, [field]: value } : s));
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

  const { sequence, stats } = data;
  const badge = statusBadge[sequence.status] || statusBadge.draft;
  const isDraft = sequence.status === 'draft';
  const isActive = sequence.status === 'active';
  const isPaused = sequence.status === 'paused';
  const enrolledSet = new Set(data.enrolledContactIds || []);

  return (
    <>
      <SiteHeader title={sequence.name} />
      <div className="flex flex-1 flex-col">
        <div className="flex flex-1 flex-col gap-4 py-4 md:gap-6 md:py-6 px-4 lg:px-6 max-w-3xl mx-auto w-full">
          {/* Top bar */}
          <div className="flex items-center justify-between">
            <Button variant="ghost" onClick={() => router.push('/sequences')}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Retour
            </Button>
            <div className="flex items-center gap-2">
              <Badge variant={badge.variant}>{badge.label}</Badge>
              {(isDraft || isPaused) && (
                <Button size="sm" onClick={handleActivate}>
                  <Play className="mr-1.5 h-3.5 w-3.5" />
                  Activer
                </Button>
              )}
              {isActive && (
                <Button variant="outline" size="sm" onClick={handlePause}>
                  <Pause className="mr-1.5 h-3.5 w-3.5" />
                  Pause
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={handleArchive} className="text-destructive hover:text-destructive">
                <Archive className="mr-1.5 h-3.5 w-3.5" />
                Archiver
              </Button>
            </div>
          </div>

          <Tabs defaultValue="steps" className="space-y-4">
            <TabsList>
              <TabsTrigger value="steps">Étapes</TabsTrigger>
              <TabsTrigger value="enroll">Inscrits</TabsTrigger>
              <TabsTrigger value="stats">Statistiques</TabsTrigger>
            </TabsList>

            {/* Steps tab */}
            <TabsContent value="steps" className="space-y-4">
              {/* Sequence name */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Nom de la séquence</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>

              {/* 3 step cards */}
              <div className="space-y-3">
                {[0, 1, 2].map((idx) => {
                  const color = STEP_COLORS[idx];
                  const stat = stepStats.find(s => s.step_order === idx + 1);

                  return (
                    <div key={idx}>
                      {/* Connector between steps */}
                      {idx > 0 && (
                        <div className="flex flex-col items-center gap-1 py-2">
                          <div className="w-px h-3 bg-border" />
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted px-2.5 py-0.5 rounded-full">
                            <Clock className="h-3 w-3" />
                            Si pas de réponse
                          </div>
                          <div className="w-px h-3 bg-border" />
                        </div>
                      )}

                      <div className={`border rounded-lg overflow-hidden ${color.border}`}>
                        <div className={`${color.bg} border-b px-4 py-2.5 flex items-center gap-3`}>
                          <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${color.numBg} text-sm font-bold`}>
                            {idx + 1}
                          </div>
                          <p className={`text-sm font-semibold ${color.text}`}>{STEP_LABELS[idx]}</p>
                        </div>
                        <div className="p-4 space-y-3">
                          <div className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground">Template d&apos;email</Label>
                            <Select
                              value={stepEdits[idx]?.template_id || ''}
                              onValueChange={(v) => updateStepEdit(idx, 'template_id', v)}
                            >
                              <SelectTrigger className="h-9">
                                <SelectValue placeholder="Sélectionner un template..." />
                              </SelectTrigger>
                              <SelectContent>
                                {templates.map((tpl) => (
                                  <SelectItem key={tpl.id} value={tpl.id}>
                                    {tpl.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          {idx === 0 ? (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Clock className="h-3.5 w-3.5" />
                              <span>Envoi immédiat</span>
                            </div>
                          ) : (
                            <div className="space-y-1.5">
                              <Label className="text-xs text-muted-foreground">
                                Délai après l&apos;Étape {idx}
                              </Label>
                              <div className="flex items-center gap-2">
                                <Input
                                  type="number"
                                  min={1}
                                  value={stepEdits[idx]?.delay_days || ''}
                                  onChange={(e) => updateStepEdit(idx, 'delay_days', parseInt(e.target.value) || 1)}
                                  className="w-20 h-9"
                                />
                                <span className="text-sm text-muted-foreground">jours</span>
                              </div>
                            </div>
                          )}

                          {/* Step stats if available */}
                          {stat && stat.total_sent > 0 && (
                            <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1 border-t">
                              <span>{stat.total_sent} envoyés</span>
                              <span>{stat.total_opened} ouverts ({stat.total_sent > 0 ? Math.round(stat.total_opened / stat.total_sent * 100) : 0}%)</span>
                              <span>{stat.total_replied} réponses ({stat.total_sent > 0 ? Math.round(stat.total_replied / stat.total_sent * 100) : 0}%)</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* End marker */}
              <div className="flex flex-col items-center gap-1 py-1">
                <div className="w-px h-4 bg-border" />
                <div className="text-xs text-muted-foreground bg-muted px-3 py-1 rounded-full">
                  Fin de la séquence
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Enregistrer
                </Button>
              </div>
            </TabsContent>

            {/* Enroll tab */}
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
                    <CardTitle className="text-base">Inscrire des contacts</CardTitle>
                    <CardDescription>
                      Sélectionnez les contacts à inscrire dans cette séquence
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {enrolledSet.size > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {enrolledSet.size} contact(s) déjà inscrit(s)
                      </p>
                    )}
                    <div className="max-h-[300px] overflow-y-auto border rounded-lg p-2 space-y-0.5">
                      {contacts.map((contact) => {
                        const alreadyEnrolled = enrolledSet.has(contact.id);
                        return (
                          <label
                            key={contact.id}
                            className={`flex items-center gap-2 p-2 rounded text-sm ${alreadyEnrolled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-muted cursor-pointer'}`}
                          >
                            <input
                              type="checkbox"
                              checked={selectedContacts.includes(contact.id)}
                              disabled={alreadyEnrolled}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedContacts([...selectedContacts, contact.id]);
                                } else {
                                  setSelectedContacts(selectedContacts.filter((id) => id !== contact.id));
                                }
                              }}
                              className="rounded"
                            />
                            <span>{contact.first_name} {contact.last_name}</span>
                            <span className="text-xs text-muted-foreground font-mono">{contact.email}</span>
                            {alreadyEnrolled && <Badge variant="outline" className="text-[10px] ml-auto">Inscrit</Badge>}
                          </label>
                        );
                      })}
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
                    <CardTitle className="text-base">Inscriptions ({stats.total})</CardTitle>
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

            {/* Stats tab */}
            <TabsContent value="stats" className="space-y-4">
              {stepStats.length === 0 || stepStats.every(s => s.total_sent === 0) ? (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    <Mail className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>Aucune statistique disponible</p>
                    <p className="text-xs mt-1">Les statistiques apparaîtront après l&apos;envoi des premiers emails</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {stepStats.map((stat, idx) => {
                    const color = STEP_COLORS[idx] || STEP_COLORS[0];
                    const openRate = stat.total_sent > 0 ? Math.round(stat.total_opened / stat.total_sent * 100) : 0;
                    const replyRate = stat.total_sent > 0 ? Math.round(stat.total_replied / stat.total_sent * 100) : 0;

                    return (
                      <Card key={stat.step_id} className={color.border}>
                        <CardHeader className={`${color.bg} py-3`}>
                          <CardTitle className={`text-sm ${color.text}`}>
                            {STEP_LABELS[idx] || `Étape ${idx + 1}`}
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="py-3">
                          <div className="grid grid-cols-4 gap-4 text-center">
                            <div>
                              <p className="text-lg font-semibold font-mono">{stat.total_sent}</p>
                              <p className="text-xs text-muted-foreground">Envoyés</p>
                            </div>
                            <div>
                              <p className="text-lg font-semibold font-mono">{stat.total_opened}</p>
                              <p className="text-xs text-muted-foreground">Ouverts ({openRate}%)</p>
                            </div>
                            <div>
                              <p className="text-lg font-semibold font-mono">{stat.total_replied}</p>
                              <p className="text-xs text-muted-foreground">Réponses ({replyRate}%)</p>
                            </div>
                            <div>
                              <p className="text-lg font-semibold font-mono">{stat.total_bounced}</p>
                              <p className="text-xs text-muted-foreground">Bounces</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </>
  );
}
