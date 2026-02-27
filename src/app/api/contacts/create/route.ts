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
    const { email, first_name, last_name, company_name, company_domain, job_title, linkedin_url, location, education, phone, notes } = body;

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    // Check uniqueness
    const { data: existing } = await supabase
      .from('contacts')
      .select('id')
      .ilike('email', email)
      .single();

    if (existing) {
      return NextResponse.json({ error: 'A contact with this email already exists' }, { status: 409 });
    }

    const { data: contact, error } = await supabase
      .from('contacts')
      .insert({
        email: email.toLowerCase().trim(),
        first_name: first_name || null,
        last_name: last_name || null,
        company_name: company_name || null,
        company_domain: company_domain || null,
        job_title: job_title || null,
        linkedin_url: linkedin_url || null,
        location: location || null,
        education: education || null,
        phone: phone || null,
        notes: notes || null,
        status: 'new',
        assigned_to: user.id,
        created_by: user.id,
        created_by_email: user.email,
      })
      .select()
      .single();

    if (error) throw error;

    // Add timeline entry
    await supabase.from('contact_timeline').insert({
      contact_id: contact.id,
      event_type: 'created',
      title: 'Contact créé',
      description: `Créé manuellement`,
      created_by: user.id,
    });

    return NextResponse.json({ contact });
  } catch (error: any) {
    console.error('Contact create error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: error.message || 'Failed to create contact' }, { status: 500 });
  }
}
