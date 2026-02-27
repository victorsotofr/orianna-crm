'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { SiteHeader } from '@/components/site-header';
import { CompactStatsBar } from '@/components/compact-stats-bar';
import { useRouter } from 'next/navigation';
import { Loader2, Send, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { isAfter, format } from 'date-fns';
import { supabase } from '@/lib/supabase';

interface CampaignContact {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  company_name: string | null;
  location: string | null;
  status: string;
  first_contact: string | null;
  second_contact: string | null;
  third_contact: string | null;
  follow_up_1: string | null;
  follow_up_2: string | null;
}

interface Template {
  id: string;
  name: string;
  subject: string;
}

type TabValue = 'etape1' | 'etape2' | 'etape3';

export default function CampaignsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabValue>('etape1');
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  const [contacts, setContacts] = useState<CampaignContact[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [contactsRes, templatesRes] = await Promise.all([
        supabase
          .from('contacts')
          .select('id, first_name, last_name, email, company_name, location, status, first_contact, second_contact, third_contact, follow_up_1, follow_up_2')
          .order('created_at', { ascending: false }),
        supabase
          .from('templates')
          .select('id, name, subject')
          .eq('is_active', true)
          .order('created_at', { ascending: false }),
      ]);

      if (contactsRes.data) setContacts(contactsRes.data);
      if (templatesRes.data) setTemplates(templatesRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    setSelectedContacts(new Set());
  }, [activeTab]);

  const filteredContacts = useMemo(() => {
    const now = new Date();
    if (activeTab === 'etape1') {
      return contacts.filter(c => !c.first_contact && c.status === 'new');
    } else if (activeTab === 'etape2') {
      return contacts.filter(c =>
        c.first_contact && !c.second_contact
        && c.follow_up_1 && isAfter(now, new Date(c.follow_up_1))
      );
    } else {
      return contacts.filter(c =>
        c.second_contact && !c.third_contact
        && c.follow_up_2 && isAfter(now, new Date(c.follow_up_2))
      );
    }
  }, [contacts, activeTab]);

  const counts = useMemo(() => {
    const now = new Date();
    return {
      etape1: contacts.filter(c => !c.first_contact && c.status === 'new').length,
      etape2: contacts.filter(c =>
        c.first_contact && !c.second_contact
        && c.follow_up_1 && isAfter(now, new Date(c.follow_up_1))
      ).length,
      etape3: contacts.filter(c =>
        c.second_contact && !c.third_contact
        && c.follow_up_2 && isAfter(now, new Date(c.follow_up_2))
      ).length,
    };
  }, [contacts]);

  const handleSendEmails = async () => {
    if (!selectedTemplate) {
      toast.error('Veuillez sélectionner un template');
      return;
    }
    if (selectedContacts.size === 0) {
      toast.error('Veuillez sélectionner au moins un contact');
      return;
    }

    const stage = activeTab === 'etape1' ? 'first' : activeTab === 'etape2' ? 'second' : 'third';

    setSending(true);
    try {
      const response = await fetch('/api/campaigns/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactIds: Array.from(selectedContacts),
          templateId: selectedTemplate,
          stage,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Erreur lors de l'envoi");
      }

      toast.success(`${data.sent} email(s) envoyé(s) avec succès`);
      if (data.errors?.length) {
        toast.warning(`${data.errors.length} erreur(s) rencontrée(s)`);
      }
      setSelectedContacts(new Set());
      setSelectedTemplate('');
      fetchData();
    } catch (error: any) {
      toast.error(error.message || "Erreur lors de l'envoi");
    } finally {
      setSending(false);
    }
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

  const showFollowUpColumn = activeTab !== 'etape1';

  return (
    <>
      <SiteHeader title="Campagnes" />
      <div className="page-container">
        <div className="page-content">
          {/* Toolbar row 1: Tabs + Template + Send */}
          <div className="flex items-center justify-between gap-3 shrink-0 flex-wrap">
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabValue)}>
              <TabsList>
                <TabsTrigger value="etape1">
                  1er Contact ({counts.etape1})
                </TabsTrigger>
                <TabsTrigger value="etape2">
                  Relance 1 ({counts.etape2})
                </TabsTrigger>
                <TabsTrigger value="etape3">
                  Relance 2 ({counts.etape3})
                </TabsTrigger>
              </TabsList>
            </Tabs>

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
              <Button
                size="sm"
                onClick={handleSendEmails}
                disabled={selectedContacts.size === 0 || !selectedTemplate || sending}
              >
                {sending ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="mr-1.5 h-3.5 w-3.5" />
                )}
                {sending ? 'Envoi...' : `Envoyer (${selectedContacts.size})`}
              </Button>
            </div>
          </div>

          {/* Toolbar row 2: Stats + info */}
          <div className="flex items-center justify-between shrink-0">
            <CompactStatsBar stats={[
              { label: 'Sélectionnés', value: selectedContacts.size },
              { label: 'Total', value: filteredContacts.length },
            ]} />
            <span className="text-xs text-muted-foreground">
              L&apos;envoi met à jour <code className="bg-muted px-1 rounded">{activeTab === 'etape1' ? 'first_contact' : activeTab === 'etape2' ? 'second_contact' : 'third_contact'}</code> = aujourd&apos;hui
            </span>
          </div>

          {/* Scrollable table */}
          {loading ? (
            <div className="flex items-center justify-center flex-1">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filteredContacts.length === 0 ? (
            <div className="flex-1 flex items-center justify-center rounded-lg border bg-card">
              <span className="text-sm text-muted-foreground">Aucun contact pour cette étape</span>
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
                    <th className="h-9 px-3 text-left text-xs font-medium whitespace-nowrap">Nom</th>
                    <th className="h-9 px-3 text-left text-xs font-medium whitespace-nowrap">Email</th>
                    <th className="h-9 px-3 text-left text-xs font-medium whitespace-nowrap">Agence</th>
                    <th className="h-9 px-3 text-left text-xs font-medium whitespace-nowrap">Ville</th>
                    {showFollowUpColumn && (
                      <th className="h-9 px-3 text-left text-xs font-medium whitespace-nowrap">Relance depuis</th>
                    )}
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
                      <td className="px-3 py-1.5 font-medium whitespace-nowrap">
                        {contact.first_name} {contact.last_name}
                      </td>
                      <td className="px-3 py-1.5 text-muted-foreground font-mono">
                        {contact.email}
                      </td>
                      <td className="px-3 py-1.5 text-muted-foreground">
                        {contact.company_name || '\u2014'}
                      </td>
                      <td className="px-3 py-1.5 text-muted-foreground">
                        {contact.location || '\u2014'}
                      </td>
                      {showFollowUpColumn && (
                        <td className="px-3 py-1.5 text-muted-foreground whitespace-nowrap">
                          {activeTab === 'etape2' && contact.follow_up_1
                            ? format(new Date(contact.follow_up_1), 'dd/MM/yyyy')
                            : activeTab === 'etape3' && contact.follow_up_2
                              ? format(new Date(contact.follow_up_2), 'dd/MM/yyyy')
                              : '\u2014'}
                        </td>
                      )}
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
