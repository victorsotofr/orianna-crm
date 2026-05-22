import { NextResponse } from 'next/server';

import { buildGmailAuthUrl, createGmailOAuthState } from '@/lib/gmail-mail';
import { isGmailConfigured } from '@/lib/mail-accounts';
import { createServerClient } from '@/lib/supabase-server';

export async function GET(request: Request) {
  try {
    const { supabase, error } = await createServerClient();
    if (error || !supabase) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    if (!isGmailConfigured()) {
      return NextResponse.redirect(new URL('/settings?mail_account=not_configured&provider=gmail', request.url));
    }

    const state = await createGmailOAuthState();
    return NextResponse.redirect(buildGmailAuthUrl(new URL(request.url).origin, state));
  } catch (error) {
    console.error('Gmail connect error:', error instanceof Error ? error.message : error);
    return NextResponse.redirect(new URL('/settings?mail_account=connect_error&provider=gmail', request.url));
  }
}
