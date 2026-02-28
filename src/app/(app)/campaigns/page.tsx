'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { SiteHeader } from '@/components/site-header';
import { CompactStatsBar } from '@/components/compact-stats-bar';
import { ContactStatusBadge } from '@/components/contact-status-badge';
import { Badge } from '@/components/ui/badge';
import { useRouter } from 'next/navigation';
import { Loader2, Send, Plus, Sparkles } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useTranslation } from '@/lib/i18n';

interface CampaignContact {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  company_name: string | null;
  location: string | null;
  status: string;
  assigned_to: string | null;
  ai_personalized_line: string | null;
}

interface Template {
  id: string;
  name: string;
  subject: string;
  html_content: string;
}

interface TeamMember {
  user_id: string;
  display_name: string;
  email: string;
}

export default function CampaignsPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  const [contacts, setContacts] = useState<CampaignContact[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendPhase, setSendPhase] = useState<'idle' | 'enriching' | 'sending'>('idle');
  const [sendProgress, setSendProgress] = useState<{ current: number; total: number } | null>(null);
  const [enrichProgress, setEnrichProgress] = useState<{ current: number; total: number } | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('new');
  const [ownerFilter, setOwnerFilter] = useState('all');

  const fetchData = useCallback(async () => {
    try {
      const [contactsRes, templatesRes, teamRes] = await Promise.all([
        supabase
          .from('contacts')
          .select('id, first_name, last_name, email, company_name, location, status, assigned_to, ai_personalized_line')
          .in('status', ['new', 'contacted'])
          .order('created_at', { ascending: false }),
        supabase
          .from('templates')
          .select('id, name, subject, html_content')
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

  const templateUsesPersonalization = useMemo(() => {
    if (!selectedTemplate) return false;
    const tmpl = templates.find(t => t.id === selectedTemplate);
    if (!tmpl) return false;
    return (tmpl.html_content || '').includes('ai_personalized_line') ||
           (tmpl.subject || '').includes('ai_personalized_line');
  }, [selectedTemplate, templates]);

  const contactsNeedingEnrichment = useMemo(() => {
    if (!templateUsesPersonalization) return new Set<string>();
    return new Set(
      contacts
        .filter(c => selectedContacts.has(c.id) && (!c.ai_personalized_line || c.ai_personalized_line.trim() === ''))
        .map(c => c.id)
    );
  }, [selectedContacts, contacts, templateUsesPersonalization]);

  const handleSendEmails = async () => {
    if (!selectedTemplate) {
      toast.error(t.campaigns.toasts.selectTemplate);
      return;
    }
    if (selectedContacts.size === 0) {
      toast.error(t.campaigns.toasts.selectContacts);
      return;
    }

    const contactIds = Array.from(selectedContacts);

    // Phase 1: Enrich contacts missing AI personalization
    if (templateUsesPersonalization && contactsNeedingEnrichment.size > 0) {
      setSendPhase('enriching');
      const enrichIds = Array.from(contactsNeedingEnrichment);
      setEnrichProgress({ current: 0, total: enrichIds.length });

      for (let i = 0; i < enrichIds.length; i++) {
        setEnrichProgress({ current: i + 1, total: enrichIds.length });
        try {
          await fetch('/api/ai/personalize-contact', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contactId: enrichIds[i] }),
          });
        } catch (err) {
          console.error('Enrichment error:', err);
        }
      }

      // Re-fetch contacts to pick up new ai_personalized_line values
      const { data: refreshed } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, email, company_name, location, status, assigned_to, ai_personalized_line')
        .in('status', ['new', 'contacted'])
        .order('created_at', { ascending: false });
      if (refreshed) setContacts(refreshed);
      setEnrichProgress(null);
    }

    // Phase 2: Send emails
    setSendPhase('sending');
    const total = contactIds.length;
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
      toast.success(t.campaigns.toasts.sent(sentCount));
    }
    if (errorCount > 0) {
      toast.warning(t.campaigns.toasts.errors(errorCount));
    }

    setSelectedContacts(new Set());
    setSelectedTemplate('');
    setSendPhase('idle');
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
      <SiteHeader title={t.campaigns.title} />
      <div className="page-container">
        <div className="page-content">
          {/* Toolbar */}
          <div className="flex items-center gap-2 shrink-0 overflow-x-auto">
              <Input
                placeholder={t.campaigns.searchPlaceholder}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-[160px] shrink-0 h-8 text-sm"
              />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[120px] shrink-0 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t.campaigns.allStatuses}</SelectItem>
                  <SelectItem value="new">{t.statuses.new}</SelectItem>
                  <SelectItem value="contacted">{t.statuses.contacted}</SelectItem>
                </SelectContent>
              </Select>
              <Select value={ownerFilter} onValueChange={setOwnerFilter}>
                <SelectTrigger className="w-[140px] shrink-0 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t.campaigns.allOwners}</SelectItem>
                  {teamMembers.map(m => (
                    <SelectItem key={m.user_id} value={m.user_id}>{m.display_name}</SelectItem>
                  ))}
                  <SelectItem value="unassigned">{t.campaigns.unassigned}</SelectItem>
                </SelectContent>
              </Select>
              <CompactStatsBar stats={[
                { label: t.campaigns.stats.selected, value: selectedContacts.size },
                { label: t.campaigns.stats.eligible, value: filteredContacts.length },
              ]} />
              <div className="shrink-0 ml-auto" />
              <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
                <SelectTrigger className="w-[200px] shrink-0 h-8 text-xs">
                  <SelectValue placeholder={t.campaigns.selectTemplate} />
                </SelectTrigger>
                <SelectContent>
                  {templates.map(tmpl => (
                    <SelectItem key={tmpl.id} value={tmpl.id}>
                      {tmpl.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => router.push('/templates/new')}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                {t.campaigns.template}
              </Button>
              {sendPhase !== 'idle' ? (
                <div className="flex items-center gap-2 shrink-0 w-[220px]">
                  <Progress
                    value={
                      sendPhase === 'enriching' && enrichProgress
                        ? (enrichProgress.current / enrichProgress.total) * 100
                        : sendProgress
                          ? (sendProgress.current / sendProgress.total) * 100
                          : 0
                    }
                    className="h-2 flex-1"
                  />
                  <span className="text-xs font-mono text-muted-foreground whitespace-nowrap">
                    {sendPhase === 'enriching' && enrichProgress
                      ? t.campaigns.progress.enriching(enrichProgress.current, enrichProgress.total)
                      : sendProgress
                        ? t.campaigns.progress.sending(sendProgress.current, sendProgress.total)
                        : '...'}
                  </span>
                </div>
              ) : contactsNeedingEnrichment.size > 0 ? (
                <Button
                  size="sm"
                  className="shrink-0 whitespace-nowrap"
                  onClick={handleSendEmails}
                  disabled={selectedContacts.size === 0 || !selectedTemplate}
                >
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                  {t.campaigns.buttons.enrichAndSend(contactsNeedingEnrichment.size)}
                </Button>
              ) : (
                <Button
                  size="sm"
                  className="shrink-0 whitespace-nowrap"
                  onClick={handleSendEmails}
                  disabled={selectedContacts.size === 0 || !selectedTemplate}
                >
                  <Send className="mr-1.5 h-3.5 w-3.5" />
                  {t.campaigns.buttons.send(selectedContacts.size)}
                </Button>
              )}
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
              <h3 className="text-sm font-medium mb-1">{t.campaigns.emptyState.title}</h3>
              <p className="text-xs text-muted-foreground">{t.campaigns.emptyState.description}</p>
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
                    <th className="h-9 px-3 text-left text-xs font-medium whitespace-nowrap">{t.campaigns.tableHeaders.owner}</th>
                    <th className="h-9 px-3 text-left text-xs font-medium whitespace-nowrap">{t.campaigns.tableHeaders.status}</th>
                    <th className="h-9 px-3 text-left text-xs font-medium whitespace-nowrap">{t.campaigns.tableHeaders.name}</th>
                    <th className="h-9 px-3 text-left text-xs font-medium whitespace-nowrap">{t.campaigns.tableHeaders.email}</th>
                    <th className="h-9 px-3 text-left text-xs font-medium whitespace-nowrap">{t.campaigns.tableHeaders.company}</th>
                    <th className="h-9 px-3 text-left text-xs font-medium whitespace-nowrap">{t.campaigns.tableHeaders.city}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredContacts.map(contact => (
                    <tr
                      key={contact.id}
                      className="border-b hover:bg-muted/30 transition-colors cursor-pointer"
                      onClick={() => toggleContact(contact.id)}
                    >
                      <td className="px-2 py-1" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedContacts.has(contact.id)}
                          onCheckedChange={() => toggleContact(contact.id)}
                        />
                      </td>
                      <td className="px-3 py-1">
                        {contact.assigned_to ? (
                          <Badge variant="secondary" className="text-xs">{getOwnerName(contact.assigned_to)}</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">{t.campaigns.unassigned}</span>
                        )}
                      </td>
                      <td className="px-3 py-1">
                        <ContactStatusBadge status={contact.status} />
                      </td>
                      <td className="px-3 py-1 font-medium whitespace-nowrap text-xs">
                        {contact.first_name} {contact.last_name}
                      </td>
                      <td className="px-3 py-1 text-muted-foreground text-xs truncate max-w-[200px]">
                        {contact.email}
                      </td>
                      <td className="px-3 py-1 text-muted-foreground text-xs">
                        {contact.company_name || '\u2014'}
                      </td>
                      <td className="px-3 py-1 text-muted-foreground text-xs">
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
