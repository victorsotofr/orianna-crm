'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SiteHeader } from '@/components/site-header';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Mail, Clock, Plus } from 'lucide-react';
import type { Template } from '@/types/database';

const STEP_LABELS = ['Premier Contact', 'Première Relance', 'Dernier Contact'];
const STEP_COLORS = [
  { bg: 'bg-blue-50 dark:bg-blue-950/40', border: 'border-blue-200 dark:border-blue-800', text: 'text-blue-700 dark:text-blue-300', numBg: 'bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-400' },
  { bg: 'bg-orange-50 dark:bg-orange-950/40', border: 'border-orange-200 dark:border-orange-800', text: 'text-orange-700 dark:text-orange-300', numBg: 'bg-orange-100 text-orange-600 dark:bg-orange-900 dark:text-orange-400' },
  { bg: 'bg-red-50 dark:bg-red-950/40', border: 'border-red-200 dark:border-red-800', text: 'text-red-700 dark:text-red-300', numBg: 'bg-red-100 text-red-600 dark:bg-red-900 dark:text-red-400' },
];

export default function NewSequencePage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [stepEdits, setStepEdits] = useState([
    { template_id: '', delay_days: 0 },
    { template_id: '', delay_days: 3 },
    { template_id: '', delay_days: 5 },
  ]);

  useEffect(() => {
    fetch('/api/templates')
      .then(res => res.json())
      .then(data => setTemplates(data.templates || []))
      .catch(() => toast.error('Erreur lors du chargement des templates'))
      .finally(() => setLoadingTemplates(false));
  }, []);

  const updateStep = (idx: number, field: 'template_id' | 'delay_days', value: string | number) => {
    setStepEdits(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error('Le nom de la séquence est obligatoire');
      return;
    }
    for (let i = 0; i < 3; i++) {
      if (!stepEdits[i].template_id) {
        toast.error(`Sélectionnez un template pour l'étape ${i + 1}`);
        return;
      }
    }
    if (stepEdits[1].delay_days < 1 || stepEdits[2].delay_days < 1) {
      toast.error("Les délais des étapes 2 et 3 doivent être d'au moins 1 jour");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch('/api/sequences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          steps: stepEdits.map(s => ({
            template_id: s.template_id,
            delay_days: s.delay_days,
          })),
        }),
      });

      if (response.ok) {
        const { sequence } = await response.json();
        toast.success('Séquence créée');
        router.push(`/sequences/${sequence.id}`);
      } else {
        const data = await response.json();
        toast.error(data.error || 'Erreur lors de la création');
      }
    } catch {
      toast.error('Erreur lors de la création');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <SiteHeader title="Nouvelle séquence" />
      <div className="flex flex-1 flex-col">
        <div className="flex flex-1 flex-col gap-4 py-3 px-4 lg:px-6">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={() => router.push('/sequences')}>
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
              Retour
            </Button>
          </div>

          {/* Sequence name */}
          <div className="flex items-center gap-3 max-w-lg">
            <Label className="text-xs text-muted-foreground shrink-0">Nom de la séquence</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Spanish Property Investors"
              className="h-9"
            />
          </div>

          {loadingTemplates ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* 3 step cards - HORIZONTAL */}
              <div className="grid grid-cols-3 gap-3 items-start">
                {[0, 1, 2].map((idx) => {
                  const color = STEP_COLORS[idx];
                  return (
                    <div key={idx} className={`border rounded-lg overflow-hidden ${color.border} flex flex-col`}>
                      {/* Header */}
                      <div className={`${color.bg} border-b px-3 py-2 flex items-center gap-2`}>
                        <div className={`flex h-6 w-6 items-center justify-center rounded-md ${color.numBg} text-xs font-bold`}>
                          {idx + 1}
                        </div>
                        <p className={`text-xs font-semibold ${color.text}`}>{STEP_LABELS[idx]}</p>
                      </div>

                      {/* Body */}
                      <div className="p-3 space-y-2.5 flex-1">
                        <div className="space-y-1">
                          <Label className="text-[11px] text-muted-foreground">Template d&apos;email</Label>
                          <Select
                            value={stepEdits[idx].template_id}
                            onValueChange={(v) => updateStep(idx, 'template_id', v)}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="Sélectionner..." />
                            </SelectTrigger>
                            <SelectContent>
                              {templates.map((tpl) => (
                                <SelectItem key={tpl.id} value={tpl.id}>
                                  {tpl.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            variant="link"
                            size="sm"
                            className="h-auto p-0 text-[11px]"
                            onClick={() => router.push('/templates')}
                          >
                            <Plus className="mr-0.5 h-3 w-3" />
                            Nouveau template
                          </Button>
                        </div>

                        {idx === 0 ? (
                          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            Envoi immédiat
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <Label className="text-[11px] text-muted-foreground">
                              Délai après Étape {idx}
                            </Label>
                            <div className="flex items-center gap-1.5">
                              <Input
                                type="number"
                                min={1}
                                value={stepEdits[idx].delay_days}
                                onChange={(e) => updateStep(idx, 'delay_days', parseInt(e.target.value) || 1)}
                                className="w-16 h-8 text-xs"
                              />
                              <span className="text-xs text-muted-foreground">jours</span>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Footer */}
                      {idx < 2 && (
                        <div className="text-center text-[10px] text-muted-foreground bg-muted/50 py-1 border-t">
                          Si pas de réponse &rarr;
                        </div>
                      )}
                      {idx === 2 && (
                        <div className="text-center text-[10px] text-muted-foreground bg-muted/50 py-1 border-t">
                          Fin de la séquence
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <Button variant="outline" size="sm" onClick={() => router.push('/sequences')}>
                  Annuler
                </Button>
                <Button size="sm" onClick={handleCreate} disabled={saving || loadingTemplates}>
                  {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Mail className="mr-1.5 h-3.5 w-3.5" />}
                  Créer la séquence
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
