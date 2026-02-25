import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

export async function GET(request: NextRequest) {
  try {
    const { supabase, error: clientError } = await createServerClient();
    if (clientError || !supabase) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const assignedTo = searchParams.get('assigned_to');
    const owner = searchParams.get('owner');
    const industry = searchParams.get('industry');
    const search = searchParams.get('search');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = (page - 1) * limit;
    const includeTeam = searchParams.get('include_team') === 'true';

    let query = supabase
      .from('contacts')
      .select('*', { count: 'exact' });

    if (status) query = query.eq('status', status);
    if (assignedTo) query = query.eq('assigned_to', assignedTo);
    // Owner filter: 'me', 'unassigned', or a user_id
    if (owner === 'me') {
      query = query.eq('assigned_to', user.id);
    } else if (owner === 'unassigned') {
      query = query.is('assigned_to', null);
    } else if (owner && owner !== 'all') {
      query = query.eq('assigned_to', owner);
    }
    if (industry) query = query.eq('industry', industry);
    if (search) {
      query = query.or(`email.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%,company_name.ilike.%${search}%`);
    }

    const { data: contacts, count, error } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    // Optionally include team members for ownership display
    let teamMembers = null;
    if (includeTeam) {
      const { data: members } = await supabase
        .from('team_members')
        .select('user_id, email, display_name, role');
      teamMembers = members;
    }

    return NextResponse.json({
      contacts: contacts || [],
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
      teamMembers,
      currentUserId: user.id,
    });
  } catch (error: any) {
    console.error('Contacts list error:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch contacts' }, { status: 500 });
  }
}
