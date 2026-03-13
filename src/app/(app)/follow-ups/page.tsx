'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { SiteHeader } from '@/components/site-header';
import { CompactStatsBar } from '@/components/compact-stats-bar';
import { Badge } from '@/components/ui/badge';
import { useRouter } from 'next/navigation';
import { Loader2, Send, Plus, Sparkles, ArrowUpDown, ArrowUp, ArrowDown, Reply, Layers, Info } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useTranslation } from '@/lib/i18n';
import { apiFetch } from '@/lib/api';
import { useBackgroundJobs } from '@/lib/background-jobs';
import { Alert, AlertDescription } from '@/components/ui/alert';

type FollowUpTab = 'first' | 'second';

interface FollowUpContact {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  company_name: string | null;
  location: string | null;
  assigned_to: string | null;
  ai_personalized_line: string | null;
  first_contact: string | null;
  second_contact: string | null;
}

interface Template {
  id: string;
  name: string;
  subject: string;
  html_content: string;
  created_by: string | null;
}

interface TeamMember {
  user_id: string;
  display_name: string;
  email: string;
}

export default function FollowUpsPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [tab, setTab] = useState<FollowUpTab>('first');
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  const [contacts, setContacts] = useState<FollowUpContact[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendPhase, setSendPhase] = useState<'idle' | 'enriching' | 'sending'>('idle');
  const [sendProgress, setSendProgress] = useState<{ current: number; total: number } | null>(null);
  const [enrichProgress, setEnrichProgress] = useState<{ current: number; total: number } | null>(null);
  const [search, setSearch] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('all');
  const [sortKeys, setSortKeys] = useState<{ column: string; direction: 'asc' | 'desc' }[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const { addJob, completeJob, failJob, updateJobProgress } = useBackgroundJobs();

  const lastClickedIndexRef = useRef<number | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then((res: any) => {
      if (res.data?.user) setUserId(res.data.user.id);
    });
  }, []);

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

  const fetchData = useCallback(async () => {
    try {
      let contactsQuery = supabase
        .from('contacts')
        .select('id, first_name, last_name, email, company_name, location, assigned_to, ai_personalized_line, first_contact, second_contact')
        .eq('status', 'contacted');

      if (tab === 'first') {
        contactsQuery = contactsQuery
          .not('first_contact', 'is', null)
          .is('second_contact', null)
          .lte('follow_up_1', todayStr);
      } else {
        contactsQuery = contactsQuery
          .not('second_contact', 'is', null)
          .is('third_contact', null)
          .lte('follow_up_2', todayStr);
      }

      const [contactsRes, templatesRes, teamRes] = await Promise.all([
        contactsQuery.order('created_at', { ascending: false }),
        supabase
          .from('templates')
          .select('id, name, subject, html_content, created_by')
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
  }, [tab, todayStr]);

  useEffect(() => {
    setLoading(true);
    setSelectedContacts(new Set());
    fetchData();
  }, [fetchData]);

  const getOwnerName = useCallback((assignedTo: string | null) => {
    if (!assignedTo) return '';
    const member = teamMembers.find(m => m.user_id === assignedTo);
    return member?.display_name || '';
  }, [teamMembers]);

  const filteredContacts = useMemo(() => {
    const filtered = contacts.filter(c => {
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
  }, [contacts, ownerFilter, search, sortKeys, getOwnerName]);

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

  const sendStage = tab === 'first' ? 'second' : 'third';

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

      // Re-fetch to pick up new ai_personalized_line values
      await fetchData();
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
            stage: sendStage,
          }),
        });

        const data = await response.json();
        if (response.ok && data.sent > 0) {
          sentCount++;
        } else {
          errorCount++;
          const errMsg = data.errors?.[0] || data.error || 'Unknown error';
          console.error('[follow-up send] Failed for contact:', contactIds[i], errMsg);
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
  }, [search, ownerFilter, sortKeys]);

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

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '\u2014';
    return new Date(dateStr).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
  };

  const lastContactColumn = tab === 'first' ? 'first_contact' : 'second_contact';

  const tableColumns = [
    { key: 'assigned_to', label: t.followUps.tableHeaders.owner },
    { key: 'name', label: t.followUps.tableHeaders.name },
    { key: 'email', label: t.followUps.tableHeaders.email },
    { key: 'company_name', label: t.followUps.tableHeaders.company },
    { key: 'location', label: t.followUps.tableHeaders.city },
    { key: lastContactColumn, label: t.followUps.tableHeaders.lastContact },
  ];

  return (
    <>
      <SiteHeader title={t.followUps.title} />
      <div className="page-container">
        <div className="page-content">
          {/* Info banner about sequences */}
          <Alert className="bg-muted/50 border-muted">
            <Info className="h-4 w-4" />
            <AlertDescription className="text-xs">
              {t.followUps.sequenceInfo}{' '}
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0 text-xs underline"
                onClick={() => router.push('/campaigns/new')}
              >
                {t.sequences.create}
              </Button>
            </AlertDescription>
          </Alert>

          {/* Toolbar */}
          <div className="flex items-center gap-2 shrink-0 overflow-x-auto">
              {/* Tab toggle */}
              <div className="flex shrink-0 rounded-md border">
                <Button
                  variant={tab === 'first' ? 'default' : 'ghost'}
                  size="sm"
                  className="rounded-r-none text-xs h-8"
                  onClick={() => setTab('first')}
                >
                  {t.followUps.firstFollowUp}
                </Button>
                <Button
                  variant={tab === 'second' ? 'default' : 'ghost'}
                  size="sm"
                  className="rounded-l-none text-xs h-8"
                  onClick={() => setTab('second')}
                >
                  {t.followUps.secondFollowUp}
                </Button>
              </div>
              <Input
                placeholder={t.campaigns.searchPlaceholder}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-[160px] shrink-0 h-8 text-sm"
              />
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
                  {(() => {
                    const mine = templates.filter(tmpl => tmpl.created_by === userId);
                    const team = templates.filter(tmpl => tmpl.created_by !== userId);
                    return (
                      <>
                        {mine.length > 0 && (
                          <SelectGroup>
                            <SelectLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">{t.templates.myTemplates}</SelectLabel>
                            {mine.map(tmpl => (
                              <SelectItem key={tmpl.id} value={tmpl.id}>{tmpl.name}</SelectItem>
                            ))}
                          </SelectGroup>
                        )}
                        {team.length > 0 && (
                          <SelectGroup>
                            <SelectLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">{t.templates.teamTemplates}</SelectLabel>
                            {team.map(tmpl => (
                              <SelectItem key={tmpl.id} value={tmpl.id}>{tmpl.name}</SelectItem>
                            ))}
                          </SelectGroup>
                        )}
                      </>
                    );
                  })()}
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
              <Reply className="h-10 w-10 text-muted-foreground mb-3" />
              <h3 className="text-sm font-medium mb-1">{t.followUps.emptyState.title}</h3>
              <p className="text-xs text-muted-foreground">{t.followUps.emptyState.description}</p>
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
                    {tableColumns.map(col => {
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
                          <Badge variant="secondary" className="text-xs">{getOwnerName(contact.assigned_to) || '\u2014'}</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">{t.campaigns.unassigned}</span>
                        )}
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
                      <td className="px-3 py-1 text-muted-foreground text-xs whitespace-nowrap">
                        {formatDate(tab === 'first' ? contact.first_contact : contact.second_contact)}
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
