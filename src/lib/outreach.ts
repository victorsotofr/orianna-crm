import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

export interface OutreachEmailStep {
  subject: string;
  body: string;
  delayDays: number;
}

export interface SavedProspectResult {
  contactIds: string[];
  skipped: Array<{ prospectId: string; reason: string }>;
}

export function parseJsonFromText<T>(text: string, fallback: T): T {
  try {
    const cleaned = text
      .replace(/```json?\n?/g, '')
      .replace(/```/g, '')
      .trim();
    return JSON.parse(cleaned) as T;
  } catch {
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    const firstBracket = text.indexOf('[');
    const lastBracket = text.lastIndexOf(']');
    const startsWithArray = firstBracket >= 0 && (firstBrace < 0 || firstBracket < firstBrace);
    const start = startsWithArray ? firstBracket : firstBrace;
    const end = startsWithArray ? lastBracket : lastBrace;
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1)) as T;
      } catch {
        return fallback;
      }
    }
    return fallback;
  }
}

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function plainTextToHtml(value: string) {
  return value
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('\n');
}

export function normalizeEmailStep(step: Partial<OutreachEmailStep>, index: number): OutreachEmailStep {
  return {
    subject: String(step.subject || '').trim() || `Message ${index + 1}`,
    body: String(step.body || '').trim() || 'Bonjour {{first_name}},',
    delayDays: Number.isInteger(step.delayDays) && Number(step.delayDays) >= 0
      ? Number(step.delayDays)
      : index === 0 ? 0 : index === 1 ? 3 : 7,
  };
}

export function normalizeSteps(steps: unknown): OutreachEmailStep[] {
  if (!Array.isArray(steps)) return [];
  return steps.slice(0, 3).map((step, index) => normalizeEmailStep(step as Partial<OutreachEmailStep>, index));
}

export async function getOutreachSession(
  db: SupabaseClient,
  workspaceId: string,
  sessionId: string
) {
  const { data, error } = await db
    .from('outreach_sessions')
    .select('*')
    .eq('id', sessionId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getOutreachSessionBundle(
  db: SupabaseClient,
  workspaceId: string,
  sessionId: string
) {
  const [sessionResult, prospectsResult, draftResult] = await Promise.all([
    db
      .from('outreach_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('workspace_id', workspaceId)
      .maybeSingle(),
    db
      .from('outreach_session_prospects')
      .select(`
        *,
        contact:contacts(
          id,
          email,
          email_verified_status,
          status,
          first_name,
          last_name,
          company_name,
          job_title,
          linkedin_url,
          location
        )
      `)
      .eq('session_id', sessionId)
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: true }),
    db
      .from('outreach_sequence_drafts')
      .select('*')
      .eq('session_id', sessionId)
      .eq('workspace_id', workspaceId)
      .maybeSingle(),
  ]);

  if (sessionResult.error) throw sessionResult.error;
  if (prospectsResult.error) throw prospectsResult.error;
  if (draftResult.error) throw draftResult.error;

  return {
    session: sessionResult.data,
    prospects: prospectsResult.data || [],
    sequenceDraft: draftResult.data || null,
  };
}

export async function saveSessionProspectsAsContacts(input: {
  db: SupabaseClient;
  workspaceId: string;
  userId: string;
  sessionId: string;
  prospectIds?: string[];
}): Promise<SavedProspectResult> {
  const session = await getOutreachSession(input.db, input.workspaceId, input.sessionId);
  if (!session) throw new Error('Outreach session not found');

  let query = input.db
    .from('outreach_session_prospects')
    .select('*')
    .eq('session_id', input.sessionId)
    .eq('workspace_id', input.workspaceId)
    .eq('ignored', false);

  if (input.prospectIds?.length) {
    query = query.in('id', input.prospectIds);
  } else {
    query = query.eq('selected', true);
  }

  const { data: prospects, error } = await query;
  if (error) throw error;

  const contactIds: string[] = [];
  const skipped: Array<{ prospectId: string; reason: string }> = [];

  for (const prospect of prospects || []) {
    const firstName = String(prospect.first_name || '').trim();
    const lastName = String(prospect.last_name || '').trim();
    const email = String(prospect.email || '').trim().toLowerCase();
    const linkedinUrl = String(prospect.linkedin_url || '').trim();

    if (!firstName || !lastName) {
      skipped.push({ prospectId: prospect.id, reason: 'Missing first or last name' });
      continue;
    }

    let contactId = prospect.contact_id as string | null;

    if (!contactId && email) {
      const { data: existing } = await input.db
        .from('contacts')
        .select('id')
        .eq('workspace_id', input.workspaceId)
        .ilike('email', email)
        .maybeSingle();
      contactId = existing?.id || null;
    }

    if (!contactId && linkedinUrl) {
      const { data: existing } = await input.db
        .from('contacts')
        .select('id')
        .eq('workspace_id', input.workspaceId)
        .eq('linkedin_url', linkedinUrl)
        .maybeSingle();
      contactId = existing?.id || null;
    }

    if (!contactId) {
      const { data: inserted, error: insertError } = await input.db
        .from('contacts')
        .insert({
          workspace_id: input.workspaceId,
          user_id: input.userId,
          first_name: firstName,
          last_name: lastName,
          email: email || null,
          company_name: prospect.company_name || '',
          company_domain: prospect.company_domain || '',
          job_title: prospect.job_title || '',
          linkedin_url: linkedinUrl,
          location: prospect.location || '',
          status: 'new',
          assigned_to: input.userId,
          source: 'outreach_session',
          source_query: session.prompt,
          source_url: prospect.source_url || null,
          raw_data: {
            outreach_session_id: input.sessionId,
            outreach_prospect_id: prospect.id,
            raw_result: prospect.raw_result || {},
          },
        })
        .select('id')
        .single();

      if (insertError) {
        skipped.push({ prospectId: prospect.id, reason: insertError.message });
        continue;
      }

      contactId = inserted.id;
    } else {
      await input.db
        .from('contacts')
        .update({
          first_name: firstName,
          last_name: lastName,
          company_name: prospect.company_name || '',
          company_domain: prospect.company_domain || '',
          job_title: prospect.job_title || '',
          linkedin_url: linkedinUrl,
          location: prospect.location || '',
          source_query: session.prompt,
          source_url: prospect.source_url || null,
        })
        .eq('id', contactId)
        .eq('workspace_id', input.workspaceId);
    }

    await input.db
      .from('outreach_session_prospects')
      .update({
        contact_id: contactId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', prospect.id)
      .eq('workspace_id', input.workspaceId);

    if (contactId) {
      contactIds.push(contactId);
    }
  }

  return { contactIds: Array.from(new Set(contactIds)), skipped };
}
