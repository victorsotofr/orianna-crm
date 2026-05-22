import { NextResponse } from 'next/server';

import { syncAllMailAccountsForUser } from '@/lib/mail-account-sync';
import { getServiceSupabase } from '@/lib/supabase';

export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const serviceKey = request.headers.get('x-service-key');
    if (serviceKey !== process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getServiceSupabase();
    const { data: usersWithSettings, error } = await supabase
      .from('user_settings')
      .select('user_id, user_email, smtp_host, smtp_port, smtp_user, smtp_password_encrypted, imap_host, imap_port, imap_user, imap_password_encrypted, bcc_enabled');

    if (error) throw error;

    let repliesDetected = 0;
    let scanned = 0;
    let stored = 0;
    const userErrors: string[] = [];

    const users = usersWithSettings || [];
    for (const userSettings of users) {
      try {
        const { results } = await syncAllMailAccountsForUser(supabase, userSettings.user_id, userSettings);
        for (const result of results) {
          repliesDetected += result.repliesDetected;
          scanned += result.scanned;
          stored += result.stored;
        }
      } catch (userError) {
        console.error(
          `Error syncing mailbox for ${userSettings.user_email}:`,
          userError instanceof Error ? userError.message : userError
        );
        userErrors.push(
          `${userSettings.user_email}: ${userError instanceof Error ? userError.message : 'Unknown error'}`
        );
      }
    }

    return NextResponse.json({
      repliesDetected,
      scanned,
      stored,
      usersChecked: users.length,
      errors: userErrors.length > 0 ? userErrors : undefined,
    });
  } catch (error) {
    console.error('check-replies error:', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
