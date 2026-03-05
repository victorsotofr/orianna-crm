import { NextResponse } from 'next/server';
// import * as Sentry from '@sentry/nextjs';
import { createServerClient } from '@/lib/supabase-server';
import { getWorkspaceContext } from '@/lib/workspace';

const VALID_STATUSES = ['new', 'contacted', 'engaged', 'qualified', 'meeting_scheduled', 'opportunity', 'customer', 'lost', 'do_not_contact'];
const BATCH_SIZE = 500;

function normalizeEmail(raw: string | undefined | null): string | null {
  const email = (raw || '').toLowerCase().trim();
  return email || null;
}

export async function POST(request: Request) {
  try {
    const { supabase, error: clientError } = await createServerClient();
    if (clientError || !supabase) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const wsId = request.headers.get('x-workspace-id');
    const ctx = await getWorkspaceContext(supabase, user.id, wsId);
    if (!ctx) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

    const body = await request.json();
    const { contacts, check_duplicates, skip_duplicates } = body;

    if (!contacts || !Array.isArray(contacts) || contacts.length === 0) {
      return NextResponse.json({ error: 'No contacts provided' }, { status: 400 });
    }

    // Only collect non-null emails for duplicate checking
    const emails = contacts
      .map((c: any) => normalizeEmail(c.email))
      .filter((e): e is string => e !== null);

    // Check for existing contacts in database (scoped to workspace)
    if (check_duplicates) {
      const { data: existing } = emails.length > 0
        ? await supabase
            .from('contacts')
            .select('email, assigned_to, created_by_email, first_name, last_name')
            .eq('workspace_id', ctx.workspaceId)
            .in('email', emails)
        : { data: [] };

      // Fetch workspace members for display names
      const { data: wsMembers } = await supabase
        .from('workspace_members')
        .select('user_id, display_name, email')
        .eq('workspace_id', ctx.workspaceId);

      const duplicates = (existing || []).map((e) => {
        const owner = wsMembers?.find(m => m.user_id === e.assigned_to);
        return {
          email: e.email,
          first_name: e.first_name,
          last_name: e.last_name,
          owner_name: owner?.display_name || null,
          created_by: e.created_by_email,
        };
      });

      // new_count = total contacts minus duplicates (not just emails minus duplicates)
      return NextResponse.json({
        duplicates,
        new_count: contacts.length - duplicates.length,
        total: contacts.length,
      });
    }

    // Filter out duplicates if requested
    let contactsToProcess = contacts;
    if (skip_duplicates && emails.length > 0) {
      const { data: existing } = await supabase
        .from('contacts')
        .select('email')
        .eq('workspace_id', ctx.workspaceId)
        .in('email', emails);

      const existingEmails = new Set((existing || []).map(e => e.email.toLowerCase()));
      contactsToProcess = contacts.filter((c: any) => {
        const email = normalizeEmail(c.email);
        // Keep contacts without email (they can't be duplicates by email)
        if (!email) return true;
        return !existingEmails.has(email);
      });

      if (contactsToProcess.length === 0) {
        return NextResponse.json({
          success: true,
          imported: 0,
          skipped: contacts.length,
          message: 'Tous les contacts existent déjà',
        });
      }
    }

    // Prepare contacts for insertion
    const contactsToInsert = contactsToProcess.map((contact: any) => {
      const status = contact.status && VALID_STATUSES.includes(contact.status) ? contact.status : 'new';
      return {
        email: normalizeEmail(contact.email),
        first_name: contact.first_name || contact.firstName || null,
        last_name: contact.last_name || contact.lastName || null,
        company_name: contact.company_name || contact.companyName || null,
        company_domain: contact.company_domain || contact.companyDomain || null,
        job_title: contact.job_title || contact.jobTitle || null,
        linkedin_url: contact.linkedin_url || contact.linkedinUrl || null,
        phone: contact.phone || contact.Phone || contact.téléphone || contact.Téléphone || null,
        notes: contact.notes || contact.Notes || null,
        location: contact.location || contact.Location || contact.ville || contact.Ville || null,
        education: contact.education || contact.Education || contact.formation || contact.Formation || null,
        status,
        raw_data: contact,
        created_by: user.id,
        created_by_email: user.email,
        assigned_to: user.id,
        workspace_id: ctx.workspaceId,
      };
    });

    // Insert in batches to handle large CSVs
    const allInsertedIds: string[] = [];
    for (let i = 0; i < contactsToInsert.length; i += BATCH_SIZE) {
      const batch = contactsToInsert.slice(i, i + BATCH_SIZE);
      const { data: insertedBatch, error: insertError } = await supabase
        .from('contacts')
        .upsert(batch, {
          onConflict: 'workspace_id,email',
          ignoreDuplicates: true,
        })
        .select('id');

      if (insertError) throw insertError;
      if (insertedBatch) {
        allInsertedIds.push(...insertedBatch.map(c => c.id));
      }
    }

    return NextResponse.json({
      success: true,
      imported: allInsertedIds.length,
      skipped: contacts.length - allInsertedIds.length,
      importedIds: allInsertedIds,
      message: `${allInsertedIds.length} contacts importés`,
    });
  } catch (error: any) {
    console.error('Contact upload error:', error instanceof Error ? error.message : error);
    // Sentry.captureException(error);

    // User-friendly message for unique constraint violations
    if (error?.code === '23505') {
      return NextResponse.json(
        { error: 'Certains contacts existent déjà. Veuillez réessayer en ignorant les doublons.' },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: 'Erreur lors de l\'import des contacts. Veuillez réessayer.' },
      { status: 500 }
    );
  }
}
