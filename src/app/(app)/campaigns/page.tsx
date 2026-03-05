'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { SiteHeader } from '@/components/site-header';
import { CompactStatsBar } from '@/components/compact-stats-bar';
import { ContactStatusBadge } from '@/components/contact-status-badge';
import { Badge } from '@/components/ui/badge';
import { useRouter } from 'next/navigation';
import { Loader2, Send, Plus, Sparkles, ArrowUpDown, ArrowUp, ArrowDown, Layers } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useTranslation } from '@/lib/i18n';
import { apiFetch } from '@/lib/api';
import { useBackgroundJobs } from '@/lib/background-jobs';

type CampaignTab = 'manual' | 'sequences';

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
  const [tab, setTab] = useState<CampaignTab>('manual');
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  const [contacts, setContacts] = useState<CampaignContact[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendPhase, setSendPhase] = useState<'idle' | 'enriching' | 'sending'>('idle');
  const [sendProgress, setSendProgress] = useState<{ current: number; total: number } | null>(null);
  const [enrichProgress, setEnrichProgress] = useState<{ current: number; total: number } | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('new');
  const [ownerFilter, setOwnerFilter] = useState('all');
  const { addJob, completeJob, failJob, updateJobProgress } = useBackgroundJobs();
  const [sortKeys, setSortKeys] = useState<{ column: string; direction: 'asc' | 'desc' }[]>([]);

  const lastClickedIndexRef = useRef<number | null>(null);

  const fetchData = useCallback(async () => {
    try {
      if (tab === 'manual') {
        const [contactsRes, templatesRes, teamRes] = await Promise.all([
          supabase
            .from('contacts')
            .select('id, first_name, last_name, email, company_name, location, status, assigned_to, ai_personalized_line')
            .not('status', 'in', '("lost","do_not_contact","customer")')
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
      } else {
        // Fetch sequences
        const response = await apiFetch('/api/campaigns/sequences');
        if (response.ok) {
          const data = await response.json();
          setCampaigns(data.sequences || []);
        }
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    setLoading(true);
    fetchData();
  }, [fetchData]);

  const getOwnerName = useCallback((assignedTo: string | null) => {
    if (!assignedTo) return '';
    const member = teamMembers.find(m => m.user_id === assignedTo);
    return member?.display_name || '';
  }, [teamMembers]);

  const filteredContacts = useMemo(() => {
    const filtered = contacts.filter(c => {
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

    if (sortKeys.length === 0) return filtered;

    return [...filtered].sort((a, b) => {
      for (const { column, direction } of sortKeys) {
        const dir = direction === 'asc' ? 1 : -1;
        let result = 0;

        let valA: string | null | undefined;
        let valB: string | null | undefined;

        if (column === 'assigned_to') {
          valA = getOwnerName(a.assigned_to);
          valB = getOwnerName(b.assigned_to);
        } else if (column === 'name') {
          valA = [a.first_name, a.last_name].filter(Boolean).join(' ');
          valB = [b.first_name, b.last_name].filter(Boolean).join(' ');
        } else {
          valA = (a as any)[column];
          valB = (b as any)[column];
        }

        if (valA == null && valB == null) result = 0;
        else if (valA == null) result = 1;
        else if (valB == null) result = -1;
        else result = String(valA).localeCompare(String(valB), 'fr', { sensitivity: 'base' }) * dir;

        if (result !== 0) return result;
      }
      return 0;
    });
  }, [contacts, statusFilter, ownerFilter, search, sortKeys, getOwnerName]);

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
          await apiFetch('/api/ai/personalize-contact', {
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
    const emailJobId = addJob('email_send', { contactIds, totalCount: total });

    let sentCount = 0;
    let errorCount = 0;

    for (let i = 0; i < contactIds.length; i++) {
      setSendProgress({ current: i + 1, total });
      updateJobProgress(emailJobId, i + 1);

      try {
        const response = await apiFetch('/api/campaigns/send', {
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
      completeJob(emailJobId, sentCount);
    } else {
      failJob(emailJobId, `${errorCount} error(s)`);
    }
    if (errorCount > 0 && sentCount > 0) {
      toast.warning(t.campaigns.toasts.errors(errorCount));
    }

    setSelectedContacts(new Set());
    setSelectedTemplate('');
    setSendPhase('idle');
    setSendProgress(null);
    fetchData();
  };

  const handleRowSelect = (id: string, index: number, event: React.MouseEvent) => {
    if (event.shiftKey && lastClickedIndexRef.current !== null) {
      const start = Math.min(lastClickedIndexRef.current, index);
      const end = Math.max(lastClickedIndexRef.current, index);
      setSelectedContacts(prev => {
        const next = new Set(prev);
        for (let i = start; i <= end; i++) {
          next.add(filteredContacts[i].id);
        }
        return next;
      });
    } else {
      setSelectedContacts(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    }
    lastClickedIndexRef.current = index;
  };

  useEffect(() => {
    lastClickedIndexRef.current = null;
  }, [search, statusFilter, ownerFilter, sortKeys]);

  const toggleAll = () => {
    if (selectedContacts.size === filteredContacts.length) {
      setSelectedContacts(new Set());
    } else {
      setSelectedContacts(new Set(filteredContacts.map(c => c.id)));
    }
  };

  const handleSort = (column: string) => {
    setSortKeys(prev => {
      const existingIndex = prev.findIndex(s => s.column === column);
      if (existingIndex >= 0) {
        // asc → desc → remove
        if (prev[existingIndex].direction === 'asc') {
          const next = [...prev];
          next[existingIndex] = { column, direction: 'desc' };
          return next;
        }
        return prev.filter((_, i) => i !== existingIndex);
      }
      return [...prev, { column, direction: 'asc' }];
    });
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  return (
    <>
      <SiteHeader title={t.campaigns.title} />
      <div className="page-container">
        <div className="page-content">
          {/* Tab toggle */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex shrink-0 rounded-md border">
              <Button
                variant={tab === 'manual' ? 'default' : 'ghost'}
                size="sm"
                className="rounded-r-none text-xs h-8"
                onClick={() => setTab('manual')}
              >
                <Send className="mr-1.5 h-3.5 w-3.5" />
                {t.sequences.manualCampaigns}
              </Button>
              <Button
                variant={tab === 'sequences' ? 'default' : 'ghost'}
                size="sm"
                className="rounded-l-none text-xs h-8"
                onClick={() => setTab('sequences')}
              >
                <Layers className="mr-1.5 h-3.5 w-3.5" />
                {t.sequences.sequenceCampaigns}
              </Button>
            </div>
            {tab === 'sequences' && (
              <Button
                size="sm"
                className="ml-auto"
                onClick={() => router.push('/campaigns/new')}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                {t.sequences.newSequence}
              </Button>
            )}
          </div>

          {/* Manual campaign toolbar */}
          {tab === 'manual' && (
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
                  <SelectItem value="engaged">{t.statuses.engaged}</SelectItem>
                  <SelectItem value="qualified">{t.statuses.qualified}</SelectItem>
                  <SelectItem value="meeting_scheduled">{t.statuses.meeting_scheduled}</SelectItem>
                  <SelectItem value="opportunity">{t.statuses.opportunity}</SelectItem>
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
          )}

          {/* Sequences table */}
          {tab === 'sequences' && (
            <>
              {loading ? (
                <div className="flex-1 min-h-0 rounded-lg border bg-card p-3 space-y-3">
                  <Skeleton className="h-8 w-full rounded" />
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full rounded" />
                  ))}
                </div>
              ) : campaigns.length === 0 ? (
                <div className="flex flex-col items-center justify-center flex-1 text-center rounded-lg border bg-card">
                  <Layers className="h-10 w-10 text-muted-foreground mb-3" />
                  <h3 className="text-sm font-medium mb-1">{t.sequences.emptyState.title}</h3>
                  <p className="text-xs text-muted-foreground mb-4">{t.sequences.emptyState.description}</p>
                  <Button size="sm" onClick={() => router.push('/campaigns/new')}>
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    {t.sequences.create}
                  </Button>
                </div>
              ) : (
                <div className="flex-1 min-h-0 overflow-auto rounded-lg border bg-card">
                  <table className="w-full text-sm border-collapse">
                    <thead className="bg-muted/50 sticky top-0 z-10">
                      <tr className="border-b">
                        <th className="h-9 px-3 text-left text-xs font-medium">
                          {t.sequences.list.name}
                        </th>
                        <th className="h-9 px-3 text-left text-xs font-medium">
                          {t.sequences.list.contacts}
                        </th>
                        <th className="h-9 px-3 text-left text-xs font-medium">
                          {t.sequences.list.status}
                        </th>
                        <th className="h-9 px-3 text-left text-xs font-medium">
                          {t.sequences.list.created}
                        </th>
                        <th className="h-9 px-3 text-left text-xs font-medium">
                          {t.sequences.list.actions}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {campaigns.map((campaign) => (
                        <tr
                          key={campaign.id}
                          className="border-b hover:bg-muted/30 transition-colors cursor-pointer"
                          onClick={() => router.push(`/campaigns/${campaign.id}`)}
                        >
                          <td className="px-3 py-2">
                            <div className="space-y-0.5">
                              <div className="text-xs font-medium">{campaign.name}</div>
                              {campaign.description && (
                                <div className="text-xs text-muted-foreground line-clamp-1">
                                  {campaign.description}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <Badge variant="outline" className="text-xs">
                              {campaign.contact_count || 0}
                            </Badge>
                          </td>
                          <td className="px-3 py-2">
                            {campaign.is_active ? (
                              <Badge variant="default" className="text-xs">
                                {t.sequences.status.active}
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-xs">
                                {t.sequences.status.paused}
                              </Badge>
                            )}
                          </td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">
                            {formatDate(campaign.created_at)}
                          </td>
                          <td className="px-3 py-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={(e) => {
                                e.stopPropagation();
                                router.push(`/campaigns/${campaign.id}`);
                              }}
                            >
                              {t.common.edit}
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* Manual campaign table */}
          {tab === 'manual' && (loading ? (
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
                    {[
                      { key: 'assigned_to', label: t.campaigns.tableHeaders.owner },
                      { key: 'status', label: t.campaigns.tableHeaders.status },
                      { key: 'name', label: t.campaigns.tableHeaders.name },
                      { key: 'email', label: t.campaigns.tableHeaders.email },
                      { key: 'company_name', label: t.campaigns.tableHeaders.company },
                      { key: 'location', label: t.campaigns.tableHeaders.city },
                    ].map(col => {
                      const sortIndex = sortKeys.findIndex(s => s.column === col.key);
                      return (
                        <th
                          key={col.key}
                          className="h-9 px-3 text-left text-xs font-medium whitespace-nowrap cursor-pointer select-none hover:bg-muted/80 transition-colors"
                          onClick={() => handleSort(col.key)}
                        >
                          <span className="inline-flex items-center gap-1">
                            {col.label}
                            {sortIndex >= 0 ? (
                              <span className="inline-flex items-center gap-0.5">
                                {sortKeys[sortIndex].direction === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                                {sortKeys.length > 1 && <span className="text-[10px] opacity-60">{sortIndex + 1}</span>}
                              </span>
                            ) : (
                              <ArrowUpDown className="h-3 w-3 opacity-30" />
                            )}
                          </span>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {filteredContacts.map((contact, index) => (
                    <tr
                      key={contact.id}
                      className="border-b hover:bg-muted/30 transition-colors"
                    >
                      <td
                        className="px-2 py-1 cursor-pointer select-none"
                        onClick={(e) => handleRowSelect(contact.id, index, e)}
                      >
                        <Checkbox
                          checked={selectedContacts.has(contact.id)}
                          className="pointer-events-none"
                          onCheckedChange={() => {}}
                        />
                      </td>
                      <td className="px-3 py-1">
                        {contact.assigned_to ? (
                          <Badge variant="secondary" className="text-xs">{getOwnerName(contact.assigned_to) || '—'}</Badge>
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
          ))}
        </div>
      </div>
    </>
  );
}
