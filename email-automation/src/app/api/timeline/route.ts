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
    const contactId = searchParams.get('contact_id');

    if (!contactId) {
      return NextResponse.json({ error: 'contact_id is required' }, { status: 400 });
    }

    const { data: events, error } = await supabase
      .from('contact_timeline')
      .select(`
        *,
        team_members!contact_timeline_created_by_fkey (
          display_name,
          email
        )
      `)
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      // If the join fails (FK not set up), fall back to basic query
      const { data: basicEvents, error: basicError } = await supabase
        .from('contact_timeline')
        .select('*')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false })
        .limit(100);

      if (basicError) throw basicError;
      return NextResponse.json({ events: basicEvents || [] });
    }

    return NextResponse.json({ events: events || [] });
  } catch (error: any) {
    console.error('Timeline fetch error:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch timeline' }, { status: 500 });
  }
}
