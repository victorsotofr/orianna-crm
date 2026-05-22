import { NextResponse } from 'next/server';

import { getServiceSupabase } from '@/lib/supabase';
import { createServerClient } from '@/lib/supabase-server';
import {
  getMailAccount,
  isGmailConfigured,
  isMicrosoftMailConfigured,
  listMailAccounts,
  setDefaultMailAccount,
  upsertLegacyImapMailAccount,
  type MailAccount,
} from '@/lib/mail-accounts';
import { syncAllMailAccountsForUser, syncMailAccount } from '@/lib/mail-account-sync';

export const maxDuration = 120;

function publicAccount(account: MailAccount) {
  return {
    id: account.id,
    provider: account.provider,
    email: account.email,
    display_name: account.display_name,
    status: account.status,
    sync_enabled: account.sync_enabled,
    send_enabled: account.send_enabled,
    is_default_send: account.is_default_send,
    last_synced_at: account.last_synced_at,
    last_error: account.last_error,
    created_at: account.created_at,
  };
}

async function authenticatedUser() {
  const { supabase, error } = await createServerClient();
  if (error || !supabase) return { supabase: null, user: null };
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

async function syncLegacyAccountFromSettings(serviceSupabase: ReturnType<typeof getServiceSupabase>, userId: string) {
  const { data: settings } = await serviceSupabase
    .from('user_settings')
    .select('user_id, user_email, smtp_host, smtp_port, smtp_user, smtp_password_encrypted, imap_host, imap_port, imap_user, imap_password_encrypted, bcc_enabled')
    .eq('user_id', userId)
    .maybeSingle();

  if (settings) await upsertLegacyImapMailAccount(serviceSupabase, settings);
  return settings;
}

export async function GET() {
  try {
    const { user } = await authenticatedUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const serviceSupabase = getServiceSupabase();
    await syncLegacyAccountFromSettings(serviceSupabase, user.id);
    const accounts = await listMailAccounts(serviceSupabase, user.id);

    return NextResponse.json({
      accounts: accounts.map(publicAccount),
      availability: {
        gmail: isGmailConfigured(),
        outlook: isMicrosoftMailConfigured(),
      },
      manualSetup: {
        gmail: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
        outlook: ['MICROSOFT_CLIENT_ID', 'MICROSOFT_CLIENT_SECRET', 'MICROSOFT_TENANT_ID optional'],
      },
    });
  } catch (error) {
    console.error('mail-accounts GET error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to load mail accounts' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { user } = await authenticatedUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const serviceSupabase = getServiceSupabase();
    const body = await request.json().catch(() => ({}));
    const action = body?.action;

    if (action === 'set_default') {
      if (!body.accountId) return NextResponse.json({ error: 'Missing accountId' }, { status: 400 });
      await setDefaultMailAccount(serviceSupabase, user.id, body.accountId);
      return NextResponse.json({ success: true });
    }

    if (action === 'sync') {
      await syncLegacyAccountFromSettings(serviceSupabase, user.id);
      if (body.accountId) {
        const account = await getMailAccount(serviceSupabase, user.id, body.accountId);
        if (!account) return NextResponse.json({ error: 'Mailbox not found' }, { status: 404 });
        const result = await syncMailAccount(serviceSupabase, account);
        return NextResponse.json({ success: true, results: [result] });
      }

      const settings = await syncLegacyAccountFromSettings(serviceSupabase, user.id);
      const { results } = await syncAllMailAccountsForUser(serviceSupabase, user.id, settings);
      return NextResponse.json({ success: true, results });
    }

    return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
  } catch (error) {
    console.error('mail-accounts POST error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to update mail accounts' }, { status: 500 });
  }
}
