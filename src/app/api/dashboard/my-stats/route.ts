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

    const [
      { count: myContacts },
      { count: myEmailsToday },
      { count: myTotalEmails },
      { count: myOpened },
      { count: myReplied },
      { data: myRecentSends },
    ] = await Promise.all([
      supabase
        .from('contacts')
        .select('*', { count: 'exact', head: true })
        .eq('workspace_id', ctx.workspaceId)
        .eq('assigned_to', user.id),
      supabase
        .from('emails_sent')
        .select('*', { count: 'exact', head: true })
        .eq('workspace_id', ctx.workspaceId)
        .eq('sent_by', user.id)
        .gte('sent_at', today.toISOString()),
      supabase
        .from('emails_sent')
        .select('*', { count: 'exact', head: true })
        .eq('workspace_id', ctx.workspaceId)
        .eq('sent_by', user.id),
      supabase
        .from('emails_sent')
        .select('*', { count: 'exact', head: true })
        .eq('workspace_id', ctx.workspaceId)
        .eq('sent_by', user.id)
        .not('opened_at', 'is', null),
      supabase
        .from('emails_sent')
        .select('*', { count: 'exact', head: true })
        .eq('workspace_id', ctx.workspaceId)
        .eq('sent_by', user.id)
        .not('replied_at', 'is', null),
      supabase
        .from('emails_sent')
        .select(`
          id, contact_id, sent_at, status, sent_by_email,
          contacts (id, email, first_name, last_name, company_name, status),
          templates (id, name)
        `)
        .eq('workspace_id', ctx.workspaceId)
        .eq('sent_by', user.id)
        .gte('sent_at', today.toISOString())
        .order('sent_at', { ascending: false }),
    ]);

    const myOpenRate = myTotalEmails && myTotalEmails > 0
      ? Math.round(((myOpened || 0) / myTotalEmails) * 100)
      : 0;
    const myReplyRate = myTotalEmails && myTotalEmails > 0
      ? Math.round(((myReplied || 0) / myTotalEmails) * 100)
      : 0;

    return NextResponse.json({
      myContacts: myContacts || 0,
      myEmailsToday: myEmailsToday || 0,
      myTotalEmails: myTotalEmails || 0,
      myOpenRate,
      myReplyRate,
      myRecentSends: myRecentSends || [],
    });
  } catch (error: any) {
    console.error('My stats error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: error.message || 'Failed to fetch my stats' }, { status: 500 });
  }
}
