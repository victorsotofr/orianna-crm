'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { SiteHeader } from '@/components/site-header';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Save } from 'lucide-react';

export default function NewContactPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [companyDomain, setCompanyDomain] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [phone, setPhone] = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [location, setLocation] = useState('');
  const [education, setEducation] = useState('');
  const [notes, setNotes] = useState('');

  const handleSave = async () => {
    if (!email.trim()) {
      toast.error("L'email est obligatoire");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch('/api/contacts/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          first_name: firstName.trim() || null,
          last_name: lastName.trim() || null,
          company_name: companyName.trim() || null,
          company_domain: companyDomain.trim() || null,
          job_title: jobTitle.trim() || null,
          phone: phone.trim() || null,
          linkedin_url: linkedinUrl.trim() || null,
          location: location.trim() || null,
          education: education.trim() || null,
          notes: notes.trim() || null,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        toast.success('Contact créé');
        router.push(`/contacts/${data.contact.id}`);
      } else if (response.status === 409) {
        toast.error('Un contact avec cet email existe déjà');
      } else {
        toast.error(data.error || 'Erreur lors de la création');
      }
    } catch {
      toast.error('Erreur lors de la création du contact');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <SiteHeader title="Nouveau contact" />
      <div className="page-container">
        <div className="page-content max-w-3xl">
          {/* Top bar */}
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={() => router.push('/contacts')}>
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
              Retour
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
              Créer le contact
            </Button>
          </div>

          {/* Form — single compact grid */}
          <div className="border rounded-lg px-4 py-3 space-y-2.5">
            <div className="grid grid-cols-3 gap-x-3 gap-y-2.5">
              {/* Row 1: Email, Prénom, Nom */}
              <div className="space-y-1">
                <Label className="text-xs">Email *</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="contact@example.com" className="h-7 text-xs" required />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Prénom</Label>
                <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Jean" className="h-7 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Nom</Label>
                <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Dupont" className="h-7 text-xs" />
              </div>

              {/* Row 2: Entreprise, Site web, Poste */}
              <div className="space-y-1">
                <Label className="text-xs">Entreprise</Label>
                <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Entreprise SAS" className="h-7 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Site web</Label>
                <Input value={companyDomain} onChange={(e) => setCompanyDomain(e.target.value)} placeholder="example.com" className="h-7 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Poste</Label>
                <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="Directeur Commercial" className="h-7 text-xs" />
              </div>

              {/* Row 3: Téléphone, LinkedIn, Ville */}
              <div className="space-y-1">
                <Label className="text-xs">Téléphone</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+33 6 12 34 56 78" className="h-7 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">LinkedIn</Label>
                <Input value={linkedinUrl} onChange={(e) => setLinkedinUrl(e.target.value)} placeholder="https://linkedin.com/in/..." className="h-7 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Ville</Label>
                <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Paris" className="h-7 text-xs" />
              </div>

              {/* Row 4: Formation + Notes (spanning 2 cols) */}
              <div className="space-y-1">
                <Label className="text-xs">Formation</Label>
                <Input value={education} onChange={(e) => setEducation(e.target.value)} placeholder="HEC Paris" className="h-7 text-xs" />
              </div>
              <div className="space-y-1 col-span-2">
                <Label className="text-xs">Notes</Label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes sur ce contact..." className="h-7 text-xs" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
