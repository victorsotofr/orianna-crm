import { NextResponse } from 'next/server';

import { syncMailAccount } from '@/lib/mail-account-sync';
import type { MailAccount } from '@/lib/mail-accounts';
import { getServiceSupabase } from '@/lib/supabase';

export const maxDuration = 120;

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('validationToken');
  if (!token) return NextResponse.json({ error: 'Missing validationToken' }, { status: 400 });
  return new Response(token, { headers: { 'Content-Type': 'text/plain' } });
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const notifications = Array.isArray(body?.value) ? body.value : [];
    const expectedClientState = process.env.MICROSOFT_GRAPH_WEBHOOK_CLIENT_STATE;
    const supabase = getServiceSupabase();
    const results = [];

    for (const notification of notifications) {
      if (expectedClientState && notification.clientState !== expectedClientState) continue;
      const subscriptionId = notification.subscriptionId;
      if (!subscriptionId) continue;

      const { data: state, error: stateError } = await supabase
        .from('mail_account_sync_state')
        .select('mail_account_id')
        .eq('webhook_subscription_id', subscriptionId)
        .maybeSingle();
      if (stateError || !state?.mail_account_id) continue;

      const { data: account, error: accountError } = await supabase
        .from('mail_accounts')
        .select('*')
        .eq('id', state.mail_account_id)
        .eq('provider', 'outlook')
        .eq('sync_enabled', true)
        .maybeSingle();
      if (accountError || !account) continue;

      results.push(await syncMailAccount(supabase, account as MailAccount));
    }

    return NextResponse.json({ success: true, results });
  } catch (error) {
    console.error('Microsoft Graph webhook error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Webhook failed' }, { status: 500 });
  }
}
