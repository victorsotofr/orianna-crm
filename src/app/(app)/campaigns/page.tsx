'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { SiteHeader } from '@/components/site-header';
import { CompactStatsBar } from '@/components/compact-stats-bar';
import { ContactStatusBadge } from '@/components/contact-status-badge';
import { useRouter } from 'next/navigation';
import { Loader2, Send, Plus } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';

interface CampaignContact {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  company_name: string | null;
  location: string | null;
  status: string;
  assigned_to: string | null;
}

interface Template {
  id: string;
  name: string;
  subject: string;
}

interface TeamMember {
  user_id: string;
  display_name: string;
  email: string;
}

export default function CampaignsPage() {
  const router = useRouter();
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  const [contacts, setContacts] = useState<CampaignContact[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [sendProgress, setSendProgress] = useState<{ current: number; total: number } | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('new');
  const [ownerFilter, setOwnerFilter] = useState('all');

  const fetchData = useCallback(async () => {
    try {
      const [contactsRes, templatesRes, teamRes] = await Promise.all([
        supabase
          .from('contacts')
          .select('id, first_name, last_name, email, company_name, location, status, assigned_to')
          .in('status', ['new', 'contacted'])
          .order('created_at', { ascending: false }),
        supabase
          .from('templates')
          .select('id, name, subject')
          .eq('is_active', true)
          .order('created_at', { ascending: false }),
        supabase
          .from('team_members')
          .select('user_id, display_name, email'),
      ]);

      if (contactsRes.data) setContacts(contactsRes.data);
      if (templatesRes.data) setTemplates(templatesRes.data);
      if (teamRes.data) setTeamMembers(teamRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredContacts = useMemo(() => {
    return contacts.filter(c => {
      if (statusFilter !== 'all' && c.status !== statusFilter) return false;
      if (ownerFilter !== 'all') {
        if (ownerFilter === 'unassigned') {
          if (c.assigned_to) return false;
        } else {
          if (c.assigned_to !== ownerFilter) return false;
        }
      }
      if (search) {
        const q = search.toLowerCase();
        return (
          c.email?.toLowerCase().includes(q) ||
          c.first_name?.toLowerCase().includes(q) ||
          c.last_name?.toLowerCase().includes(q) ||
          c.company_name?.toLowerCase().includes(q) ||
          c.location?.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [contacts, statusFilter, ownerFilter, search]);

  const handleSendEmails = async () => {
    if (!selectedTemplate) {
      toast.error('Veuillez sélectionner un template');
      return;
    }
    if (selectedContacts.size === 0) {
      toast.error('Veuillez sélectionner au moins un contact');
      return;
    }

    const contactIds = Array.from(selectedContacts);
    const total = contactIds.length;

    setSending(true);
    setSendProgress({ current: 0, total });

    let sentCount = 0;
    let errorCount = 0;

    for (let i = 0; i < contactIds.length; i++) {
      setSendProgress({ current: i + 1, total });

      try {
        const response = await fetch('/api/campaigns/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contactIds: [contactIds[i]],
            templateId: selectedTemplate,
            stage: 'first',
          }),
        });

        const data = await response.json();
        if (response.ok && data.sent > 0) {
          sentCount++;
        } else {
          errorCount++;
        }
      } catch {
        errorCount++;
      }

      // 45s delay between sends to avoid spam flags on institutional SMTP
      if (i < contactIds.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 45000));
      }
    }

    if (sentCount > 0) {
      toast.success(`${sentCount} email(s) envoyé(s) avec succès`);
    }
    if (errorCount > 0) {
      toast.warning(`${errorCount} erreur(s) rencontrée(s)`);
    }

    setSelectedContacts(new Set());
    setSelectedTemplate('');
    setSending(false);
    setSendProgress(null);
    fetchData();
  };

  const toggleContact = (contactId: string) => {
    setSelectedContacts(prev => {
      const next = new Set(prev);
      if (next.has(contactId)) next.delete(contactId);
      else next.add(contactId);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedContacts.size === filteredContacts.length) {
      setSelectedContacts(new Set());
    } else {
      setSelectedContacts(new Set(filteredContacts.map(c => c.id)));
    }
  };

  const getOwnerName = (assignedTo: string | null) => {
    if (!assignedTo) return '—';
    const member = teamMembers.find(m => m.user_id === assignedTo);
    return member?.display_name || '—';
  };

  return (
    <>
      <SiteHeader title="Campagnes" />
      <div className="page-container">
        <div className="page-content">
          {/* Toolbar */}
          <div className="flex items-center justify-between gap-3 shrink-0 flex-wrap">
            <div className="flex items-center gap-2 flex-1">
              <Input
                placeholder="Rechercher..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="max-w-[200px] h-8 text-sm"
              />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les statuts</SelectItem>
                  <SelectItem value="new">Nouveau</SelectItem>
                  <SelectItem value="contacted">Contacté</SelectItem>
                </SelectContent>
              </Select>
              <Select value={ownerFilter} onValueChange={setOwnerFilter}>
                <SelectTrigger className="w-[160px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les propriétaires</SelectItem>
                  {teamMembers.map(m => (
                    <SelectItem key={m.user_id} value={m.user_id}>{m.display_name}</SelectItem>
                  ))}
                  <SelectItem value="unassigned">Non assignés</SelectItem>
                </SelectContent>
              </Select>
              <CompactStatsBar stats={[
                { label: 'Sélectionnés', value: selectedContacts.size },
                { label: 'Éligibles', value: filteredContacts.length },
              ]} />
            </div>

            <div className="flex items-center gap-2">
              <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
                <SelectTrigger className="w-[240px] h-8 text-xs">
                  <SelectValue placeholder="Sélectionner un template..." />
                </SelectTrigger>
                <SelectContent>
                  {templates.map(t => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push('/templates/new')}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Template
              </Button>
              {sending && sendProgress ? (
                <div className="flex items-center gap-2 min-w-[200px]">
                  <Progress value={(sendProgress.current / sendProgress.total) * 100} className="h-2 flex-1" />
                  <span className="text-xs font-mono text-muted-foreground whitespace-nowrap">
                    {sendProgress.current}/{sendProgress.total} ({Math.round((sendProgress.current / sendProgress.total) * 100)}%)
                  </span>
                </div>
              ) : (
                <Button
                  size="sm"
                  onClick={handleSendEmails}
                  disabled={selectedContacts.size === 0 || !selectedTemplate || sending}
                >
                  <Send className="mr-1.5 h-3.5 w-3.5" />
                  Envoyer ({selectedContacts.size})
                </Button>
              )}
            </div>
          </div>

          {/* Table */}
          {loading ? (
            <div className="flex-1 min-h-0 rounded-lg border bg-card p-3 space-y-3">
              <Skeleton className="h-8 w-full rounded" />
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded" />
              ))}
            </div>
          ) : filteredContacts.length === 0 ? (
            <div className="flex flex-col items-center justify-center flex-1 text-center rounded-lg border bg-card">
              <Send className="h-10 w-10 text-muted-foreground mb-3" />
              <h3 className="text-sm font-medium mb-1">Aucun contact éligible</h3>
              <p className="text-xs text-muted-foreground">Seuls les contacts avec le statut &quot;Nouveau&quot; ou &quot;Contacté&quot; apparaissent ici</p>
            </div>
          ) : (
            <div className="flex-1 min-h-0 overflow-auto rounded-lg border bg-card">
              <table className="w-full text-sm border-collapse">
                <thead className="bg-muted/50 sticky top-0 z-10">
                  <tr className="border-b">
                    <th className="h-9 px-2 text-left text-xs font-medium w-10">
                      <Checkbox
                        checked={filteredContacts.length > 0 && selectedContacts.size === filteredContacts.length}
                        onCheckedChange={toggleAll}
                      />
                    </th>
                    <th className="h-9 px-3 text-left text-xs font-medium whitespace-nowrap">Propriétaire</th>
                    <th className="h-9 px-3 text-left text-xs font-medium whitespace-nowrap">Statut</th>
                    <th className="h-9 px-3 text-left text-xs font-medium whitespace-nowrap">Nom</th>
                    <th className="h-9 px-3 text-left text-xs font-medium whitespace-nowrap">Email</th>
                    <th className="h-9 px-3 text-left text-xs font-medium whitespace-nowrap">Agence</th>
                    <th className="h-9 px-3 text-left text-xs font-medium whitespace-nowrap">Ville</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredContacts.map(contact => (
                    <tr
                      key={contact.id}
                      className="border-b hover:bg-muted/30 transition-colors cursor-pointer"
                      onClick={() => toggleContact(contact.id)}
                    >
                      <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedContacts.has(contact.id)}
                          onCheckedChange={() => toggleContact(contact.id)}
                        />
                      </td>
                      <td className="px-3 py-1.5 text-sm">
                        {getOwnerName(contact.assigned_to)}
                      </td>
                      <td className="px-3 py-1.5">
                        <ContactStatusBadge status={contact.status} />
                      </td>
                      <td className="px-3 py-1.5 font-medium whitespace-nowrap">
                        {contact.first_name} {contact.last_name}
                      </td>
                      <td className="px-3 py-1.5 text-muted-foreground font-mono text-xs">
                        {contact.email}
                      </td>
                      <td className="px-3 py-1.5 text-muted-foreground">
                        {contact.company_name || '\u2014'}
                      </td>
                      <td className="px-3 py-1.5 text-muted-foreground">
                        {contact.location || '\u2014'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
