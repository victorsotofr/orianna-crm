'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ContactStatusBadge } from '@/components/contact-status-badge';
import { ContactDetailTimeline } from '@/components/contact-detail-timeline';
import { SiteHeader } from '@/components/site-header';
import { toast } from 'sonner';
import { ArrowLeft, Save, Loader2, Trash2, Mail, Building2, Phone, User, MessageSquare } from 'lucide-react';
import type { Contact, ContactTimeline, Comment } from '@/types/database';

export default function ContactDetailPage() {
  const router = useRouter();
  const params = useParams();
  const contactId = params.id as string;

  const [contact, setContact] = useState<Contact | null>(null);
  const [timeline, setTimeline] = useState<ContactTimeline[]>([]);
  const [comments, setComments] = useState<(Comment & { team_members?: { display_name: string } })[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [postingComment, setPostingComment] = useState(false);

  // Editable fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState('new');

  useEffect(() => {
    fetchAll();
  }, [contactId]);

  const fetchAll = async () => {
    try {
      const [contactRes, timelineRes, commentsRes] = await Promise.all([
        fetch(`/api/contacts/${contactId}`),
        fetch(`/api/timeline?contact_id=${contactId}`),
        fetch(`/api/comments?contact_id=${contactId}`),
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
      }

      if (timelineRes.ok) {
        const { events } = await timelineRes.json();
        setTimeline(events);
      }

      if (commentsRes.ok) {
        const { comments: cmts } = await commentsRes.json();
        setComments(cmts);
      }
    } catch (error) {
      console.error('Error fetching contact:', error);
      toast.error('Erreur lors du chargement du contact');
    } finally {
      setLoading(false);
    }
  };

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

  const handlePostComment = async () => {
    if (!newComment.trim()) return;
    setPostingComment(true);
    try {
      const response = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_id: contactId, content: newComment }),
      });

      if (response.ok) {
        setNewComment('');
        toast.success('Commentaire ajouté');
        // Refresh comments and timeline
        const [commentsRes, timelineRes] = await Promise.all([
          fetch(`/api/comments?contact_id=${contactId}`),
          fetch(`/api/timeline?contact_id=${contactId}`),
        ]);
        if (commentsRes.ok) setComments((await commentsRes.json()).comments);
        if (timelineRes.ok) setTimeline((await timelineRes.json()).events);
      }
    } catch (error) {
      toast.error("Erreur lors de l'ajout du commentaire");
    } finally {
      setPostingComment(false);
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
      <div className="flex flex-1 flex-col">
        <div className="flex flex-1 flex-col gap-4 py-4 md:gap-6 md:py-6 px-4 lg:px-6">
          {/* Top bar */}
          <div className="flex items-center justify-between">
            <Button variant="ghost" onClick={() => router.push('/contacts')}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Retour
            </Button>
            <div className="flex gap-2">
              <Button variant="destructive" size="sm" onClick={handleDelete}>
                <Trash2 className="mr-2 h-4 w-4" />
                Supprimer
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Enregistrer
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: Contact info */}
            <div className="lg:col-span-2 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Informations</CardTitle>
                  <div className="flex items-center gap-2 pt-2">
                    <ContactStatusBadge status={status} />
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Prénom</Label>
                      <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Nom</Label>
                      <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <Input value={email} onChange={(e) => setEmail(e.target.value)} />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Entreprise</Label>
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Poste</Label>
                      <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Téléphone</Label>
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Statut</Label>
                      <Select value={status} onValueChange={setStatus}>
                        <SelectTrigger>
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
                  <div className="space-y-2">
                    <Label>Notes</Label>
                    <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} placeholder="Notes sur ce contact..." />
                  </div>
                </CardContent>
              </Card>

              {/* Comments */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MessageSquare className="h-5 w-5" />
                    Commentaires ({comments.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-2">
                    <Textarea
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      placeholder="Ajouter un commentaire..."
                      rows={2}
                      className="flex-1"
                    />
                    <Button onClick={handlePostComment} disabled={postingComment || !newComment.trim()} size="sm">
                      {postingComment ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Envoyer'}
                    </Button>
                  </div>
                  {comments.map((comment) => (
                    <div key={comment.id} className="border-l-2 border-muted pl-4 py-2">
                      <p className="text-sm">{comment.content}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {comment.team_members?.display_name || 'Utilisateur'} &middot;{' '}
                        {new Date(comment.created_at).toLocaleString('fr-FR')}
                      </p>
                    </div>
                  ))}
                  {comments.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">Aucun commentaire</p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Right: Timeline */}
            <div>
              <Card>
                <CardHeader>
                  <CardTitle>Historique</CardTitle>
                  <CardDescription>Activité récente</CardDescription>
                </CardHeader>
                <CardContent>
                  <ContactDetailTimeline events={timeline as any} />
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
