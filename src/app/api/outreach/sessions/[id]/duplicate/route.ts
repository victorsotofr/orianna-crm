import { NextRequest, NextResponse } from 'next/server';

import { deriveOutreachThreadTitle } from '@/lib/outreach';
import { createServerClient } from '@/lib/supabase-server';
import { getWorkspaceContext } from '@/lib/workspace';

function cloneRow(row: Record<string, unknown>, patch: Record<string, unknown>) {
  const copy = { ...row, ...patch };
  delete copy.id;
  delete copy.created_at;
  delete copy.updated_at;
  return copy;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { supabase, error: clientError } = await createServerClient();
    if (!supabase || clientError) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const wsId = request.headers.get('x-workspace-id');
    const ctx = await getWorkspaceContext(supabase, user.id, wsId);
    if (!ctx) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

    const { data: source, error: sourceError } = await supabase
      .from('outreach_sessions')
      .select('*')
      .eq('id', id)
      .eq('workspace_id', ctx.workspaceId)
      .maybeSingle();

    if (sourceError) throw sourceError;
    if (!source) return NextResponse.json({ error: 'Outreach session not found' }, { status: 404 });

    const title = deriveOutreachThreadTitle(`Copy of ${source.title || source.prompt || 'outreach'}`);
    const now = new Date().toISOString();
    const { data: duplicated, error: insertError } = await supabase
      .from('outreach_sessions')
      .insert(cloneRow(source as Record<string, unknown>, {
        user_id: user.id,
        title,
        status: 'draft',
        error: null,
        duplicated_from_session_id: id,
        archived_at: null,
        deleted_at: null,
        last_message_at: now,
        metadata: {
          ...((source.metadata || {}) as Record<string, unknown>),
          duplicatedFromSessionId: id,
        },
      }))
      .select()
      .single();

    if (insertError) throw insertError;

    const [messages, prospects, draft] = await Promise.all([
      supabase.from('outreach_session_messages').select('*').eq('workspace_id', ctx.workspaceId).eq('session_id', id).order('created_at', { ascending: true }),
      supabase.from('outreach_session_prospects').select('*').eq('workspace_id', ctx.workspaceId).eq('session_id', id).order('created_at', { ascending: true }),
      supabase.from('outreach_sequence_drafts').select('*').eq('workspace_id', ctx.workspaceId).eq('session_id', id).maybeSingle(),
    ]);

    if (messages.data?.length) {
      await supabase.from('outreach_session_messages').insert(
        messages.data.map((row) => cloneRow(row as Record<string, unknown>, {
          session_id: duplicated.id,
          workspace_id: ctx.workspaceId,
        }))
      );
    }

    if (prospects.data?.length) {
      await supabase.from('outreach_session_prospects').insert(
        prospects.data.map((row) => cloneRow(row as Record<string, unknown>, {
          session_id: duplicated.id,
          workspace_id: ctx.workspaceId,
        }))
      );
    }

    if (draft.data) {
      await supabase.from('outreach_sequence_drafts').insert(
        cloneRow(draft.data as Record<string, unknown>, {
          session_id: duplicated.id,
          workspace_id: ctx.workspaceId,
        })
      );
    }

    return NextResponse.json({ session: duplicated }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to duplicate outreach session';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
