import { NextResponse } from 'next/server';

import { getServiceSupabase } from '@/lib/supabase';
import { createServerClient } from '@/lib/supabase-server';
import {
  consumeGmailOAuthState,
  exchangeGmailCode,
  fetchGmailIdentity,
  saveGmailMailAccount,
} from '@/lib/gmail-mail';

export async function GET(request: Request) {
  const redirectUrl = new URL('/settings', request.url);

  try {
    const url = new URL(request.url);
    const state = url.searchParams.get('state');
    const code = url.searchParams.get('code');
    const oauthError = url.searchParams.get('error');

    if (oauthError) {
      redirectUrl.searchParams.set('mail_account', 'denied');
      redirectUrl.searchParams.set('provider', 'gmail');
      return NextResponse.redirect(redirectUrl);
    }

    if (!(await consumeGmailOAuthState(state))) {
      redirectUrl.searchParams.set('mail_account', 'state_error');
      redirectUrl.searchParams.set('provider', 'gmail');
      return NextResponse.redirect(redirectUrl);
    }

    if (!code) {
      redirectUrl.searchParams.set('mail_account', 'missing_code');
      redirectUrl.searchParams.set('provider', 'gmail');
      return NextResponse.redirect(redirectUrl);
    }

    const { supabase, error } = await createServerClient();
    if (error || !supabase) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const tokenResponse = await exchangeGmailCode(url.origin, code);
    const identity = await fetchGmailIdentity(tokenResponse.access_token);
    await saveGmailMailAccount({
      supabase: getServiceSupabase(),
      userId: user.id,
      userEmail: user.email || null,
      tokens: tokenResponse,
      identity,
    });

    redirectUrl.searchParams.set('mail_account', 'connected');
    redirectUrl.searchParams.set('provider', 'gmail');
    return NextResponse.redirect(redirectUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gmail connection failed';
    console.error('Gmail callback error:', message);
    redirectUrl.searchParams.set('mail_account', 'callback_error');
    redirectUrl.searchParams.set('provider', 'gmail');
    redirectUrl.searchParams.set('mail_account_error', message.slice(0, 200));
    return NextResponse.redirect(redirectUrl);
  }
}
