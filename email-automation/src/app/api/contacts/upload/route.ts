import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

export async function POST(request: Request) {
  try {
    // Get authenticated Supabase client
    const { supabase, error: clientError } = await createServerClient();

    if (clientError || !supabase) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { contacts, industry } = body;

    if (!contacts || !Array.isArray(contacts) || contacts.length === 0) {
      return NextResponse.json({ error: 'No contacts provided' }, { status: 400 });
    }

    // Prepare contacts for insertion with audit trail
    const contactsToInsert = contacts.map((contact) => ({
      email: contact.email,
      first_name: contact.first_name || contact.firstName || null,
      last_name: contact.last_name || contact.lastName || null,
      company_name: contact.company_name || contact.companyName || null,
      company_domain: contact.company_domain || contact.companyDomain || null,
      job_title: contact.job_title || contact.jobTitle || null,
      linkedin_url: contact.linkedin_url || contact.linkedinUrl || null,
      industry: industry || contact.industry || null,
      raw_data: contact,
      // Audit trail: track who created this contact
      created_by: user.id,
      created_by_email: user.email,
    }));

    // Insert contacts (on conflict, skip)
    const { data: insertedContacts, error: insertError } = await supabase
      .from('contacts')
      .upsert(contactsToInsert, {
        onConflict: 'email',
        ignoreDuplicates: false,
      })
      .select();

    if (insertError) {
      throw insertError;
    }

    return NextResponse.json({
      success: true,
      imported: insertedContacts?.length || 0,
      message: `${insertedContacts?.length || 0} contacts imported successfully`,
    });
  } catch (error: any) {
    console.error('Contact upload error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to upload contacts' },
      { status: 500 }
    );
  }
}

