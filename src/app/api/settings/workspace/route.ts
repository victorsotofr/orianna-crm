import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { getWorkspaceContext } from '@/lib/workspace';
import { getServiceSupabase } from '@/lib/supabase';
import { encrypt } from '@/lib/encryption';

export async function GET(request: NextRequest) {
  try {
    const { supabase, error: clientError } = await createServerClient();
    if (!supabase || clientError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const wsId = request.headers.get('x-workspace-id');
    const ctx = await getWorkspaceContext(supabase, user.id, wsId);
    if (!ctx) {
      return NextResponse.json({ error: 'No workspace' }, { status: 403 });
    }

    const serviceSupabase = getServiceSupabase();
    const { data: workspace } = await serviceSupabase
      .from('workspaces')
      .select('fullenrich_api_key_encrypted, linkup_api_key_encrypted')
      .eq('id', ctx.workspaceId)
      .single();

    return NextResponse.json({
      fullenrichConfigured: !!workspace?.fullenrich_api_key_encrypted,
      linkupConfigured: !!workspace?.linkup_api_key_encrypted,
    });
  } catch (error: any) {
    console.error('Workspace settings GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch workspace settings' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, error: clientError } = await createServerClient();
    if (!supabase || clientError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const wsId = request.headers.get('x-workspace-id');
    const ctx = await getWorkspaceContext(supabase, user.id, wsId);
    if (!ctx) {
      return NextResponse.json({ error: 'No workspace' }, { status: 403 });
    }

    const { fullenrichApiKey, linkupApiKey } = await request.json();

    const serviceSupabase = getServiceSupabase();
    const update: Record<string, string | null> = {};

    if (fullenrichApiKey !== undefined) {
      update.fullenrich_api_key_encrypted = fullenrichApiKey ? encrypt(fullenrichApiKey) : null;
    }

    if (linkupApiKey !== undefined) {
      update.linkup_api_key_encrypted = linkupApiKey ? encrypt(linkupApiKey) : null;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const { error: updateError } = await serviceSupabase
      .from('workspaces')
      .update(update)
      .eq('id', ctx.workspaceId);

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Workspace settings POST error:', error);
    return NextResponse.json({ error: error.message || 'Failed to save workspace settings' }, { status: 500 });
  }
}
