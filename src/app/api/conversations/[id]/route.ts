import { NextResponse } from 'next/server';

import { buildSnippet, stripQuotedReplyHistory } from '@/lib/email-content';
import { createServerClient } from '@/lib/supabase-server';
import { getWorkspaceContext } from '@/lib/workspace';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
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

    const { data: thread, error: threadError } = await supabase
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
          status
        )
      `)
      .eq('id', id)
      .eq('workspace_id', ctx.workspaceId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (threadError) throw threadError;
    if (!thread) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    const { data: messages, error: messagesError } = await supabase
      .from('mailbox_messages')
      .select(`
        *,
        emails_sent (
          status,
          opened_at,
          replied_at
        )
      `)
      .eq('thread_id', id)
      .eq('workspace_id', ctx.workspaceId)
      .eq('user_id', user.id)
      .order('message_at', { ascending: true });

    if (messagesError) throw messagesError;

    const sanitizedMessages = (messages || []).map((message) => {
      if (message.direction !== 'inbound') return message;

      const cleanedBody = stripQuotedReplyHistory(message.text_body || '');
      return {
        ...message,
        text_body: cleanedBody || message.text_body,
        snippet: buildSnippet(cleanedBody || message.snippet || '') || message.snippet,
      };
    });

    if ((thread.unread_count || 0) > 0) {
      await supabase
        .from('mailbox_threads')
        .update({ unread_count: 0, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('user_id', user.id);
    }

    return NextResponse.json({
      thread: {
        ...thread,
        snippet: buildSnippet(stripQuotedReplyHistory(thread.snippet || '') || thread.snippet || ''),
        unread_count: 0,
      },
      messages: sanitizedMessages,
    });
  } catch (error: any) {
    console.error('Conversation detail error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: error.message || 'Failed to fetch conversation' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
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

    const { error } = await supabase
      .from('mailbox_threads')
      .delete()
      .eq('id', id)
      .eq('workspace_id', ctx.workspaceId)
      .eq('user_id', user.id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Conversation delete error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: error.message || 'Failed to delete conversation' }, { status: 500 });
  }
}
