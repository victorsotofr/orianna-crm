'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { SiteHeader } from '@/components/site-header';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Save, Plus, X, Rocket } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { apiFetch } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { DEFAULT_SEQUENCE_DELAYS, MAX_SEQUENCE_STEPS } from '@/types/sequences';
import type { CampaignSequenceStep } from '@/types/sequences';

interface Template {
  id: string;
  name: string;
  subject: string;
}

interface Contact {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  company_name: string | null;
  status: string | null;
  assigned_to: string | null;
}

interface TeamMember {
  user_id: string;
  display_name: string;
  email: string;
}

export default function NewSequencePage() {
  const router = useRouter();
  const { t } = useTranslation();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [ownerFilter, setOwnerFilter] = useState('all');
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string>('');

  // Sequence steps: always start with step 0 (initial email)
  const [steps, setSteps] = useState<CampaignSequenceStep[]>([
    {
      step_order: 0,
      template_id: '',
      delay_days: DEFAULT_SEQUENCE_DELAYS.step_0,
    },
  ]);

  const fetchData = useCallback(async () => {
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setCurrentUserId(user.id);

      const [templatesRes, contactsRes, teamRes] = await Promise.all([
        supabase
          .from('templates')
          .select('id, name, subject')
          .eq('is_active', true)
          .order('created_at', { ascending: false }),
        supabase
          .from('contacts')
          .select('id, first_name, last_name, email, company_name, status, assigned_to')
          .not('status', 'in', '("lost","do_not_contact","customer")')
          .order('created_at', { ascending: false }),
        supabase
          .from('workspace_members')
          .select('user_id, display_name, email')
          .order('display_name', { ascending: true }),
      ]);

      if (templatesRes.data) setTemplates(templatesRes.data);
      if (contactsRes.data) setContacts(contactsRes.data);
      if (teamRes.data) setTeamMembers(teamRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error(t.common.networkError);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredContacts = contacts.filter(c => {
    // Status filter
    if (statusFilter !== 'all') {
      if (statusFilter === 'hot_leads') {
        const hasHighScore = c.status && ['qualified', 'opportunity'].includes(c.status);
        if (!hasHighScore) return false;
      } else if (c.status !== statusFilter) {
        return false;
      }
    }

    // Owner filter
    if (ownerFilter !== 'all') {
      if (ownerFilter === 'me') {
        if (c.assigned_to !== currentUserId) return false;
      } else if (ownerFilter === 'unassigned') {
        if (c.assigned_to) return false;
      } else if (c.assigned_to !== ownerFilter) {
        return false;
      }
    }

    // Search query
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        c.email?.toLowerCase().includes(q) ||
        c.first_name?.toLowerCase().includes(q) ||
        c.last_name?.toLowerCase().includes(q) ||
        c.company_name?.toLowerCase().includes(q)
      );
    }

    return true;
  });

  const addStep = () => {
    if (steps.length >= MAX_SEQUENCE_STEPS) {
      toast.error(t.sequences.maxSteps);
      return;
    }

    const nextStepNumber = steps.length;
    const defaultDelay = nextStepNumber === 1
      ? DEFAULT_SEQUENCE_DELAYS.step_1
      : DEFAULT_SEQUENCE_DELAYS.step_2;

    setSteps([...steps, {
      step_order: nextStepNumber,
      template_id: '',
      delay_days: defaultDelay,
    }]);
  };

  const removeStep = (stepNumber: number) => {
    if (stepNumber === 0) return; // Cannot remove initial email
    setSteps(steps.filter(s => s.step_order !== stepNumber).map((s, idx) => ({
      ...s,
      step_order: idx,
    })));
  };

  const updateStep = (stepNumber: number, field: keyof CampaignSequenceStep, value: string | number) => {
    setSteps(steps.map(s =>
      s.step_order === stepNumber ? { ...s, [field]: value } : s
    ));
  };

  const toggleContactSelection = (contactId: string) => {
    setSelectedContacts(prev => {
      const next = new Set(prev);
      if (next.has(contactId)) {
        next.delete(contactId);
      } else {
        next.add(contactId);
      }
      return next;
    });
  };

  const toggleAllContacts = () => {
    if (selectedContacts.size === filteredContacts.length) {
      setSelectedContacts(new Set());
    } else {
      setSelectedContacts(new Set(filteredContacts.map(c => c.id)));
    }
  };

  const handleSave = async () => {
    // Validation
    if (!name.trim()) {
      toast.error(t.sequences.toasts.nameRequired);
      return;
    }

    if (steps.some(s => !s.template_id)) {
      toast.error(t.sequences.toasts.templateRequired);
      return;
    }

    if (selectedContacts.size === 0) {
      toast.error(t.sequences.toasts.contactsRequired);
      return;
    }

    setSaving(true);
    try {
      const response = await apiFetch('/api/campaigns/sequences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          steps,
          contactIds: Array.from(selectedContacts),
        }),
      });

      if (response.ok) {
        const { campaign } = await response.json();
        toast.success(t.sequences.toasts.created);
        router.push(`/campaigns/${campaign.id}`);
      } else {
        const data = await response.json();
        toast.error(data.error || t.sequences.toasts.createError);
      }
    } catch {
      toast.error(t.sequences.toasts.createError);
    } finally {
      setSaving(false);
    }
  };

  const getStepLabel = (stepNumber: number) => {
    if (stepNumber === 0) return t.sequences.initialEmail;
    return t.sequences.followUp(stepNumber);
  };

  return (
    <>
      <SiteHeader title={t.sequences.newSequence} />
      <div className="page-container">
        <div className="page-content">
          {/* Top bar */}
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={() => router.push('/campaigns')}>
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
              {t.common.back}
            </Button>
            <Button onClick={handleSave} disabled={saving || loading}>
              {saving ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Rocket className="mr-1.5 h-3.5 w-3.5" />
              )}
              {t.sequences.launch}
            </Button>
          </div>

          {loading ? (
            <div className="space-y-4">
              <Skeleton className="h-20 w-full rounded-lg" />
              <Skeleton className="h-32 w-full rounded-lg" />
              <Skeleton className="h-64 w-full rounded-lg" />
            </div>
          ) : (
            <>
              {/* Campaign details */}
              <div className="border rounded-lg p-4 space-y-4 bg-card">
                <div className="space-y-2">
                  <Label htmlFor="name">{t.sequences.campaignName}</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t.sequences.campaignNamePlaceholder}
                    className="text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">{t.sequences.description}</Label>
                  <Input
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder={t.sequences.descriptionPlaceholder}
                    className="text-sm"
                  />
                </div>
              </div>

              {/* Sequence steps */}
              <div className="border rounded-lg p-4 space-y-4 bg-card">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium">
                    {t.sequences.title}
                  </h3>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={addStep}
                    disabled={steps.length >= MAX_SEQUENCE_STEPS}
                  >
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    {t.sequences.addStep}
                  </Button>
                </div>

                <div className="space-y-3">
                  {steps.map((step, index) => (
                    <div key={step.step_order} className="border rounded-lg p-3 space-y-3 bg-muted/30">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-xs">
                            {getStepLabel(step.step_order)}
                          </Badge>
                          {step.step_order > 0 && (
                            <span className="text-xs text-muted-foreground">
                              {t.sequences.delayDays(step.delay_days)} {t.sequences.afterPrevious}
                            </span>
                          )}
                        </div>
                        {step.step_order > 0 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeStep(step.step_order)}
                            className="h-7"
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs">{t.sequences.selectTemplate}</Label>
                          <Select
                            value={step.template_id}
                            onValueChange={(value) => updateStep(step.step_order, 'template_id', value)}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder={t.sequences.selectTemplate} />
                            </SelectTrigger>
                            <SelectContent>
                              {templates.map(tmpl => (
                                <SelectItem key={tmpl.id} value={tmpl.id} className="text-xs">
                                  {tmpl.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {step.step_order > 0 && (
                          <div className="space-y-1.5">
                            <Label className="text-xs">{t.sequences.delay}</Label>
                            <Input
                              type="number"
                              min="1"
                              max="30"
                              value={step.delay_days}
                              onChange={(e) => updateStep(step.step_order, 'delay_days', parseInt(e.target.value) || 1)}
                              className="h-8 text-xs"
                            />
                          </div>
                        )}
                      </div>

                      {step.template_id && (
                        <div className="text-xs text-muted-foreground">
                          {templates.find(t => t.id === step.template_id)?.subject}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Contact selection */}
              <div className="border rounded-lg p-4 space-y-4 bg-card">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium">
                    {t.sequences.selectContacts}
                  </h3>
                  <Badge variant="outline" className="text-xs">
                    {t.sequences.contactsSelected(selectedContacts.size)}
                  </Badge>
                </div>

                {/* Filters */}
                <div className="flex items-center gap-2 flex-wrap">
                  <Input
                    placeholder={t.campaigns.searchPlaceholder}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
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
                    <SelectTrigger className="w-[140px] h-8 text-xs">
                      <SelectValue placeholder={t.contacts.myContacts} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t.statuses.allStatuses}</SelectItem>
                      <SelectItem value="me">{t.contacts.myContacts}</SelectItem>
                      <SelectItem value="unassigned">{t.contacts.unassignedContacts}</SelectItem>
                      {teamMembers.map(member => (
                        <SelectItem key={member.user_id} value={member.user_id} className="text-xs">
                          {member.display_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="border rounded-lg overflow-hidden max-h-[400px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 sticky top-0 z-10">
                      <tr className="border-b">
                        <th className="h-9 px-3 text-left w-10">
                          <Checkbox
                            checked={filteredContacts.length > 0 && selectedContacts.size === filteredContacts.length}
                            onCheckedChange={toggleAllContacts}
                          />
                        </th>
                        <th className="h-9 px-3 text-left text-xs font-medium">
                          {t.campaigns.tableHeaders.name}
                        </th>
                        <th className="h-9 px-3 text-left text-xs font-medium">
                          {t.campaigns.tableHeaders.email}
                        </th>
                        <th className="h-9 px-3 text-left text-xs font-medium">
                          {t.campaigns.tableHeaders.company}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredContacts.map(contact => (
                        <tr key={contact.id} className="border-b hover:bg-muted/30">
                          <td className="px-3 py-2">
                            <Checkbox
                              checked={selectedContacts.has(contact.id)}
                              onCheckedChange={() => toggleContactSelection(contact.id)}
                            />
                          </td>
                          <td className="px-3 py-2 text-xs font-medium">
                            {contact.first_name} {contact.last_name}
                          </td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">
                            {contact.email}
                          </td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">
                            {contact.company_name || '\u2014'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
