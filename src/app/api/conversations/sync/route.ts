import { NextResponse } from 'next/server';

import { syncMailboxForUser } from '@/lib/mailbox-sync';
import { getServiceSupabase } from '@/lib/supabase';
import { createServerClient } from '@/lib/supabase-server';
import { getWorkspaceContext } from '@/lib/workspace';

export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const { supabase, error: clientError } = await createServerClient();
    if (clientError || !supabase) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const wsId = request.headers.get('x-workspace-id');
    const ctx = await getWorkspaceContext(supabase, user.id, wsId);
    if (!ctx) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

    const serviceSupabase = getServiceSupabase();
    const { data: settings, error } = await serviceSupabase
      .from('user_settings')
      .select('user_id, user_email, smtp_user, imap_host, imap_port, imap_user, imap_password_encrypted')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) throw error;
    if (!settings?.imap_host || !settings.imap_user || !settings.imap_password_encrypted) {
      return NextResponse.json(
        { error: 'IMAP settings are not configured. Configure them in Settings first.' },
        { status: 400 }
      );
    }

    const result = await syncMailboxForUser(serviceSupabase, settings);
    return NextResponse.json({ success: true, result });
  } catch (error: any) {
    console.error('Conversation sync error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: error.message || 'Failed to sync conversations' }, { status: 500 });
  }
}
