'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EditableCell } from '@/components/editable-cell';
import { CompactStatsBar } from '@/components/compact-stats-bar';
import { SiteHeader } from '@/components/site-header';
import { Plus, Upload, Loader2, Trash2, X, UserCheck, ArrowUpDown, ArrowUp, ArrowDown, Brain, Sparkles, Users, Search, ArrowLeft } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { AIScoreBadge } from '@/components/ai-score-badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import type { Contact, TeamMember } from '@/types/database';
import { useTranslation } from '@/lib/i18n';
import { apiFetch } from '@/lib/api';
import { useBackgroundJobs } from '@/lib/background-jobs';

function AiSearchDialog({ open, onOpenChange, onImported }: { open: boolean; onOpenChange: (open: boolean) => void; onImported: () => void }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [step, setStep] = useState<'query' | 'results'>('query');
  const [results, setResults] = useState<any[]>([]);
  const [existingEmails, setExistingEmails] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [importing, setImporting] = useState(false);
  const [enhancing, setEnhancing] = useState(false);

  const handleSearch = async (depth: 'standard' | 'deep' = 'standard') => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const r = await apiFetch('/api/ai/search-contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim(), depth }),
      });
      if (r.ok) {
        const data = await r.json();
        setResults(data.contacts || []);
        setExistingEmails(data.existingEmails || []);
        setSelected(new Set(
          (data.contacts || [])
            .map((_: any, i: number) => i)
            .filter((i: number) => {
              const c = data.contacts[i];
              return !c.email || !data.existingEmails.includes(c.email.toLowerCase());
            })
        ));
        setStep('results');
      } else {
        const d = await r.json();
        toast.error(d.error === 'Linkup API key not configured' ? t.contacts.aiSearch.linkupRequired : (d.error || 'Search failed'));
      }
    } catch {
      toast.error('Network error');
    } finally {
      setLoading(false);
    }
  };

  const handleEnhance = async () => {
    if (!query.trim()) return;
    setEnhancing(true);
    try {
      const r = await apiFetch('/api/ai/enhance-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: query, type: 'prospecting' }),
      });
      if (r.ok) {
        const { enhanced } = await r.json();
        setQuery(enhanced);
      }
    } catch {}
    finally { setEnhancing(false); }
  };

  const handleImport = async () => {
    const toImport = Array.from(selected).map(i => results[i]).filter(Boolean);
    if (toImport.length === 0) return;
    setImporting(true);
    try {
      const r = await apiFetch('/api/contacts/import-prospected', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contacts: toImport }),
      });
      if (r.ok) {
        const { imported } = await r.json();
        toast.success(t.contacts.aiSearch.imported(imported));
        onOpenChange(false);
        setStep('query');
        setQuery('');
        setResults([]);
        setSelected(new Set());
        onImported();
      } else {
        const d = await r.json();
        toast.error(d.error || t.contacts.aiSearch.importError);
      }
    } catch {
      toast.error(t.contacts.aiSearch.importError);
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setStep('query'); }}>
      <DialogContent className="sm:max-w-4xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Search className="h-4 w-4" />
            {t.contacts.aiSearch.title}
          </DialogTitle>
        </DialogHeader>

        {step === 'query' && !loading && (
          <div className="flex flex-col gap-3 flex-1">
            <p className="text-xs text-muted-foreground">{t.contacts.aiSearch.hint}</p>
            <Textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.contacts.aiSearch.placeholder}
              className="text-sm resize-none min-h-[120px] max-h-[40vh]"
            />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={handleEnhance} disabled={enhancing || !query.trim()}>
                {enhancing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
                {enhancing ? t.contacts.aiSearch.enhancing : t.contacts.aiSearch.enhance}
              </Button>
              <Button size="sm" onClick={() => handleSearch('standard')} disabled={!query.trim()}>
                <Search className="mr-1.5 h-3.5 w-3.5" />
                {t.contacts.aiSearch.search}
              </Button>
              <Button size="sm" variant="outline" onClick={() => handleSearch('deep')} disabled={!query.trim()}>
                <Search className="mr-1.5 h-3.5 w-3.5" />
                {t.contacts.aiSearch.deepSearch}
              </Button>
            </div>
          </div>
        )}

        {step === 'query' && loading && (
          <div className="flex flex-col items-center justify-center gap-4 py-12 flex-1">
            <div className="relative">
              <div className="h-10 w-10 rounded-full border-2 border-muted" />
              <div className="absolute inset-0 h-10 w-10 rounded-full border-2 border-t-primary animate-spin" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium">{t.contacts.aiSearch.searching}</p>
              <p className="text-xs text-muted-foreground mt-1">{t.contacts.aiSearch.searchingHint}</p>
            </div>
          </div>
        )}

        {step === 'results' && (
          <div className="flex flex-col gap-3 flex-1 min-h-0">
            <div className="flex items-center justify-between">
              <button onClick={() => setStep('query')} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                <ArrowLeft className="h-3 w-3" />
                {t.contacts.aiSearch.back}
              </button>
              <p className="text-xs text-muted-foreground">{t.contacts.aiSearch.resultsTitle(results.length)}</p>
            </div>

            {results.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">{t.contacts.aiSearch.noResults}</p>
            ) : (
              <div className="flex-1 min-h-0 overflow-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr className="text-left">
                      <th className="p-2 w-8"></th>
                      <th className="p-2 font-medium text-xs">{t.contacts.columns.firstName}</th>
                      <th className="p-2 font-medium text-xs">{t.contacts.columns.lastName}</th>
                      <th className="p-2 font-medium text-xs">{t.contacts.columns.company}</th>
                      <th className="p-2 font-medium text-xs">{t.contacts.columns.position}</th>
                      <th className="p-2 font-medium text-xs">{t.contacts.columns.email}</th>
                      <th className="p-2 font-medium text-xs">{t.contacts.columns.city}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((c, i) => {
                      const isExisting = c.email && existingEmails.includes(c.email.toLowerCase());
                      return (
                        <tr key={i} className={`border-t ${isExisting ? 'opacity-50' : 'hover:bg-muted/30'}`}>
                          <td className="p-2">
                            {isExisting ? (
                              <span className="text-[10px] text-muted-foreground">{t.contacts.aiSearch.alreadyExists}</span>
                            ) : (
                              <Checkbox
                                checked={selected.has(i)}
                                onCheckedChange={(checked) => {
                                  setSelected(prev => {
                                    const next = new Set(prev);
                                    if (checked) next.add(i); else next.delete(i);
                                    return next;
                                  });
                                }}
                              />
                            )}
                          </td>
                          <td className="p-2">{c.first_name}</td>
                          <td className="p-2">{c.last_name}</td>
                          <td className="p-2">{c.company_name}</td>
                          <td className="p-2">{c.job_title}</td>
                          <td className="p-2 text-xs">{c.email || '—'}</td>
                          <td className="p-2 text-xs">{c.location || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {results.length > 0 && (
              <div className="flex justify-end">
                <Button size="sm" onClick={handleImport} disabled={importing || selected.size === 0}>
                  {importing && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                  {t.contacts.aiSearch.importSelected(selected.size)}
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function ContactsPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [ownerFilter, setOwnerFilter] = useState('all');
  const [search, setSearch] = useState('');

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [bulkAssigning, setBulkAssigning] = useState(false);
  const [bulkOwner, setBulkOwner] = useState('');
  const [serverOwnerCounts, setServerOwnerCounts] = useState<Record<string, number>>({});
  const [previewLine, setPreviewLine] = useState<{ name: string; text: string } | null>(null);
  const [sortKeys, setSortKeys] = useState<{ column: string; direction: 'asc' | 'desc' }[]>([{ column: 'created_at', direction: 'desc' }]);
  const [totalContacts, setTotalContacts] = useState(0);

  const [searchDialogOpen, setSearchDialogOpen] = useState(false);

  const lastClickedIndexRef = useRef<number | null>(null);
  const { startScoring, startPersonalizing, startEnrichment, getRunningJobContactIds, onJobCompleted } = useBackgroundJobs();
  const scoringIds = getRunningJobContactIds('score');
  const personalizingIds = getRunningJobContactIds('personalize');
  const enrichingIds = getRunningJobContactIds('enrich');

  const fetchContacts = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: '10000', include_team: 'true' });
      if (statusFilter && statusFilter !== 'all') params.set('status', statusFilter);
      if (ownerFilter && ownerFilter !== 'all') params.set('owner', ownerFilter);

      const response = await apiFetch(`/api/contacts?${params}`);
      if (response.ok) {
        const data = await response.json();
        setContacts(data.contacts);
        if (data.teamMembers) setTeamMembers(data.teamMembers);
        if (data.currentUserId) setCurrentUserId(data.currentUserId);
        if (data.ownerCounts) setServerOwnerCounts(data.ownerCounts);
        setTotalContacts(data.ownerCounts?.__total || data.total || 0);
      }
    } catch (error) {
      console.error('Error fetching contacts:', error);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, ownerFilter]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  useEffect(() => {
    return onJobCompleted(() => fetchContacts());
  }, [onJobCompleted, fetchContacts]);

  const handleRowSelect = (id: string, index: number, event: React.MouseEvent) => {
    if (event.shiftKey && lastClickedIndexRef.current !== null) {
      const start = Math.min(lastClickedIndexRef.current, index);
      const end = Math.max(lastClickedIndexRef.current, index);
      setSelectedIds(prev => {
        const next = new Set(prev);
        for (let i = start; i <= end; i++) {
          next.add(filtered[i].id);
        }
        return next;
      });
    } else {
      setSelectedIds(prev => {
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

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(c => c.id)));
    }
  };

  const handleBulkDelete = async () => {
    setBulkDeleting(true);
    try {
      const response = await apiFetch('/api/contacts/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_ids: Array.from(selectedIds) }),
      });
      if (response.ok) {
        setSelectedIds(new Set());
        fetchContacts();
        toast.success(t.contacts.toasts.deleted);
      } else {
        const data = await response.json();
        console.error('Bulk delete failed:', response.status, data);
        toast.error(data.error || t.contacts.toasts.deleteError);
      }
    } catch (error) {
      console.error('Bulk delete error:', error);
      toast.error(t.contacts.toasts.deleteError);
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleBulkAssign = async () => {
    if (!bulkOwner) return;
    setBulkAssigning(true);
    try {
      const assignValue = bulkOwner === 'unassigned' ? null : bulkOwner;
      const promises = Array.from(selectedIds).map(id =>
        apiFetch(`/api/contacts/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ assigned_to: assignValue }),
        })
      );
      await Promise.all(promises);
      toast.success(t.contacts.toasts.assigned(selectedIds.size));
      setSelectedIds(new Set());
      setBulkOwner('');
      fetchContacts();
    } catch (error) {
      console.error('Bulk assign error:', error);
      toast.error(t.contacts.toasts.assignError);
    } finally {
      setBulkAssigning(false);
    }
  };

  const handleBulkScore = () => {
    const ids = Array.from(selectedIds);
    startScoring(ids);
    setSelectedIds(new Set());
  };

  const handleBulkEnrich = () => {
    const ids = Array.from(selectedIds);
    startEnrichment(ids);
    setSelectedIds(new Set());
  };

  const handleBulkPersonalize = () => {
    const ids = Array.from(selectedIds);
    startPersonalizing(ids);
    setSelectedIds(new Set());
  };

  const handleCellUpdate = (contactId: string, field: string, value: string | null) => {
    setContacts(prev =>
      prev.map(c =>
        c.id === contactId ? { ...c, [field]: value } : c
      )
    );
  };

  const getOwnerName = useCallback((assignedTo: string | null) => {
    if (!assignedTo) return '';
    const member = teamMembers.find(m => m.user_id === assignedTo);
    return member?.display_name || member?.email?.split('@')[0] || '';
  }, [teamMembers]);

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

  const filtered = contacts
    .filter((c) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        c.email?.toLowerCase().includes(q) ||
        c.first_name?.toLowerCase().includes(q) ||
        c.last_name?.toLowerCase().includes(q) ||
        c.company_name?.toLowerCase().includes(q) ||
        c.location?.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      for (const { column, direction } of sortKeys) {
        const dir = direction === 'asc' ? 1 : -1;
        let result = 0;

        if (column === 'ai_score') {
          const scoreA = a.ai_score ?? -1;
          const scoreB = b.ai_score ?? -1;
          result = (scoreA - scoreB) * dir;
        } else {
          let valA: string | null | undefined;
          let valB: string | null | undefined;

          if (column === 'assigned_to') {
            valA = getOwnerName(a.assigned_to);
            valB = getOwnerName(b.assigned_to);
          } else {
            valA = (a as any)[column];
            valB = (b as any)[column];
          }

          if (valA == null && valB == null) result = 0;
          else if (valA == null) result = 1;
          else if (valB == null) result = -1;
          else result = String(valA).localeCompare(String(valB), 'fr', { sensitivity: 'base' }) * dir;
        }

        if (result !== 0) return result;
      }
      return 0;
    });

  // Use server-side counts for the owner filter dropdown
  const ownerCounts = serverOwnerCounts;

  const COLUMNS = [
    { key: 'assigned_to', label: t.contacts.columns.owner, type: 'owner' as const },
    { key: 'ai_score', label: t.contacts.columns.aiScore, type: 'ai_score' as const },
    { key: 'ai_personalized_line', label: t.contacts.columns.aiPersonalization, type: 'ai_personalized' as const },
    { key: 'status', label: t.contacts.columns.status, type: 'status' as const },
    { key: 'company_name', label: t.contacts.columns.company, type: 'text' as const },
    { key: 'company_domain', label: t.contacts.columns.website, type: 'text' as const },
    { key: 'location', label: t.contacts.columns.city, type: 'text' as const },
    { key: 'first_name', label: t.contacts.columns.firstName, type: 'text' as const },
    { key: 'last_name', label: t.contacts.columns.lastName, type: 'text' as const },
    { key: 'email', label: t.contacts.columns.email, type: 'text' as const },
    { key: 'linkedin_url', label: t.contacts.columns.linkedin, type: 'text' as const },
    { key: 'job_title', label: t.contacts.columns.position, type: 'text' as const },
    { key: 'education', label: t.contacts.columns.education, type: 'text' as const },
    { key: 'phone', label: t.contacts.columns.phone, type: 'text' as const },
    { key: 'notes', label: t.contacts.columns.notes, type: 'text' as const },
    { key: 'created_at', label: t.contacts.columns.addedAt, type: 'readonly-date' as const },
    { key: 'first_contact', label: t.contacts.columns.firstContact, type: 'date' as const },
    { key: 'follow_up_1', label: t.contacts.columns.followUp1, type: 'readonly-date' as const },
    { key: 'follow_up_2', label: t.contacts.columns.followUp2, type: 'readonly-date' as const },
    { key: 'second_contact', label: t.contacts.columns.secondContact, type: 'date' as const },
    { key: 'third_contact', label: t.contacts.columns.thirdContact, type: 'date' as const },
  ];

  return (
    <>
      <SiteHeader title={t.contacts.title} />
      <div className="page-container">
        <div className="page-content">
          {/* Toolbar — always visible */}
          <div className="flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2 flex-1">
              <Input
                placeholder={t.contacts.searchPlaceholder}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="max-w-[200px] h-8 text-sm"
              />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px] h-8 text-xs">
                  <SelectValue placeholder={t.common.status} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t.statuses.allStatuses}</SelectItem>
                  <SelectItem value="hot_leads">{t.contacts.hotLeads}</SelectItem>
                  <SelectItem value="new">{t.statuses.new}</SelectItem>
                  <SelectItem value="contacted">{t.statuses.contacted}</SelectItem>
                  <SelectItem value="engaged">{t.statuses.engaged}</SelectItem>
                  <SelectItem value="qualified">{t.statuses.qualified}</SelectItem>
                  <SelectItem value="meeting_scheduled">{t.statuses.meeting_scheduled}</SelectItem>
                  <SelectItem value="opportunity">{t.statuses.opportunity}</SelectItem>
                  <SelectItem value="customer">{t.statuses.customer}</SelectItem>
                  <SelectItem value="lost">{t.statuses.lost}</SelectItem>
                  <SelectItem value="do_not_contact">{t.statuses.do_not_contact}</SelectItem>
                </SelectContent>
              </Select>
              <Select value={ownerFilter} onValueChange={setOwnerFilter}>
                <SelectTrigger className="w-[180px] h-8 text-xs">
                  <SelectValue placeholder={t.common.owner} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t.common.all} ({ownerCounts['__total'] || totalContacts})</SelectItem>
                  <SelectItem value="me">{t.contacts.myContacts} ({ownerCounts[currentUserId] || 0})</SelectItem>
                  {teamMembers.map(member => (
                    <SelectItem key={member.user_id} value={member.user_id}>
                      {member.display_name || member.email.split('@')[0]} ({ownerCounts[member.user_id] || 0})
                    </SelectItem>
                  ))}
                  <SelectItem value="unassigned">{t.contacts.unassignedContacts} ({ownerCounts['unassigned'] || 0})</SelectItem>
                </SelectContent>
              </Select>
              <CompactStatsBar stats={[
                { label: t.contacts.displayed, value: filtered.length },
                { label: t.contacts.total, value: ownerCounts['__total'] || totalContacts },
              ]} />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => router.push('/contacts/import')}>
                <Upload className="mr-1.5 h-3.5 w-3.5" />
                {t.contacts.csv}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setSearchDialogOpen(true)}>
                <Search className="mr-1.5 h-3.5 w-3.5" />
                {t.contacts.aiSearch.button}
              </Button>
              <Button size="sm" onClick={() => router.push('/contacts/new')}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                {t.contacts.newButton}
              </Button>
            </div>
          </div>

          {/* Scrollable table area — fills remaining height, scrolls both axes */}
          {loading ? (
            <div className="flex-1 min-h-0 space-y-3">
              <div className="flex gap-2 shrink-0">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-[140px] rounded" />
                ))}
              </div>
              <div className="flex-1 rounded-lg border bg-card p-3 space-y-3">
                <Skeleton className="h-8 w-full rounded" />
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full rounded" />
                ))}
              </div>
            </div>
          ) : (
            <div className="table-scroll-wrapper">
            <div className="h-full overflow-auto rounded-lg border bg-card" onScroll={(e) => {
              const el = e.currentTarget;
              const wrapper = el.parentElement;
              if (wrapper) {
                const atRight = el.scrollLeft + el.clientWidth >= el.scrollWidth - 10;
                if (atRight) wrapper.setAttribute('data-scrolled-right', '');
                else wrapper.removeAttribute('data-scrolled-right');
              }
            }}>
              <table className="text-sm border-collapse" style={{ minWidth: '2200px' }}>
                <thead className="bg-muted/50 sticky top-0 z-10">
                  <tr className="border-b">
                    <th className="h-9 px-2 text-left text-xs font-medium w-10 sticky left-0 bg-muted/50 z-20">
                      <Checkbox
                        checked={filtered.length > 0 && selectedIds.size === filtered.length}
                        onCheckedChange={toggleSelectAll}
                      />
                    </th>
                    {COLUMNS.map(col => {
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
                  {filtered.length > 0 ? (
                    filtered.map((contact, index) => (
                      <tr key={contact.id} className="border-b hover:bg-muted/30 transition-colors">
                        <td
                          className="px-2 py-1 sticky left-0 bg-card z-10 cursor-pointer select-none"
                          onClick={(e) => handleRowSelect(contact.id, index, e)}
                        >
                          <div className="flex items-center gap-1.5">
                            <Checkbox
                              checked={selectedIds.has(contact.id)}
                              className="pointer-events-none"
                              onCheckedChange={() => {}}
                            />
                            {enrichingIds.has(contact.id) && (
                              <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
                            )}
                          </div>
                        </td>
                        {COLUMNS.map(col => (
                          <td key={col.key} className="px-3 py-1">
                            {col.type === 'ai_score' ? (
                              scoringIds.has(contact.id) ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-500" />
                              ) : (
                                <AIScoreBadge
                                  score={contact.ai_score}
                                  label={contact.ai_score_label}
                                  reasoning={contact.ai_score_reasoning}
                                  compact
                                />
                              )
                            ) : col.type === 'ai_personalized' ? (
                              personalizingIds.has(contact.id) ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin text-purple-500" />
                              ) : contact.ai_personalized_line ? (
                                <button
                                  type="button"
                                  className="text-xs max-w-[200px] truncate block text-left cursor-pointer hover:text-primary transition-colors"
                                  onClick={() => setPreviewLine({
                                    name: [contact.first_name, contact.last_name].filter(Boolean).join(' ') || contact.email || '',
                                    text: contact.ai_personalized_line!,
                                  })}
                                >
                                  {contact.ai_personalized_line}
                                </button>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )
                            ) : (
                              <EditableCell
                                contactId={contact.id}
                                field={col.key}
                                value={(contact as any)[col.key]}
                                type={col.type}
                                teamMembers={col.type === 'owner' ? teamMembers : undefined}
                                onUpdate={handleCellUpdate}
                              />
                            )}
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={COLUMNS.length + 1} className="h-48">
                        <div className="flex flex-col items-center justify-center text-center py-8">
                          <Users className="h-10 w-10 text-muted-foreground mb-3" />
                          <h3 className="text-sm font-medium mb-1">{t.contacts.emptyState.title}</h3>
                          <p className="text-xs text-muted-foreground mb-4">{t.contacts.emptyState.description}</p>
                          <Button size="sm" onClick={() => router.push('/contacts/new')}>
                            <Plus className="mr-1.5 h-3.5 w-3.5" />
                            {t.contacts.newButton}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            </div>
          )}
        </div>
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-background border shadow-lg rounded-lg px-6 py-3">
          <span className="text-sm font-medium">{t.common.nSelected(selectedIds.size)}</span>
          <div className="flex items-center gap-2 border-l pl-3">
            <UserCheck className="h-3.5 w-3.5 text-muted-foreground" />
            <Select value={bulkOwner} onValueChange={setBulkOwner}>
              <SelectTrigger className="h-7 w-[160px] text-xs">
                <SelectValue placeholder={t.contacts.bulkActions.assignTo} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">{t.common.unassigned}</SelectItem>
                {teamMembers.map(member => (
                  <SelectItem key={member.user_id} value={member.user_id}>
                    {member.display_name || member.email.split('@')[0]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={handleBulkAssign}
              disabled={!bulkOwner || bulkAssigning}
            >
              {bulkAssigning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t.contacts.bulkActions.assign}
            </Button>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleBulkEnrich}
          >
            <Search className="mr-1.5 h-3.5 w-3.5" />
            {t.contacts.enrich.button}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleBulkScore}
          >
            <Brain className="mr-1.5 h-3.5 w-3.5" />
            {t.contacts.bulkActions.aiScore}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleBulkPersonalize}
          >
            <Sparkles className="mr-1.5 h-3.5 w-3.5" />
            {t.contacts.bulkActions.personalize}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setConfirmDeleteOpen(true)}
            disabled={bulkDeleting}
          >
            {bulkDeleting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Trash2 className="mr-1.5 h-3.5 w-3.5" />}
            {t.contacts.bulkActions.delete}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
            <X className="mr-1.5 h-3.5 w-3.5" />
            {t.contacts.bulkActions.deselect}
          </Button>
        </div>
      )}

      {/* Personalization preview dialog */}
      <Dialog open={!!previewLine} onOpenChange={(open) => !open && setPreviewLine(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-purple-600" />
              {t.contacts.personalizationPreview.title(previewLine?.name ?? '')}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm leading-relaxed italic">
            &ldquo;{previewLine?.text}&rdquo;
          </p>
          <p className="text-[10px] text-muted-foreground">
            {t.contacts.personalizationPreview.hint}
          </p>
        </DialogContent>
      </Dialog>

      <AiSearchDialog open={searchDialogOpen} onOpenChange={setSearchDialogOpen} onImported={fetchContacts} />

      {/* Delete confirmation dialog */}
      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.contacts.deleteDialog.title(selectedIds.size)}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.contacts.deleteDialog.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                setConfirmDeleteOpen(false);
                handleBulkDelete();
              }}
            >
              {t.common.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
