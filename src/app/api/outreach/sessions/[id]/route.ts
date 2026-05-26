import { NextRequest, NextResponse } from 'next/server';

import { deriveOutreachThreadTitle, getOutreachSessionBundle } from '@/lib/outreach';
import { createServerClient } from '@/lib/supabase-server';
import { getWorkspaceContext } from '@/lib/workspace';

export async function GET(
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

    const bundle = await getOutreachSessionBundle(supabase, ctx.workspaceId, id);
    if (!bundle.session) return NextResponse.json({ error: 'Outreach session not found' }, { status: 404 });

    return NextResponse.json(bundle);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load outreach session';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function isMissingThreadCrudColumnError(error: unknown) {
  const err = error as { code?: string; message?: string } | null;
  return err?.code === 'PGRST204' || err?.code === '42703' || Boolean(err?.message?.includes('archived_at'));
}

export async function PATCH(
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

    const body = await request.json().catch(() => ({})) as {
      title?: string;
      archived?: boolean;
      restored?: boolean;
      metadata?: Record<string, unknown>;
    };

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof body.title === 'string') patch.title = deriveOutreachThreadTitle(body.title);
    if (body.archived === true) patch.archived_at = new Date().toISOString();
    if (body.archived === false) patch.archived_at = null;
    if (body.restored === true) patch.deleted_at = null;
    if (body.metadata && typeof body.metadata === 'object') patch.metadata = body.metadata;

    if (Object.keys(patch).length === 1) {
      return NextResponse.json({ error: 'No supported fields to update' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('outreach_sessions')
      .update(patch)
      .eq('id', id)
      .eq('workspace_id', ctx.workspaceId)
      .select()
      .single();

    if (error) {
      if (isMissingThreadCrudColumnError(error)) {
        return NextResponse.json({ error: 'Thread CRUD migration is not applied yet' }, { status: 409 });
      }
      throw error;
    }

    return NextResponse.json({ session: data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update outreach session';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
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

    const { data, error } = await supabase
      .from('outreach_sessions')
      .update({
        deleted_at: new Date().toISOString(),
        archived_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('workspace_id', ctx.workspaceId)
      .select()
      .single();

    if (error) {
      if (isMissingThreadCrudColumnError(error)) {
        return NextResponse.json({ error: 'Thread CRUD migration is not applied yet' }, { status: 409 });
      }
      throw error;
    }

    return NextResponse.json({ session: data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete outreach session';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
