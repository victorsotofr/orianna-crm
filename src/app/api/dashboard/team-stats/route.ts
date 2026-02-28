import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { getWorkspaceContext } from '@/lib/workspace';

export async function GET(request: Request) {
  try {
    const { supabase, error: clientError } = await createServerClient();
    if (clientError || !supabase) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const wsId = request.headers.get('x-workspace-id');
    const ctx = await getWorkspaceContext(supabase, user.id, wsId);
    if (!ctx) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Total contacts
    const { count: totalContacts } = await supabase
      .from('contacts')
      .select('*', { count: 'exact', head: true });

    // Emails sent today
    const { count: emailsToday } = await supabase
      .from('emails_sent')
      .select('*', { count: 'exact', head: true })
      .gte('sent_at', today.toISOString());

    // Total emails sent
    const { count: totalEmails } = await supabase
      .from('emails_sent')
      .select('*', { count: 'exact', head: true });

    // Reply count (contacts that replied)
    const { count: totalReplies } = await supabase
      .from('contacts')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'replied');

    // Contacted contacts (any status except 'new' = they received at least one outreach)
    const { count: contactedContacts } = await supabase
      .from('contacts')
      .select('*', { count: 'exact', head: true })
      .neq('status', 'new');

    // Per-user breakdown
    const { data: teamMembers } = await supabase
      .from('workspace_members')
      .select('user_id, display_name, email')
      .eq('workspace_id', ctx.workspaceId);

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

    // Hot leads (AI scored)
    const { count: hotLeadsCount } = await supabase
      .from('contacts')
      .select('*', { count: 'exact', head: true })
      .eq('ai_score_label', 'HOT');

    const { data: hotLeads } = await supabase
      .from('contacts')
      .select('id, first_name, last_name, email, company_name, ai_score, ai_score_label, ai_score_reasoning')
      .eq('ai_score_label', 'HOT')
      .order('ai_score', { ascending: false })
      .limit(10);

    // Recent sends
    const { data: recentSends } = await supabase
      .from('emails_sent')
      .select(`
        id, contact_id, sent_at, status, sent_by_email,
        contacts (id, email, first_name, last_name, company_name, status),
        templates (id, name)
      `)
      .order('sent_at', { ascending: false })
      .limit(20);

    const replyRate = contactedContacts && contactedContacts > 0
      ? Math.round(((totalReplies || 0) / contactedContacts) * 100)
      : 0;

    return NextResponse.json({
      totalContacts: totalContacts || 0,
      emailsToday: emailsToday || 0,
      totalEmails: totalEmails || 0,
      replyRate,
      hotLeadsCount: hotLeadsCount || 0,
      hotLeads: hotLeads || [],
      perUser,
      recentSends: recentSends || [],
    });
  } catch (error: any) {
    console.error('Team stats error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: error.message || 'Failed to fetch team stats' }, { status: 500 });
  }
}
