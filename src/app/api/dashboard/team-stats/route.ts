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

    // Run all top-level counts in parallel
    const [
      { count: totalContacts },
      { count: emailsToday },
      { count: totalEmails },
      { count: totalOpened },
      { count: totalReplied },
      { count: hotLeadsCount },
      { data: teamMembers },
    ] = await Promise.all([
      supabase
        .from('contacts')
        .select('*', { count: 'exact', head: true })
        .eq('workspace_id', ctx.workspaceId),
      supabase
        .from('emails_sent')
        .select('*', { count: 'exact', head: true })
        .eq('workspace_id', ctx.workspaceId)
        .gte('sent_at', today.toISOString()),
      supabase
        .from('emails_sent')
        .select('*', { count: 'exact', head: true })
        .eq('workspace_id', ctx.workspaceId),
      supabase
        .from('emails_sent')
        .select('*', { count: 'exact', head: true })
        .eq('workspace_id', ctx.workspaceId)
        .not('opened_at', 'is', null),
      supabase
        .from('emails_sent')
        .select('*', { count: 'exact', head: true })
        .eq('workspace_id', ctx.workspaceId)
        .not('replied_at', 'is', null),
      supabase
        .from('contacts')
        .select('*', { count: 'exact', head: true })
        .eq('workspace_id', ctx.workspaceId)
        .eq('ai_score_label', 'HOT'),
      supabase
        .from('workspace_members')
        .select('user_id, display_name, email')
        .eq('workspace_id', ctx.workspaceId),
    ]);

    const perUser = await Promise.all(
      (teamMembers || []).map(async (member) => {
        const [
          { count: contacts },
          { count: totalUserEmails },
          { count: emailsSent },
          { count: opens },
          { count: replies },
        ] = await Promise.all([
          supabase
            .from('contacts')
            .select('*', { count: 'exact', head: true })
            .eq('workspace_id', ctx.workspaceId)
            .eq('assigned_to', member.user_id),
          supabase
            .from('emails_sent')
            .select('*', { count: 'exact', head: true })
            .eq('workspace_id', ctx.workspaceId)
            .eq('sent_by', member.user_id),
          supabase
            .from('emails_sent')
            .select('*', { count: 'exact', head: true })
            .eq('workspace_id', ctx.workspaceId)
            .eq('sent_by', member.user_id)
            .gte('sent_at', today.toISOString()),
          supabase
            .from('emails_sent')
            .select('*', { count: 'exact', head: true })
            .eq('workspace_id', ctx.workspaceId)
            .eq('sent_by', member.user_id)
            .not('opened_at', 'is', null),
          supabase
            .from('emails_sent')
            .select('*', { count: 'exact', head: true })
            .eq('workspace_id', ctx.workspaceId)
            .eq('sent_by', member.user_id)
            .not('replied_at', 'is', null),
        ]);

        return {
          name: member.display_name,
          email: member.email,
          contacts: contacts || 0,
          totalEmails: totalUserEmails || 0,
          emailsToday: emailsSent || 0,
          opens: opens || 0,
          replies: replies || 0,
        };
      })
    );

    // Today's activity
    const { data: recentSends } = await supabase
      .from('emails_sent')
      .select(`
        id, contact_id, sent_at, status, sent_by_email,
        contacts (id, email, first_name, last_name, company_name, status),
        templates (id, name)
      `)
      .eq('workspace_id', ctx.workspaceId)
      .gte('sent_at', today.toISOString())
      .order('sent_at', { ascending: false });

    const openRate = totalEmails && totalEmails > 0
      ? Math.round(((totalOpened || 0) / totalEmails) * 100)
      : 0;
    const replyRate = totalEmails && totalEmails > 0
      ? Math.round(((totalReplied || 0) / totalEmails) * 100)
      : 0;

    return NextResponse.json({
      totalContacts: totalContacts || 0,
      emailsToday: emailsToday || 0,
      totalEmails: totalEmails || 0,
      openRate,
      replyRate,
      hotLeadsCount: hotLeadsCount || 0,
      perUser,
      recentSends: recentSends || [],
    });
  } catch (error: any) {
    console.error('Team stats error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: error.message || 'Failed to fetch team stats' }, { status: 500 });
  }
}
