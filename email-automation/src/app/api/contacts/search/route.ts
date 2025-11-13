import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

export async function GET(request: Request) {
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

    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || '';
    const industry = searchParams.get('industry');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = (page - 1) * limit;

    // Query all contacts (shared across all users)
    let queryBuilder = supabase
      .from('contacts')
      .select('*', { count: 'exact' });

    // Apply search filter
    if (query) {
      queryBuilder = queryBuilder.or(
        `email.ilike.%${query}%,first_name.ilike.%${query}%,last_name.ilike.%${query}%,company_name.ilike.%${query}%`
      );
    }

    // Apply industry filter
    if (industry && industry !== 'all') {
      queryBuilder = queryBuilder.eq('industry', industry);
    }

    // Apply pagination
    queryBuilder = queryBuilder
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data: contacts, error, count } = await queryBuilder;

    if (error) {
      throw error;
    }

    return NextResponse.json({
      contacts: contacts || [],
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
    });
  } catch (error: any) {
    console.error('Contact search error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to search contacts' },
      { status: 500 }
    );
  }
}

