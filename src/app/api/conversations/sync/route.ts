import { NextResponse } from 'next/server';

import { syncAllMailAccountsForUser } from '@/lib/mail-account-sync';
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
      .select('user_id, user_email, smtp_host, smtp_port, smtp_user, smtp_password_encrypted, imap_host, imap_port, imap_user, imap_password_encrypted, bcc_enabled')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) throw error;

    const { results } = await syncAllMailAccountsForUser(serviceSupabase, user.id, settings);
    if (results.length === 0) {
      return NextResponse.json(
        { error: 'No synced mailbox is configured. Connect Gmail/Outlook or configure IMAP in Settings.' },
        { status: 400 }
      );
    }
    const result = results.reduce(
      (acc, item) => ({
        scanned: acc.scanned + item.scanned,
        stored: acc.stored + item.stored,
        repliesDetected: acc.repliesDetected + item.repliesDetected,
        bouncesDetected: acc.bouncesDetected + item.bouncesDetected,
      }),
      { scanned: 0, stored: 0, repliesDetected: 0, bouncesDetected: 0 }
    );
    return NextResponse.json({
      success: true,
      result: {
        scanned: result.scanned,
        stored: result.stored,
        repliesDetected: result.repliesDetected,
        bouncesDetected: result.bouncesDetected,
        accounts: results,
      },
    });
  } catch (error: unknown) {
    console.error('Conversation sync error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to sync conversations' }, { status: 500 });
  }
}
