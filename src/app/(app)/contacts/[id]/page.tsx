'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ContactStatusBadge } from '@/components/contact-status-badge';
import { ContactDetailTimeline } from '@/components/contact-detail-timeline';
import { AIScoreCard } from '@/components/ai-score-card';
import { StickySaveBar } from '@/components/sticky-save-bar';
import { SiteHeader } from '@/components/site-header';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Trash2, ThumbsUp, ThumbsDown } from 'lucide-react';
import type { Contact, ContactTimeline, TeamMember } from '@/types/database';

export default function ContactDetailPage() {
  const router = useRouter();
  const params = useParams();
  const contactId = params.id as string;

  const [contact, setContact] = useState<Contact | null>(null);
  const [timeline, setTimeline] = useState<ContactTimeline[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Editable fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState('new');
  const [assignedTo, setAssignedTo] = useState<string>('unassigned');
  const [location, setLocation] = useState('');
  const [education, setEducation] = useState('');
  const [firstContact, setFirstContact] = useState('');
  const [secondContact, setSecondContact] = useState('');
  const [thirdContact, setThirdContact] = useState('');

  // Track original values for dirty detection
  const [originalValues, setOriginalValues] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchAll();
  }, [contactId]);

  const fetchAll = async () => {
    try {
      const [contactRes, timelineRes, teamRes] = await Promise.all([
        fetch(`/api/contacts/${contactId}`),
        fetch(`/api/timeline?contact_id=${contactId}`),
        fetch('/api/contacts?limit=1&include_team=true'),
      ]);

      if (contactRes.ok) {
        const { contact: c } = await contactRes.json();
        setContact(c);
        setFirstName(c.first_name || '');
        setLastName(c.last_name || '');
        setEmail(c.email || '');
        setCompanyName(c.company_name || '');
        setJobTitle(c.job_title || '');
        setPhone(c.phone || '');
        setNotes(c.notes || '');
        setStatus(c.status || 'new');
        setAssignedTo(c.assigned_to || 'unassigned');
        setLocation(c.location || '');
        setEducation(c.education || '');
        setFirstContact(c.first_contact || '');
        setSecondContact(c.second_contact || '');
        setThirdContact(c.third_contact || '');
        setOriginalValues({
          firstName: c.first_name || '',
          lastName: c.last_name || '',
          email: c.email || '',
          companyName: c.company_name || '',
          jobTitle: c.job_title || '',
          phone: c.phone || '',
          notes: c.notes || '',
          status: c.status || 'new',
          assignedTo: c.assigned_to || 'unassigned',
          location: c.location || '',
          education: c.education || '',
          firstContact: c.first_contact || '',
          secondContact: c.second_contact || '',
          thirdContact: c.third_contact || '',
        });
      }

      if (timelineRes.ok) {
        const { events } = await timelineRes.json();
        setTimeline(events);
      }

      if (teamRes.ok) {
        const data = await teamRes.json();
        if (data.teamMembers) setTeamMembers(data.teamMembers);
      }
    } catch (error) {
      console.error('Error fetching contact:', error);
      toast.error('Erreur lors du chargement du contact');
    } finally {
      setLoading(false);
    }
  };

  const hasChanges = contact !== null && (
    firstName !== originalValues.firstName ||
    lastName !== originalValues.lastName ||
    email !== originalValues.email ||
    companyName !== originalValues.companyName ||
    jobTitle !== originalValues.jobTitle ||
    phone !== originalValues.phone ||
    notes !== originalValues.notes ||
    status !== originalValues.status ||
    assignedTo !== originalValues.assignedTo ||
    location !== originalValues.location ||
    education !== originalValues.education ||
    firstContact !== originalValues.firstContact ||
    secondContact !== originalValues.secondContact ||
    thirdContact !== originalValues.thirdContact
  );

  const handleDiscard = useCallback(() => {
    setFirstName(originalValues.firstName || '');
    setLastName(originalValues.lastName || '');
    setEmail(originalValues.email || '');
    setCompanyName(originalValues.companyName || '');
    setJobTitle(originalValues.jobTitle || '');
    setPhone(originalValues.phone || '');
    setNotes(originalValues.notes || '');
    setStatus(originalValues.status || 'new');
    setAssignedTo(originalValues.assignedTo || 'unassigned');
    setLocation(originalValues.location || '');
    setEducation(originalValues.education || '');
    setFirstContact(originalValues.firstContact || '');
    setSecondContact(originalValues.secondContact || '');
    setThirdContact(originalValues.thirdContact || '');
  }, [originalValues]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch(`/api/contacts/${contactId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: firstName,
          last_name: lastName,
          email,
          company_name: companyName,
          job_title: jobTitle,
          phone,
          notes,
          status,
          assigned_to: assignedTo === 'unassigned' ? null : assignedTo,
          location: location || null,
          education: education || null,
          first_contact: firstContact || null,
          second_contact: secondContact || null,
          third_contact: thirdContact || null,
        }),
      });

      if (response.ok) {
        toast.success('Contact mis à jour');
        fetchAll();
      } else {
        const data = await response.json();
        toast.error(data.error || 'Erreur lors de la mise à jour');
      }
    } catch (error) {
      toast.error('Erreur lors de la mise à jour');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce contact ?')) return;

    try {
      const response = await fetch(`/api/contacts/${contactId}`, { method: 'DELETE' });
      if (response.ok) {
        toast.success('Contact supprimé');
        router.push('/contacts');
      } else {
        toast.error('Erreur lors de la suppression');
      }
    } catch (error) {
      toast.error('Erreur lors de la suppression');
    }
  };

  const handleReplyAction = async (type: 'hot' | 'cold') => {
    const label = type === 'hot' ? 'qualifié' : 'non qualifié';
    try {
      const response = await fetch(`/api/contacts/${contactId}/reply-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      });

      if (response.ok) {
        toast.success(`Contact marqué comme ${label}`);
        fetchAll();
      } else {
        const data = await response.json();
        toast.error(data.error || 'Erreur');
      }
    } catch (error) {
      toast.error('Erreur lors de l\'action');
    }
  };

  if (loading) {
    return (
      <>
        <SiteHeader title="Contact" />
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </>
    );
  }

  if (!contact) {
    return (
      <>
        <SiteHeader title="Contact" />
        <div className="flex items-center justify-center min-h-[400px]">
          <p className="text-muted-foreground">Contact non trouvé</p>
        </div>
      </>
    );
  }

  return (
    <>
      <SiteHeader title={`${contact.first_name || ''} ${contact.last_name || ''}`} />
      <div className="page-container">
        <div className="page-content">
          {/* Top bar */}
          <div className="flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => router.push('/contacts')}>
                <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
                Retour
              </Button>
              <ContactStatusBadge status={status} />
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs text-green-600 border-green-200 hover:bg-green-50 hover:text-green-700"
                onClick={() => handleReplyAction('hot')}
              >
                <ThumbsUp className="mr-1 h-3 w-3" />
                Chaud
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs text-blue-600 border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                onClick={() => handleReplyAction('cold')}
              >
                <ThumbsDown className="mr-1 h-3 w-3" />
                Froid
              </Button>
            </div>
            <Button variant="destructive" size="sm" onClick={handleDelete}>
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Supprimer
            </Button>
          </div>

          {/* Main content: 2 columns */}
          <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-3 gap-4 overflow-auto">
            {/* Left: Contact form (compact) */}
            <div className="lg:col-span-2 space-y-3">
              {/* Row 1: Name + Email */}
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Prénom</Label>
                  <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Nom</Label>
                  <Input value={lastName} onChange={(e) => setLastName(e.target.value)} className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Email</Label>
                  <Input value={email} onChange={(e) => setEmail(e.target.value)} className="h-8 text-sm font-mono" />
                </div>
              </div>

              {/* Row 2: Company + Job + Phone */}
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Entreprise</Label>
                  <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Poste</Label>
                  <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Téléphone</Label>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="h-8 text-sm" />
                </div>
              </div>

              {/* Row 3: Location + Education + Status */}
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Ville</Label>
                  <Input value={location} onChange={(e) => setLocation(e.target.value)} className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Formation</Label>
                  <Input value={education} onChange={(e) => setEducation(e.target.value)} className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Statut</Label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">Nouveau</SelectItem>
                      <SelectItem value="contacted">Contacté</SelectItem>
                      <SelectItem value="replied">Répondu</SelectItem>
                      <SelectItem value="qualified">Qualifié</SelectItem>
                      <SelectItem value="unqualified">Non qualifié</SelectItem>
                      <SelectItem value="do_not_contact">Ne pas contacter</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Row 4: Owner */}
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Propriétaire</Label>
                  <Select value={assignedTo} onValueChange={setAssignedTo}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Non assigné" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Non assigné</SelectItem>
                      {teamMembers.map(member => (
                        <SelectItem key={member.user_id} value={member.user_id}>
                          {member.display_name || member.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Row 5: Contact dates */}
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">1er Contact</Label>
                  <Input type="date" value={firstContact} onChange={(e) => setFirstContact(e.target.value)} className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">2e Contact</Label>
                  <Input type="date" value={secondContact} onChange={(e) => setSecondContact(e.target.value)} className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">3e Contact</Label>
                  <Input type="date" value={thirdContact} onChange={(e) => setThirdContact(e.target.value)} className="h-8 text-sm" />
                </div>
              </div>

              {/* Row 6: Follow-up dates (read-only) */}
              {contact.follow_up_1 && (
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Relance 1 (auto)</Label>
                    <Input value={contact.follow_up_1} readOnly disabled className="h-8 text-sm bg-muted" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Relance 2 (auto)</Label>
                    <Input value={contact.follow_up_2 || ''} readOnly disabled className="h-8 text-sm bg-muted" />
                  </div>
                </div>
              )}

              {/* Row 7: Notes */}
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Notes</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Notes..." className="text-sm" />
              </div>
            </div>

            {/* Right: AI Score + Timeline */}
            <div className="space-y-3 overflow-auto">
              <AIScoreCard
                contactId={contactId}
                score={contact.ai_score}
                label={contact.ai_score_label}
                reasoning={contact.ai_score_reasoning}
                scoredAt={contact.ai_scored_at}
                onScored={fetchAll}
              />
              <div className="border rounded-lg bg-card p-3">
                <h3 className="text-sm font-medium mb-2">Historique</h3>
                <ContactDetailTimeline events={timeline as any} />
              </div>
            </div>
          </div>
        </div>
      </div>

      <StickySaveBar
        onSave={handleSave}
        saving={saving}
        hasChanges={hasChanges}
        onDiscard={handleDiscard}
      />
    </>
  );
}
