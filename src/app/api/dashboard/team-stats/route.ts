import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

export async function GET() {
  try {
    const { supabase, error: clientError } = await createServerClient();
    if (clientError || !supabase) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Total contacts
    const { count: totalContacts } = await supabase
      .from('contacts')
      .select('*', { count: 'exact', head: true });

    // Active sequences
    const { count: activeSequences } = await supabase
      .from('sequences')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active');

    // Emails sent today
    const { count: emailsToday } = await supabase
      .from('emails_sent')
      .select('*', { count: 'exact', head: true })
      .gte('sent_at', today.toISOString());

    // Total emails sent
    const { count: totalEmails } = await supabase
      .from('emails_sent')
      .select('*', { count: 'exact', head: true });

    // Reply count
    const { count: totalReplies } = await supabase
      .from('contacts')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'replied');

    // Active enrollments
    const { count: activeEnrollments } = await supabase
      .from('sequence_enrollments')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active');

    // Per-user breakdown
    const { data: teamMembers } = await supabase
      .from('team_members')
      .select('user_id, display_name, email');

    const perUser = await Promise.all(
      (teamMembers || []).map(async (member) => {
        const { count: contacts } = await supabase
          .from('contacts')
          .select('*', { count: 'exact', head: true })
          .eq('assigned_to', member.user_id);

        const { count: emailsSent } = await supabase
          .from('emails_sent')
          .select('*', { count: 'exact', head: true })
          .eq('sent_by', member.user_id)
          .gte('sent_at', today.toISOString());

        return {
          name: member.display_name,
          email: member.email,
          contacts: contacts || 0,
          emailsToday: emailsSent || 0,
        };
      })
    );

    // Recent sends
    const { data: recentSends } = await supabase
      .from('emails_sent')
      .select(`
        id, contact_id, sent_at, status, sent_by_email,
        contacts (id, email, first_name, last_name, company_name),
        templates (id, name)
      `)
      .order('sent_at', { ascending: false })
      .limit(20);

    const replyRate = totalEmails && totalEmails > 0
      ? Math.round(((totalReplies || 0) / totalEmails) * 100)
      : 0;

    return NextResponse.json({
      totalContacts: totalContacts || 0,
      activeSequences: activeSequences || 0,
      emailsToday: emailsToday || 0,
      totalEmails: totalEmails || 0,
      replyRate,
      activeEnrollments: activeEnrollments || 0,
      perUser,
      recentSends: recentSends || [],
    });
  } catch (error: any) {
    console.error('Team stats error:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch team stats' }, { status: 500 });
  }
}
