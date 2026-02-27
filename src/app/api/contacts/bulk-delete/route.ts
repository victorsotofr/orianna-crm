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
    const { contact_ids } = body;

    if (!Array.isArray(contact_ids) || contact_ids.length === 0) {
      return NextResponse.json({ error: 'contact_ids must be a non-empty array' }, { status: 400 });
    }

    const { error } = await supabase
      .from('contacts')
      .delete()
      .in('id', contact_ids);

    if (error) throw error;

    return NextResponse.json({ success: true, deleted: contact_ids.length });
  } catch (error: any) {
    console.error('Bulk delete error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: error.message || 'Failed to delete contacts' }, { status: 500 });
  }
}
