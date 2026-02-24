'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { SiteHeader } from '@/components/site-header';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Save } from 'lucide-react';

export default function NewSequencePage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error('Le nom est obligatoire');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch('/api/sequences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), description: description.trim() }),
      });

      if (response.ok) {
        const { sequence } = await response.json();
        toast.success('Séquence créée');
        router.push(`/sequences/${sequence.id}`);
      } else {
        const data = await response.json();
        toast.error(data.error || 'Erreur lors de la création');
      }
    } catch (error) {
      toast.error('Erreur lors de la création');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <SiteHeader title="Nouvelle séquence" />
      <div className="flex flex-1 flex-col">
        <div className="flex flex-1 flex-col gap-4 py-4 md:gap-6 md:py-6 px-4 lg:px-6 max-w-2xl">
          <Button variant="ghost" className="w-fit" onClick={() => router.push('/sequences')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Retour
          </Button>

          <Card>
            <CardHeader>
              <CardTitle>Créer une séquence</CardTitle>
              <CardDescription>
                Définissez le nom et la description de votre séquence. Vous pourrez ensuite ajouter des étapes.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Nom *</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Prospection immobilier Q1"
                />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="Description de la séquence..."
                />
              </div>
              <div className="flex justify-end pt-4">
                <Button onClick={handleCreate} disabled={saving}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Créer la séquence
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
