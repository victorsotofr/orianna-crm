'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SiteHeader } from '@/components/site-header';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Save } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

export default function NewContactPage() {
  const router = useRouter();
  const { t } = useTranslation();
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
      toast.error(t.contacts.new.toasts.emailRequired);
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
        toast.success(t.contacts.new.toasts.created);
        router.push(`/contacts/${data.contact.id}`);
      } else if (response.status === 409) {
        toast.error(t.contacts.new.toasts.duplicateEmail);
      } else {
        toast.error(data.error || t.contacts.new.toasts.createError);
      }
    } catch {
      toast.error(t.contacts.new.toasts.createErrorGeneric);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <SiteHeader title={t.contacts.new.title} />
      <div className="page-container">
        <div className="page-content max-w-3xl">
          {/* Top bar */}
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={() => router.push('/contacts')}>
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
              {t.common.back}
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
              {t.contacts.new.createButton}
            </Button>
          </div>

          {/* Form — single compact grid */}
          <div className="border rounded-lg px-4 py-3 space-y-2.5">
            <div className="grid grid-cols-3 gap-x-3 gap-y-2.5">
              {/* Row 1: Email, Prénom, Nom */}
              <div className="space-y-1">
                <Label className="text-xs">{t.contacts.new.labels.email}</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t.contacts.new.placeholders.email} className="h-7 text-xs" required />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t.contacts.new.labels.firstName}</Label>
                <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder={t.contacts.new.placeholders.firstName} className="h-7 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t.contacts.new.labels.lastName}</Label>
                <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder={t.contacts.new.placeholders.lastName} className="h-7 text-xs" />
              </div>

              {/* Row 2: Entreprise, Site web, Poste */}
              <div className="space-y-1">
                <Label className="text-xs">{t.contacts.new.labels.company}</Label>
                <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder={t.contacts.new.placeholders.company} className="h-7 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t.contacts.new.labels.website}</Label>
                <Input value={companyDomain} onChange={(e) => setCompanyDomain(e.target.value)} placeholder={t.contacts.new.placeholders.website} className="h-7 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t.contacts.new.labels.position}</Label>
                <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder={t.contacts.new.placeholders.position} className="h-7 text-xs" />
              </div>

              {/* Row 3: Téléphone, LinkedIn, Ville */}
              <div className="space-y-1">
                <Label className="text-xs">{t.contacts.new.labels.phone}</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t.contacts.new.placeholders.phone} className="h-7 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t.contacts.new.labels.linkedin}</Label>
                <Input value={linkedinUrl} onChange={(e) => setLinkedinUrl(e.target.value)} placeholder={t.contacts.new.placeholders.linkedin} className="h-7 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t.contacts.new.labels.city}</Label>
                <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder={t.contacts.new.placeholders.city} className="h-7 text-xs" />
              </div>

              {/* Row 4: Formation + Notes (spanning 2 cols) */}
              <div className="space-y-1">
                <Label className="text-xs">{t.contacts.new.labels.education}</Label>
                <Input value={education} onChange={(e) => setEducation(e.target.value)} placeholder={t.contacts.new.placeholders.education} className="h-7 text-xs" />
              </div>
              <div className="space-y-1 col-span-2">
                <Label className="text-xs">{t.contacts.new.labels.notes}</Label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t.contacts.new.placeholders.notes} className="h-7 text-xs" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
