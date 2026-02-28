import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
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

    const { type } = await request.json();
    if (type !== 'hot' && type !== 'cold') {
      return NextResponse.json({ error: 'Invalid type. Must be "hot" or "cold"' }, { status: 400 });
    }

    const newStatus = type === 'hot' ? 'qualified' : 'unqualified';

    // Update contact status and replied_at
    const { error: updateError } = await supabase
      .from('contacts')
      .update({
        status: newStatus,
        replied_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (updateError) throw updateError;

    // Insert timeline entry
    await supabase.from('contact_timeline').insert({
      contact_id: id,
      event_type: 'reply_action',
      title: type === 'hot' ? 'Réponse chaude' : 'Réponse froide',
      description: type === 'hot'
        ? 'Contact marqué comme qualifié (réponse chaude)'
        : 'Contact marqué comme non qualifié (réponse froide)',
      metadata: { action_type: type, new_status: newStatus },
      created_by: user.id,
    });

    return NextResponse.json({ success: true, status: newStatus });
  } catch (error: any) {
    console.error('Reply action error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: error.message || 'Failed to process reply action' }, { status: 500 });
  }
}
