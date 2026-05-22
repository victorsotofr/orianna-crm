import { NextResponse } from 'next/server';

import { deleteMailAccount, getMailAccount, setDefaultMailAccount } from '@/lib/mail-accounts';
import { getServiceSupabase } from '@/lib/supabase';
import { createServerClient } from '@/lib/supabase-server';

async function requireUser() {
  const { supabase, error } = await createServerClient();
  if (error || !supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  return user || null;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    const body = await request.json();
    const supabase = getServiceSupabase();
    const account = await getMailAccount(supabase, user.id, id);
    if (!account) return NextResponse.json({ error: 'Mailbox not found' }, { status: 404 });

    if (body.is_default_send === true) {
      await setDefaultMailAccount(supabase, user.id, id);
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof body.sync_enabled === 'boolean') updates.sync_enabled = body.sync_enabled;
    if (typeof body.send_enabled === 'boolean') updates.send_enabled = body.send_enabled;
    if (['active', 'paused', 'error'].includes(body.status)) updates.status = body.status;

    if (Object.keys(updates).length > 1) {
      const { error } = await supabase
        .from('mail_accounts')
        .update(updates)
        .eq('id', id)
        .eq('user_id', user.id);
      if (error) throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('mail-account PATCH error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to update mailbox' }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    await deleteMailAccount(getServiceSupabase(), user.id, id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('mail-account DELETE error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to delete mailbox' }, { status: 500 });
  }
}
