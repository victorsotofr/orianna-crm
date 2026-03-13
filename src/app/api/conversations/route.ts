import { NextRequest, NextResponse } from 'next/server';

import { buildSnippet, stripQuotedReplyHistory } from '@/lib/email-content';
import { createServerClient } from '@/lib/supabase-server';
import { getWorkspaceContext } from '@/lib/workspace';

export async function GET(request: NextRequest) {
  try {
    const { supabase, error: clientError } = await createServerClient();
    if (clientError || !supabase) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const wsId = request.headers.get('x-workspace-id');
    const ctx = await getWorkspaceContext(supabase, user.id, wsId);
    if (!ctx) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const contactId = searchParams.get('contact_id');
    const limit = Math.min(Number(searchParams.get('limit') || 100), 200);

    let query = supabase
      .from('mailbox_threads')
      .select(`
        id,
        workspace_id,
        user_id,
        contact_id,
        subject,
        subject_normalized,
        snippet,
        unread_count,
        last_message_at,
        last_message_direction,
        participants,
        created_at,
        updated_at,
        contacts (
          id,
          email,
          first_name,
          last_name,
          company_name,
          status,
          email_bounced,
          bounce_reason,
          email_recovery_count
        ),
        inbound_messages:mailbox_messages!mailbox_messages_thread_id_fkey!inner (
          id,
          direction
        )
      `)
      .eq('workspace_id', ctx.workspaceId)
      .eq('user_id', user.id)
      .eq('inbound_messages.direction', 'inbound')
      .order('last_message_at', { ascending: false })
      .limit(limit)
      .limit(1, { foreignTable: 'inbound_messages' });

    if (contactId) {
      query = query.eq('contact_id', contactId);
    }

    const { data: threadRows, error } = await query;
    if (error) throw error;

    const threads = (threadRows || []).map(({ inbound_messages: _inboundMessages, ...thread }) => ({
      ...thread,
      snippet: buildSnippet(stripQuotedReplyHistory(thread.snippet || '') || thread.snippet || ''),
    }));

    return NextResponse.json({ threads: threads || [] });
  } catch (error: any) {
    console.error('Conversations list error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: error.message || 'Failed to fetch conversations' }, { status: 500 });
  }
}
