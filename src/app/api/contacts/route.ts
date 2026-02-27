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
    const search = searchParams.get('search');
    const limit = parseInt(searchParams.get('limit') || '50');
    const includeTeam = searchParams.get('include_team') === 'true';

    // Build base filter function to apply to any query
    function applyFilters(query: any) {
      if (status) query = query.eq('status', status);
      if (assignedTo) query = query.eq('assigned_to', assignedTo);
      if (owner === 'me') {
        query = query.eq('assigned_to', user!.id);
      } else if (owner === 'unassigned') {
        query = query.is('assigned_to', null);
      } else if (owner && owner !== 'all') {
        query = query.eq('assigned_to', owner);
      }
      if (search) {
        query = query.or(`email.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%,company_name.ilike.%${search}%`);
      }
      return query;
    }

    // Get exact count first
    const countQuery = applyFilters(
      supabase.from('contacts').select('*', { count: 'exact', head: true })
    );
    const { count } = await countQuery;
    const totalFiltered = count || 0;

    // Fetch contacts in batches of 1000 (Supabase max per request)
    const batchSize = 1000;
    const maxToFetch = Math.min(limit, totalFiltered);
    let allContacts: any[] = [];

    for (let offset = 0; offset < maxToFetch; offset += batchSize) {
      const batchLimit = Math.min(batchSize, maxToFetch - offset);
      const batchQuery = applyFilters(
        supabase.from('contacts').select('*')
      );
      const { data: batch, error: batchError } = await batchQuery
        .order('created_at', { ascending: false })
        .range(offset, offset + batchLimit - 1);

      if (batchError) throw batchError;
      if (!batch || batch.length === 0) break;
      allContacts = allContacts.concat(batch);
      if (batch.length < batchLimit) break;
    }

    // Optionally include team members and owner counts
    let teamMembers = null;
    let ownerCounts: Record<string, number> = {};
    if (includeTeam) {
      const { data: members } = await supabase
        .from('team_members')
        .select('user_id, email, display_name, role');
      teamMembers = members;

      // Compute owner counts using count queries (not affected by row limit)
      const { count: totalContactsCount } = await supabase
        .from('contacts')
        .select('*', { count: 'exact', head: true });
      ownerCounts['__total'] = totalContactsCount || 0;

      const { count: unassignedCount } = await supabase
        .from('contacts')
        .select('*', { count: 'exact', head: true })
        .is('assigned_to', null);
      ownerCounts['unassigned'] = unassignedCount || 0;

      // Count per team member
      if (members) {
        await Promise.all(
          members.map(async (member) => {
            const { count: memberCount } = await supabase
              .from('contacts')
              .select('*', { count: 'exact', head: true })
              .eq('assigned_to', member.user_id);
            ownerCounts[member.user_id] = memberCount || 0;
          })
        );
      }
    }

    return NextResponse.json({
      contacts: allContacts,
      total: totalFiltered,
      teamMembers,
      ownerCounts,
      currentUserId: user.id,
    });
  } catch (error: any) {
    console.error('Contacts list error:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch contacts' }, { status: 500 });
  }
}
