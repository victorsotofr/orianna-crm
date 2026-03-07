import { NextResponse } from 'next/server';

import { syncMailboxForUser } from '@/lib/mailbox-sync';
import { getServiceSupabase } from '@/lib/supabase';

export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const serviceKey = request.headers.get('x-service-key');
    if (serviceKey !== process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getServiceSupabase();
    const { data: usersWithImap, error } = await supabase
      .from('user_settings')
      .select('user_id, user_email, smtp_user, imap_host, imap_port, imap_user, imap_password_encrypted')
      .not('imap_host', 'is', null)
      .not('imap_user', 'is', null)
      .not('imap_password_encrypted', 'is', null);

    if (error) throw error;

    let repliesDetected = 0;
    let scanned = 0;
    let stored = 0;
    const userErrors: string[] = [];

    for (const userSettings of usersWithImap || []) {
      try {
        const result = await syncMailboxForUser(supabase, userSettings);
        repliesDetected += result.repliesDetected;
        scanned += result.scanned;
        stored += result.stored;
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
      usersChecked: usersWithImap?.length || 0,
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
