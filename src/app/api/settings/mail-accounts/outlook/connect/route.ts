import { NextResponse } from 'next/server';

import { isMicrosoftMailConfigured } from '@/lib/mail-accounts';
import { buildMicrosoftMailAuthUrl, createMicrosoftMailOAuthState } from '@/lib/outlook-mail';
import { createServerClient } from '@/lib/supabase-server';

export async function GET(request: Request) {
  try {
    const { supabase, error } = await createServerClient();
    if (error || !supabase) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    if (!isMicrosoftMailConfigured()) {
      return NextResponse.redirect(new URL('/settings?mail_account=not_configured&provider=outlook', request.url));
    }

    const state = await createMicrosoftMailOAuthState();
    return NextResponse.redirect(buildMicrosoftMailAuthUrl(new URL(request.url).origin, state));
  } catch (error) {
    console.error('Outlook connect error:', error instanceof Error ? error.message : error);
    return NextResponse.redirect(new URL('/settings?mail_account=connect_error&provider=outlook', request.url));
  }
}
