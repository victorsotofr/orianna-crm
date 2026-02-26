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

const STEP_LABELS = [
  { title: 'Premier Contact', subtitle: 'Envoi immédiat dès inscription du contact' },
  { title: 'Première Relance', subtitle: 'Envoi si pas de réponse' },
  { title: 'Dernier Contact', subtitle: 'Envoi si pas de réponse' },
];

export default function NewSequencePage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [step1TemplateId, setStep1TemplateId] = useState('');
  const [step2TemplateId, setStep2TemplateId] = useState('');
  const [step2DelayDays, setStep2DelayDays] = useState(3);
  const [step3TemplateId, setStep3TemplateId] = useState('');
  const [step3DelayDays, setStep3DelayDays] = useState(5);

  useEffect(() => {
    fetch('/api/templates')
      .then(res => res.json())
      .then(data => setTemplates(data.templates || []))
      .catch(() => toast.error('Erreur lors du chargement des templates'))
      .finally(() => setLoadingTemplates(false));
  }, []);

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error('Le nom de la séquence est obligatoire');
      return;
    }
    if (!step1TemplateId || !step2TemplateId || !step3TemplateId) {
      toast.error('Sélectionnez un template pour chaque étape');
      return;
    }
    if (step2DelayDays < 1) {
      toast.error("Le délai de l'étape 2 doit être d'au moins 1 jour");
      return;
    }
    if (step3DelayDays < 1) {
      toast.error("Le délai de l'étape 3 doit être d'au moins 1 jour");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch('/api/sequences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          steps: [
            { template_id: step1TemplateId, delay_days: 0 },
            { template_id: step2TemplateId, delay_days: step2DelayDays },
            { template_id: step3TemplateId, delay_days: step3DelayDays },
          ],
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

  const templateSelect = (value: string, onChange: (v: string) => void) => (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">Template d&apos;email</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9">
          <SelectValue placeholder="Sélectionner un template..." />
        </SelectTrigger>
        <SelectContent>
          {templates.map((tpl) => (
            <SelectItem key={tpl.id} value={tpl.id}>
              <span>{tpl.name}</span>
              <span className="ml-2 text-xs text-muted-foreground">— {tpl.subject}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant="link"
        size="sm"
        className="h-auto p-0 text-xs"
        onClick={() => router.push('/templates')}
      >
        <Plus className="mr-1 h-3 w-3" />
        Créer un nouveau template
      </Button>
    </div>
  );

  return (
    <>
      <SiteHeader title="Nouvelle séquence" />
      <div className="flex flex-1 flex-col">
        <div className="flex flex-1 flex-col gap-6 py-4 md:py-6 px-4 lg:px-6 max-w-2xl mx-auto w-full">
          <Button variant="ghost" className="w-fit" onClick={() => router.push('/sequences')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Retour
          </Button>

          {/* Sequence name */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Nom de la séquence</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Spanish Property Investors"
              className="text-base"
            />
          </div>

          {loadingTemplates ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4">
              {/* Step 1: Premier Contact */}
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-blue-50 dark:bg-blue-950/40 border-b px-4 py-3 flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-400 text-sm font-bold">
                    1
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-blue-700 dark:text-blue-300">{STEP_LABELS[0].title}</p>
                    <p className="text-xs text-blue-600/70 dark:text-blue-400/70">{STEP_LABELS[0].subtitle}</p>
                  </div>
                </div>
                <div className="p-4 space-y-3">
                  {templateSelect(step1TemplateId, setStep1TemplateId)}
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    <span>Envoi immédiat (dès inscription du contact)</span>
                  </div>
                </div>
              </div>

              {/* Connector */}
              <div className="flex flex-col items-center gap-1 py-1">
                <div className="w-px h-4 bg-border" />
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted px-3 py-1 rounded-full">
                  <Clock className="h-3 w-3" />
                  Si pas de réponse...
                </div>
                <div className="w-px h-4 bg-border" />
              </div>

              {/* Step 2: Première Relance */}
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-orange-50 dark:bg-orange-950/40 border-b px-4 py-3 flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-100 text-orange-600 dark:bg-orange-900 dark:text-orange-400 text-sm font-bold">
                    2
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-orange-700 dark:text-orange-300">{STEP_LABELS[1].title}</p>
                    <p className="text-xs text-orange-600/70 dark:text-orange-400/70">{STEP_LABELS[1].subtitle}</p>
                  </div>
                </div>
                <div className="p-4 space-y-3">
                  {templateSelect(step2TemplateId, setStep2TemplateId)}
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Délai après l&apos;Étape 1</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={1}
                        value={step2DelayDays}
                        onChange={(e) => setStep2DelayDays(parseInt(e.target.value) || 1)}
                        className="w-20 h-9"
                      />
                      <span className="text-sm text-muted-foreground">jours</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Connector */}
              <div className="flex flex-col items-center gap-1 py-1">
                <div className="w-px h-4 bg-border" />
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted px-3 py-1 rounded-full">
                  <Clock className="h-3 w-3" />
                  Si pas de réponse...
                </div>
                <div className="w-px h-4 bg-border" />
              </div>

              {/* Step 3: Dernier Contact */}
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-red-50 dark:bg-red-950/40 border-b px-4 py-3 flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-100 text-red-600 dark:bg-red-900 dark:text-red-400 text-sm font-bold">
                    3
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-red-700 dark:text-red-300">{STEP_LABELS[2].title}</p>
                    <p className="text-xs text-red-600/70 dark:text-red-400/70">{STEP_LABELS[2].subtitle}</p>
                  </div>
                </div>
                <div className="p-4 space-y-3">
                  {templateSelect(step3TemplateId, setStep3TemplateId)}
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Délai après l&apos;Étape 2</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={1}
                        value={step3DelayDays}
                        onChange={(e) => setStep3DelayDays(parseInt(e.target.value) || 1)}
                        className="w-20 h-9"
                      />
                      <span className="text-sm text-muted-foreground">jours</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* End marker */}
              <div className="flex flex-col items-center gap-1 py-1">
                <div className="w-px h-4 bg-border" />
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted px-3 py-1 rounded-full">
                  Fin de la séquence
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2 pb-6 border-t">
            <Button variant="outline" onClick={() => router.push('/sequences')}>
              Annuler
            </Button>
            <Button onClick={handleCreate} disabled={saving || loadingTemplates}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
              Créer la séquence
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
