import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { supabase, error: clientError } = await createServerClient();
    if (clientError || !supabase) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: contact, error } = await supabase
      .from('contacts')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }

    // Get assigned team member name
    let assignedName = null;
    if (contact.assigned_to) {
      const { data: member } = await supabase
        .from('team_members')
        .select('display_name')
        .eq('user_id', contact.assigned_to)
        .single();
      assignedName = member?.display_name || null;
    }

    return NextResponse.json({
      contact,
      assignedName,
    });
  } catch (error: any) {
    console.error('Contact detail error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: error.message || 'Failed to fetch contact' }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { supabase, error: clientError } = await createServerClient();
    if (clientError || !supabase) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const updates: Record<string, any> = {};

    const allowedFields = ['first_name', 'last_name', 'email', 'company_name', 'company_domain', 'job_title', 'linkedin_url', 'location', 'education', 'first_contact', 'second_contact', 'third_contact', 'phone', 'notes', 'status', 'assigned_to'];
    for (const field of allowedFields) {
      if (field in body) {
        updates[field] = body[field];
      }
    }
    updates.updated_at = new Date().toISOString();

    const { data: contact, error } = await supabase
      .from('contacts')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    // Add timeline entry for status change
    if ('status' in body) {
      await supabase.from('contact_timeline').insert({
        contact_id: id,
        event_type: 'status_changed',
        title: 'Statut modifié',
        description: `Statut changé en "${body.status}"`,
        metadata: { new_status: body.status },
        created_by: user.id,
      });
    }

    return NextResponse.json({ contact });
  } catch (error: any) {
    console.error('Contact update error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: error.message || 'Failed to update contact' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { supabase, error: clientError } = await createServerClient();
    if (clientError || !supabase) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { error } = await supabase
      .from('contacts')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Contact delete error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: error.message || 'Failed to delete contact' }, { status: 500 });
  }
}
