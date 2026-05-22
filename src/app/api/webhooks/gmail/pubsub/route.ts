import { NextResponse } from 'next/server';

import { syncMailAccount } from '@/lib/mail-account-sync';
import type { MailAccount } from '@/lib/mail-accounts';
import { normalizeEmail } from '@/lib/mailbox-utils';
import { getServiceSupabase } from '@/lib/supabase';

export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const token = process.env.GMAIL_PUBSUB_VERIFICATION_TOKEN;
    if (token && new URL(request.url).searchParams.get('token') !== token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const encoded = body?.message?.data;
    const decoded = encoded ? JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')) : {};
    const email = normalizeEmail(decoded.emailAddress);

    if (!email) return NextResponse.json({ success: true, skipped: 'missing_email' });

    const supabase = getServiceSupabase();
    const { data: accounts, error } = await supabase
      .from('mail_accounts')
      .select('*')
      .eq('provider', 'gmail')
      .eq('sync_enabled', true)
      .eq('status', 'active')
      .ilike('email', email);

    if (error) throw error;
    const results = [];
    for (const account of (accounts || []) as MailAccount[]) {
      results.push(await syncMailAccount(supabase, account));
    }

    return NextResponse.json({ success: true, results });
  } catch (error) {
    console.error('Gmail Pub/Sub webhook error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Webhook failed' }, { status: 500 });
  }
}
