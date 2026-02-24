'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { SiteHeader } from '@/components/site-header';
import { IndustrySelector } from '@/components/industry-selector';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Save } from 'lucide-react';

export default function NewContactPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [phone, setPhone] = useState('');
  const [industry, setIndustry] = useState('');
  const [notes, setNotes] = useState('');

  const handleSave = async () => {
    if (!email) {
      toast.error("L'email est obligatoire");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch('/api/contacts/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          first_name: firstName,
          last_name: lastName,
          company_name: companyName,
          job_title: jobTitle,
          phone,
          industry: industry || null,
          notes,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        toast.success('Contact créé avec succès');
        router.push(`/contacts/${data.contact.id}`);
      } else {
        toast.error(data.error || 'Erreur lors de la création');
      }
    } catch (error) {
      toast.error('Erreur lors de la création du contact');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <SiteHeader title="Nouveau contact" />
      <div className="flex flex-1 flex-col">
        <div className="flex flex-1 flex-col gap-4 py-4 md:gap-6 md:py-6 px-4 lg:px-6 max-w-2xl">
          <Button variant="ghost" className="w-fit" onClick={() => router.push('/contacts')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Retour
          </Button>

          <Card>
            <CardHeader>
              <CardTitle>Créer un contact</CardTitle>
              <CardDescription>Ajoutez manuellement un nouveau contact</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Email *</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="contact@example.com" required />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Prénom</Label>
                  <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Jean" />
                </div>
                <div className="space-y-2">
                  <Label>Nom</Label>
                  <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Dupont" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Entreprise</Label>
                  <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Entreprise SAS" />
                </div>
                <div className="space-y-2">
                  <Label>Poste</Label>
                  <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="Directeur" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Téléphone</Label>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+33 6 12 34 56 78" />
                </div>
                <div className="space-y-2">
                  <Label>Industrie</Label>
                  <IndustrySelector
                    value={industry}
                    onValueChange={setIndustry}
                    placeholder="Sélectionner..."
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} placeholder="Notes sur ce contact..." />
              </div>
              <div className="flex justify-end pt-4">
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Créer le contact
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
