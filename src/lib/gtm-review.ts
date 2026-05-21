import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { startBulkEnrichment } from '@/lib/fullenrich';
import { isGenericInbox } from '@/lib/gtm-safety';
import { renderTemplate } from '@/lib/template-renderer';

export type GtmReviewAction = 'approve_queue' | 'reject' | 'hold' | 'reenrich';
export type GtmReviewSource = 'web' | 'telegram' | 'voice' | 'system';
export type GtmReviewFilter = 'all' | 'pending' | 'ready' | 'blocked' | 'approved' | 'rejected' | 'queued';

const GTM_CONTACT_SELECT = [
  'id',
  'workspace_id',
  'email',
  'first_name',
  'last_name',
  'company_name',
  'company_domain',
  'job_title',
  'linkedin_url',
  'location',
  'status',
  'source',
  'source_query',
  'source_url',
  'segment',
  'persona',
  'raw_data',
  'ai_score',
  'ai_score_label',
  'ai_score_reasoning',
  'ai_personalized_line',
  'email_verified_status',
  'email_bounced',
  'replied_at',
  'opted_out_at',
  'suppressed_reason',
  'gtm_review_status',
  'gtm_send_approved_at',
  'gtm_send_approved_by',
  'created_at',
].join(',');

const EXCLUDED_APPROVAL_STATUSES = new Set(['engaged', 'qualified', 'lost', 'do_not_contact', 'customer']);

interface GtmContactRecord {
  id: string;
  workspace_id: string | null;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  company_domain: string | null;
  job_title: string | null;
  linkedin_url: string | null;
  location: string | null;
  status: string | null;
  source: string | null;
  source_query: string | null;
  source_url: string | null;
  segment: string | null;
  persona: string | null;
  raw_data: Record<string, unknown> | null;
  ai_score: number | null;
  ai_score_label: string | null;
  ai_score_reasoning: string | null;
  ai_personalized_line: string | null;
  email_verified_status: string | null;
  email_bounced: boolean | null;
  replied_at: string | null;
  opted_out_at: string | null;
  suppressed_reason: string | null;
  gtm_review_status: 'pending' | 'approved' | 'rejected' | null;
  gtm_send_approved_at: string | null;
  gtm_send_approved_by: string | null;
  created_at: string;
}

interface SequenceContext {
  sequenceId: string | null;
  sequenceName: string | null;
  sequenceStatus: string | null;
  firstStepId: string | null;
  firstStepDelayDays: number;
  templateName: string | null;
  templateSubject: string | null;
  templateHtml: string | null;
  blocker: string | null;
}

export interface GtmReviewItem {
  id: string;
  name: string;
  email: string | null;
  companyName: string | null;
  companyDomain: string | null;
  jobTitle: string | null;
  linkedinUrl: string | null;
  location: string | null;
  sourceUrl: string | null;
  sourceQuery: string | null;
  icpFit: string | null;
  aiScore: number | null;
  aiScoreLabel: string | null;
  aiScoreReasoning: string | null;
  personalizedLine: string | null;
  emailVerifiedStatus: string | null;
  reviewStatus: 'pending' | 'approved' | 'rejected';
  sendApprovedAt: string | null;
  isQueued: boolean;
  readyForApproval: boolean;
  readiness: 'ready' | 'blocked' | 'queued' | 'approved' | 'rejected';
  blockers: string[];
  warnings: string[];
  preview: {
    subject: string | null;
    text: string | null;
  };
  createdAt: string;
}

export interface GtmReviewCounts {
  total: number;
  pending: number;
  ready: number;
  blocked: number;
  approved: number;
  rejected: number;
  queued: number;
}

export interface GtmReviewQueue {
  counts: GtmReviewCounts;
  sequence: SequenceContext;
  items: GtmReviewItem[];
}

export interface GtmReviewResult {
  action: GtmReviewAction;
  updated: number;
  queued: number;
  enrichmentStarted: number;
  skipped: number;
  skippedContacts: Array<{ id: string; name: string; reasons: string[] }>;
}

export async function getGtmReviewQueue(input: {
  db: SupabaseClient;
  workspaceId: string;
  status?: GtmReviewFilter;
  limit?: number;
}): Promise<GtmReviewQueue> {
  const sequence = await getSequenceContext(input.db, input.workspaceId);
  const { data: contactRows, error: contactsError } = await input.db
    .from('contacts')
    .select(GTM_CONTACT_SELECT)
    .eq('workspace_id', input.workspaceId)
    .eq('source', 'gtm_autopilot')
    .order('created_at', { ascending: false })
    .limit(2000);

  if (contactsError) throw contactsError;

  const contacts = ((contactRows || []) as unknown[]).map((row) => row as GtmContactRecord);
  const queuedContactIds = await getQueuedContactIds(input.db, input.workspaceId, contacts.map((contact) => contact.id), sequence.sequenceId);
  const allItems = contacts.map((contact) => buildReviewItem(contact, sequence, queuedContactIds));
  const counts = buildCounts(allItems);
  const filtered = filterItems(allItems, input.status || 'pending').slice(0, input.limit ?? 50);

  return { counts, sequence, items: filtered };
}

export async function applyGtmReviewAction(input: {
  db: SupabaseClient;
  workspaceId: string;
  userId: string;
  contactIds: string[];
  action: GtmReviewAction;
  source: GtmReviewSource;
  note?: string;
}): Promise<GtmReviewResult> {
  const contactIds = [...new Set(input.contactIds)].filter(Boolean);
  if (contactIds.length === 0) {
    return emptyResult(input.action);
  }

  const { data: contactRows, error: contactsError } = await input.db
    .from('contacts')
    .select(GTM_CONTACT_SELECT)
    .eq('workspace_id', input.workspaceId)
    .eq('source', 'gtm_autopilot')
    .in('id', contactIds);

  if (contactsError) throw contactsError;

  const contacts = ((contactRows || []) as unknown[]).map((row) => row as GtmContactRecord);
  const sequence = await getSequenceContext(input.db, input.workspaceId);
  const queuedContactIds = await getQueuedContactIds(input.db, input.workspaceId, contacts.map((contact) => contact.id), sequence.sequenceId);
  const items = contacts.map((contact) => buildReviewItem(contact, sequence, queuedContactIds));

  if (input.action === 'reenrich') {
    return startReviewEnrichment(input, contacts);
  }

  if (input.action === 'approve_queue') {
    return approveAndQueue(input, items, sequence);
  }

  const reviewStatus = input.action === 'reject' ? 'rejected' : 'pending';
  const update = input.action === 'reject'
    ? {
        gtm_review_status: 'rejected',
        gtm_send_approved_at: null,
        gtm_send_approved_by: null,
        suppressed_reason: 'gtm_rejected',
      }
    : {
        gtm_review_status: 'pending',
        gtm_send_approved_at: null,
        gtm_send_approved_by: null,
        suppressed_reason: null,
      };

  const { error: updateError } = await input.db
    .from('contacts')
    .update(update)
    .eq('workspace_id', input.workspaceId)
    .eq('source', 'gtm_autopilot')
    .in('id', contacts.map((contact) => contact.id));

  if (updateError) throw updateError;

  if (sequence.sequenceId) {
    await input.db
      .from('campaign_enrollments')
      .update({ status: 'paused' })
      .eq('workspace_id', input.workspaceId)
      .eq('sequence_id', sequence.sequenceId)
      .in('contact_id', contacts.map((contact) => contact.id))
      .eq('status', 'active');
  }

  await insertTimelineEvents(input.db, {
    workspaceId: input.workspaceId,
    userId: input.userId,
    source: input.source,
    note: input.note,
    contacts,
    eventType: input.action === 'reject' ? 'gtm_review_rejected' : 'gtm_review_hold',
    title: input.action === 'reject' ? 'GTM prospect rejected' : 'GTM prospect held for review',
    description: input.action === 'reject' ? 'Rejected from isimple GTM outreach.' : 'Returned to pending review.',
    metadata: { review_status: reviewStatus },
  });

  return {
    action: input.action,
    updated: contacts.length,
    queued: 0,
    enrichmentStarted: 0,
    skipped: Math.max(contactIds.length - contacts.length, 0),
    skippedContacts: [],
  };
}

function emptyResult(action: GtmReviewAction): GtmReviewResult {
  return { action, updated: 0, queued: 0, enrichmentStarted: 0, skipped: 0, skippedContacts: [] };
}

async function approveAndQueue(
  input: {
    db: SupabaseClient;
    workspaceId: string;
    userId: string;
    action: GtmReviewAction;
    source: GtmReviewSource;
    note?: string;
  },
  items: GtmReviewItem[],
  sequence: SequenceContext
): Promise<GtmReviewResult> {
  const readyItems = items.filter((item) => item.readyForApproval && !item.isQueued);
  const skippedContacts = items
    .filter((item) => !item.readyForApproval || item.isQueued)
    .map((item) => ({
      id: item.id,
      name: item.name,
      reasons: item.isQueued ? ['Already queued'] : item.blockers,
    }));

  if (readyItems.length === 0 || !sequence.sequenceId || !sequence.firstStepId) {
    return {
      action: input.action,
      updated: 0,
      queued: 0,
      enrichmentStarted: 0,
      skipped: skippedContacts.length,
      skippedContacts,
    };
  }

  const approvedAt = new Date().toISOString();
  const readyIds = readyItems.map((item) => item.id);
  const { error: updateError } = await input.db
    .from('contacts')
    .update({
      gtm_review_status: 'approved',
      gtm_send_approved_at: approvedAt,
      gtm_send_approved_by: input.userId,
      suppressed_reason: null,
    })
    .eq('workspace_id', input.workspaceId)
    .eq('source', 'gtm_autopilot')
    .in('id', readyIds);

  if (updateError) throw updateError;

  const nextSendAt = new Date();
  nextSendAt.setDate(nextSendAt.getDate() + sequence.firstStepDelayDays);

  const enrollments = readyItems.map((item) => ({
    workspace_id: input.workspaceId,
    sequence_id: sequence.sequenceId,
    contact_id: item.id,
    enrolled_by: input.userId,
    current_step_id: sequence.firstStepId,
    next_send_at: nextSendAt.toISOString(),
    status: 'active',
  }));

  const { data: inserted, error: enrollError } = await input.db
    .from('campaign_enrollments')
    .upsert(enrollments, {
      onConflict: 'sequence_id,contact_id',
      ignoreDuplicates: true,
    })
    .select('id');

  if (enrollError) throw enrollError;

  const contacts = readyItems.map((item) => ({
    id: item.id,
    first_name: item.name.split(' ')[0] || null,
    last_name: item.name.split(' ').slice(1).join(' ') || null,
  }));

  await insertTimelineEvents(input.db, {
    workspaceId: input.workspaceId,
    userId: input.userId,
    source: input.source,
    note: input.note,
    contacts,
    eventType: 'gtm_review_approved_queued',
    title: 'GTM approved and queued',
    description: `Approved for isimple GTM outreach. First email queued through "${sequence.sequenceName || 'active sequence'}".`,
    metadata: {
      review_status: 'approved',
      sequence_id: sequence.sequenceId,
      sequence_name: sequence.sequenceName,
      next_send_at: nextSendAt.toISOString(),
    },
  });

  return {
    action: input.action,
    updated: readyItems.length,
    queued: inserted?.length || 0,
    enrichmentStarted: 0,
    skipped: skippedContacts.length,
    skippedContacts,
  };
}

async function startReviewEnrichment(
  input: {
    db: SupabaseClient;
    workspaceId: string;
    userId: string;
    action: GtmReviewAction;
    source: GtmReviewSource;
    note?: string;
  },
  contacts: GtmContactRecord[]
): Promise<GtmReviewResult> {
  const { data: settings } = await input.db
    .from('user_settings')
    .select('fullenrich_api_key_encrypted')
    .eq('user_id', input.userId)
    .maybeSingle();

  const apiKey = (settings as { fullenrich_api_key_encrypted?: string | null } | null)?.fullenrich_api_key_encrypted;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!apiKey || !appUrl) {
    return {
      action: input.action,
      updated: 0,
      queued: 0,
      enrichmentStarted: 0,
      skipped: contacts.length,
      skippedContacts: contacts.map((contact) => ({
        id: contact.id,
        name: contactName(contact),
        reasons: [!apiKey ? 'FullEnrich API key missing' : 'NEXT_PUBLIC_APP_URL missing'],
      })),
    };
  }

  const enrichable = contacts.filter((contact) =>
    contact.first_name &&
    contact.last_name &&
    (contact.company_domain || contact.company_name || contact.linkedin_url)
  );

  if (enrichable.length === 0) {
    return {
      action: input.action,
      updated: 0,
      queued: 0,
      enrichmentStarted: 0,
      skipped: contacts.length,
      skippedContacts: contacts.map((contact) => ({
        id: contact.id,
        name: contactName(contact),
        reasons: ['Missing name plus company or LinkedIn data for enrichment'],
      })),
    };
  }

  const enrichmentId = await startBulkEnrichment(
    apiKey,
    enrichable.map((contact) => ({
      contact_id: contact.id,
      workspace_id: input.workspaceId,
      firstname: contact.first_name || '',
      lastname: contact.last_name || '',
      domain: contact.company_domain || undefined,
      company_name: contact.company_name || undefined,
      linkedin_url: contact.linkedin_url || undefined,
    })),
    `${appUrl}/api/webhooks/fullenrich`
  );

  await insertTimelineEvents(input.db, {
    workspaceId: input.workspaceId,
    userId: input.userId,
    source: input.source,
    note: input.note,
    contacts: enrichable,
    eventType: 'gtm_review_reenrich_started',
    title: 'GTM enrichment restarted',
    description: 'FullEnrich lookup started from the isimple review queue.',
    metadata: { enrichment_id: enrichmentId },
  });

  return {
    action: input.action,
    updated: enrichable.length,
    queued: 0,
    enrichmentStarted: enrichable.length,
    skipped: contacts.length - enrichable.length,
    skippedContacts: contacts
      .filter((contact) => !enrichable.some((item) => item.id === contact.id))
      .map((contact) => ({
        id: contact.id,
        name: contactName(contact),
        reasons: ['Missing name plus company or LinkedIn data for enrichment'],
      })),
  };
}

async function getSequenceContext(db: SupabaseClient, workspaceId: string): Promise<SequenceContext> {
  const { data: workspace, error: workspaceError } = await db
    .from('workspaces')
    .select('gtm_active_sequence_id')
    .eq('id', workspaceId)
    .maybeSingle();

  if (workspaceError) throw workspaceError;

  const sequenceId = (workspace as { gtm_active_sequence_id?: string | null } | null)?.gtm_active_sequence_id || null;
  if (!sequenceId) return emptySequence('No active GTM sequence configured');

  const { data: sequence, error: sequenceError } = await db
    .from('campaign_sequences')
    .select('id, name, status')
    .eq('id', sequenceId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  if (sequenceError) throw sequenceError;
  const sequenceRow = sequence as { id: string; name: string | null; status: string | null } | null;
  if (!sequenceRow) return emptySequence('Configured GTM sequence was not found');
  if (sequenceRow.status !== 'active') {
    return {
      ...emptySequence('Configured GTM sequence is not active'),
      sequenceId: sequenceRow.id,
      sequenceName: sequenceRow.name,
      sequenceStatus: sequenceRow.status,
    };
  }

  const { data: firstStep, error: stepError } = await db
    .from('campaign_sequence_steps')
    .select('id, template_id, delay_days')
    .eq('sequence_id', sequenceRow.id)
    .order('step_order', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (stepError) throw stepError;
  const stepRow = firstStep as { id: string; template_id: string | null; delay_days: number | null } | null;
  if (!stepRow?.id || !stepRow.template_id) {
    return {
      ...emptySequence('Active GTM sequence has no first email step'),
      sequenceId: sequenceRow.id,
      sequenceName: sequenceRow.name,
      sequenceStatus: sequenceRow.status,
    };
  }

  const { data: template, error: templateError } = await db
    .from('templates')
    .select('name, subject, html_content')
    .eq('id', stepRow.template_id)
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  if (templateError) throw templateError;
  const templateRow = template as { name: string | null; subject: string | null; html_content: string | null } | null;
  if (!templateRow) {
    return {
      ...emptySequence('First GTM sequence template was not found'),
      sequenceId: sequenceRow.id,
      sequenceName: sequenceRow.name,
      sequenceStatus: sequenceRow.status,
      firstStepId: stepRow.id,
      firstStepDelayDays: stepRow.delay_days || 0,
    };
  }

  return {
    sequenceId: sequenceRow.id,
    sequenceName: sequenceRow.name,
    sequenceStatus: sequenceRow.status,
    firstStepId: stepRow.id,
    firstStepDelayDays: stepRow.delay_days || 0,
    templateName: templateRow.name,
    templateSubject: templateRow.subject,
    templateHtml: templateRow.html_content,
    blocker: null,
  };
}

function emptySequence(blocker: string): SequenceContext {
  return {
    sequenceId: null,
    sequenceName: null,
    sequenceStatus: null,
    firstStepId: null,
    firstStepDelayDays: 0,
    templateName: null,
    templateSubject: null,
    templateHtml: null,
    blocker,
  };
}

async function getQueuedContactIds(
  db: SupabaseClient,
  workspaceId: string,
  contactIds: string[],
  sequenceId: string | null
): Promise<Set<string>> {
  if (!sequenceId || contactIds.length === 0) return new Set();

  const { data, error } = await db
    .from('campaign_enrollments')
    .select('contact_id')
    .eq('workspace_id', workspaceId)
    .eq('sequence_id', sequenceId)
    .in('contact_id', contactIds)
    .in('status', ['active', 'paused']);

  if (error) throw error;
  return new Set(((data || []) as Array<{ contact_id: string }>).map((row) => row.contact_id));
}

function buildReviewItem(contact: GtmContactRecord, sequence: SequenceContext, queuedContactIds: Set<string>): GtmReviewItem {
  const blockers = getReviewBlockers(contact, sequence);
  const warnings = getReviewWarnings(contact);
  const isQueued = queuedContactIds.has(contact.id);
  const reviewStatus = contact.gtm_review_status || 'pending';
  const readyForApproval = reviewStatus === 'pending' && blockers.length === 0;
  const preview = buildEmailPreview(contact, sequence);

  return {
    id: contact.id,
    name: contactName(contact),
    email: contact.email,
    companyName: contact.company_name,
    companyDomain: contact.company_domain,
    jobTitle: contact.job_title,
    linkedinUrl: contact.linkedin_url,
    location: contact.location,
    sourceUrl: contact.source_url,
    sourceQuery: contact.source_query,
    icpFit: getIcpFit(contact),
    aiScore: contact.ai_score,
    aiScoreLabel: contact.ai_score_label,
    aiScoreReasoning: contact.ai_score_reasoning,
    personalizedLine: contact.ai_personalized_line,
    emailVerifiedStatus: contact.email_verified_status,
    reviewStatus,
    sendApprovedAt: contact.gtm_send_approved_at,
    isQueued,
    readyForApproval,
    readiness: reviewStatus === 'rejected'
      ? 'rejected'
      : isQueued
        ? 'queued'
        : reviewStatus === 'approved'
          ? 'approved'
          : readyForApproval
            ? 'ready'
            : 'blocked',
    blockers,
    warnings,
    preview,
    createdAt: contact.created_at,
  };
}

function getReviewBlockers(contact: GtmContactRecord, sequence: SequenceContext): string[] {
  const blockers: string[] = [];

  if (sequence.blocker) blockers.push(sequence.blocker);
  if (!contact.email) {
    blockers.push('Missing direct professional email');
  } else if (isGenericInbox(contact.email)) {
    blockers.push('Generic company inbox');
  }
  if (contact.email_verified_status === 'INVALID') blockers.push('Email is marked invalid');
  if (contact.email_bounced) blockers.push('Email previously bounced');
  if (contact.opted_out_at) blockers.push('Contact opted out');
  if (contact.replied_at) blockers.push('Contact already replied');
  if (contact.status && EXCLUDED_APPROVAL_STATUSES.has(contact.status)) {
    blockers.push(`CRM status is ${contact.status}`);
  }
  if (!contact.ai_personalized_line) blockers.push('Missing AI personalization');
  if (!sequence.templateSubject || !sequence.templateHtml) blockers.push('Missing first email template preview');

  return blockers;
}

function getReviewWarnings(contact: GtmContactRecord): string[] {
  const warnings: string[] = [];
  if (!contact.ai_score) warnings.push('Not scored yet');
  if (contact.email_verified_status === 'CATCH_ALL') warnings.push('Catch-all email domain');
  if (!contact.source_url) warnings.push('No source URL captured');
  return warnings;
}

function buildEmailPreview(contact: GtmContactRecord, sequence: SequenceContext): { subject: string | null; text: string | null } {
  if (!sequence.templateSubject || !sequence.templateHtml) {
    return { subject: null, text: null };
  }

  const variables = buildTemplateVariables(contact);
  const subject = renderTemplate(sequence.templateSubject, variables);
  const html = renderTemplate(sequence.templateHtml, variables);
  return {
    subject: stripHtml(subject).trim(),
    text: stripHtml(html).replace(/\s+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim(),
  };
}

function buildTemplateVariables(contact: GtmContactRecord): Record<string, string> {
  return {
    first_name: contact.first_name || '',
    last_name: contact.last_name || '',
    email: contact.email || '',
    company_name: contact.company_name || '',
    company_domain: contact.company_domain || '',
    job_title: contact.job_title || '',
    linkedin_url: contact.linkedin_url || '',
    location: contact.location || '',
    status: contact.status || '',
    ai_score: contact.ai_score != null ? String(contact.ai_score) : '',
    ai_score_label: contact.ai_score_label || '',
    ai_personalized_line: contact.ai_personalized_line || '',
  };
}

function stripHtml(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function contactName(contact: Pick<GtmContactRecord, 'first_name' | 'last_name' | 'email' | 'company_name'>): string {
  return [contact.first_name, contact.last_name].filter(Boolean).join(' ') || contact.email || contact.company_name || 'Unknown prospect';
}

function getIcpFit(contact: GtmContactRecord): string | null {
  const rawData = contact.raw_data;
  const icpFit = rawData && typeof rawData.icp_fit === 'string' ? rawData.icp_fit : null;
  return icpFit || contact.persona || null;
}

function buildCounts(items: GtmReviewItem[]): GtmReviewCounts {
  return {
    total: items.length,
    pending: items.filter((item) => item.reviewStatus === 'pending').length,
    ready: items.filter((item) => item.readyForApproval).length,
    blocked: items.filter((item) => item.reviewStatus === 'pending' && !item.readyForApproval).length,
    approved: items.filter((item) => item.reviewStatus === 'approved').length,
    rejected: items.filter((item) => item.reviewStatus === 'rejected').length,
    queued: items.filter((item) => item.isQueued).length,
  };
}

function filterItems(items: GtmReviewItem[], status: GtmReviewFilter): GtmReviewItem[] {
  switch (status) {
    case 'all':
      return items;
    case 'ready':
      return items.filter((item) => item.readyForApproval);
    case 'blocked':
      return items.filter((item) => item.reviewStatus === 'pending' && !item.readyForApproval);
    case 'queued':
      return items.filter((item) => item.isQueued);
    case 'pending':
    case 'approved':
    case 'rejected':
      return items.filter((item) => item.reviewStatus === status);
  }
}

async function insertTimelineEvents(
  db: SupabaseClient,
  input: {
    workspaceId: string;
    userId: string;
    source: GtmReviewSource;
    note?: string;
    contacts: Array<Pick<GtmContactRecord, 'id' | 'first_name' | 'last_name'>>;
    eventType: string;
    title: string;
    description: string;
    metadata: Record<string, unknown>;
  }
) {
  if (input.contacts.length === 0) return;

  await db.from('contact_timeline').insert(input.contacts.map((contact) => ({
    contact_id: contact.id,
    workspace_id: input.workspaceId,
    event_type: input.eventType,
    title: input.title,
    description: input.note ? `${input.description}\n\nNote: ${input.note}` : input.description,
    metadata: {
      ...input.metadata,
      review_source: input.source,
    },
    created_by: input.userId,
  })));
}
