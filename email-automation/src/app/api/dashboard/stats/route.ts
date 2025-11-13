import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

export async function GET(request: Request) {
  try {
    // Get authenticated Supabase client
    const { supabase, error: clientError } = await createServerClient();

    if (clientError || !supabase) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // GLOBAL STATS: Show data across all users (shared workspace)
    
    // Get total contacts count (all users)
    const { count: totalContacts } = await supabase
      .from('contacts')
      .select('*', { count: 'exact', head: true });

    // Get emails sent today (all users)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { count: emailsSentToday } = await supabase
      .from('emails_sent')
      .select('*', { count: 'exact', head: true })
      .gte('sent_at', today.toISOString());

    // Get total emails sent (all users)
    const { count: totalEmailsSent } = await supabase
      .from('emails_sent')
      .select('*', { count: 'exact', head: true });

    // Get recent sends (last 100 from all users for better pagination)
    const { data: recentSends, error: sendsError } = await supabase
      .from('emails_sent')
      .select(`
        id,
        sent_at,
        status,
        sent_by_email,
        contact_id,
        contacts (
          id,
          email,
          first_name,
          last_name,
          company_name
        ),
        templates (
          id,
          name
        )
      `)
      .order('sent_at', { ascending: false })
      .limit(100);

    if (sendsError) {
      throw sendsError;
    }

    // Calculate average sending rate (emails/day) across all users
    // Get the date of first email globally
    const { data: firstEmail } = await supabase
      .from('emails_sent')
      .select('sent_at')
      .order('sent_at', { ascending: true })
      .limit(1)
      .single();

    let averageSendingRate = 0;
    if (firstEmail && totalEmailsSent) {
      const daysSinceFirst = Math.max(
        1,
        Math.floor(
          (Date.now() - new Date(firstEmail.sent_at).getTime()) / (1000 * 60 * 60 * 24)
        )
      );
      averageSendingRate = Math.round((totalEmailsSent / daysSinceFirst) * 10) / 10;
    }

    return NextResponse.json({
      totalContacts: totalContacts || 0,
      emailsSentToday: emailsSentToday || 0,
      totalEmailsSent: totalEmailsSent || 0,
      averageSendingRate,
      recentSends: recentSends || [],
    });
  } catch (error: any) {
    console.error('Dashboard stats error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch dashboard stats' },
      { status: 500 }
    );
  }
}

