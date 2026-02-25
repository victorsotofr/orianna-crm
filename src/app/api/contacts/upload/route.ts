import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

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

    const body = await request.json();
    const { contacts, industry, check_duplicates, skip_duplicates } = body;

    if (!contacts || !Array.isArray(contacts) || contacts.length === 0) {
      return NextResponse.json({ error: 'No contacts provided' }, { status: 400 });
    }

    const emails = contacts.map((c: any) =>
      (c.email || '').toLowerCase().trim()
    ).filter(Boolean);

    // Check for existing contacts in database
    if (check_duplicates) {
      const { data: existing } = await supabase
        .from('contacts')
        .select('email, assigned_to, created_by_email, first_name, last_name')
        .in('email', emails);

      // Fetch team members for display names
      const { data: teamMembers } = await supabase
        .from('team_members')
        .select('user_id, display_name, email');

      const duplicates = (existing || []).map((e) => {
        const owner = teamMembers?.find(m => m.user_id === e.assigned_to);
        return {
          email: e.email,
          first_name: e.first_name,
          last_name: e.last_name,
          owner_name: owner?.display_name || null,
          created_by: e.created_by_email,
        };
      });

      return NextResponse.json({
        duplicates,
        new_count: emails.length - duplicates.length,
        total: emails.length,
      });
    }

    // Filter out duplicates if requested
    let contactsToProcess = contacts;
    if (skip_duplicates) {
      const { data: existing } = await supabase
        .from('contacts')
        .select('email')
        .in('email', emails);

      const existingEmails = new Set((existing || []).map(e => e.email.toLowerCase()));
      contactsToProcess = contacts.filter((c: any) =>
        !existingEmails.has((c.email || '').toLowerCase().trim())
      );

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
    const contactsToInsert = contactsToProcess.map((contact: any) => ({
      email: (contact.email || '').toLowerCase().trim(),
      first_name: contact.first_name || contact.firstName || null,
      last_name: contact.last_name || contact.lastName || null,
      company_name: contact.company_name || contact.companyName || null,
      company_domain: contact.company_domain || contact.companyDomain || null,
      job_title: contact.job_title || contact.jobTitle || null,
      linkedin_url: contact.linkedin_url || contact.linkedinUrl || null,
      industry: industry || contact.industry || null,
      raw_data: contact,
      created_by: user.id,
      created_by_email: user.email,
      assigned_to: user.id, // Auto-assign to importer
    }));

    const { data: insertedContacts, error: insertError } = await supabase
      .from('contacts')
      .upsert(contactsToInsert, {
        onConflict: 'email',
        ignoreDuplicates: true,
      })
      .select();

    if (insertError) throw insertError;

    return NextResponse.json({
      success: true,
      imported: insertedContacts?.length || 0,
      skipped: contacts.length - (insertedContacts?.length || 0),
      message: `${insertedContacts?.length || 0} contacts importés`,
    });
  } catch (error: any) {
    console.error('Contact upload error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to upload contacts' },
      { status: 500 }
    );
  }
}
