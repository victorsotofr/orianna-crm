import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { getWorkspaceContext } from '@/lib/workspace';
import { getServiceSupabase } from '@/lib/supabase';
import { getCreditBalance } from '@/lib/fullenrich';

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
      .select('fullenrich_api_key_encrypted')
      .eq('id', ctx.workspaceId)
      .single();

    if (!workspace?.fullenrich_api_key_encrypted) {
      return NextResponse.json({ credits: null, configured: false });
    }

    const credits = await getCreditBalance(workspace.fullenrich_api_key_encrypted);

    return NextResponse.json({ credits, configured: true });
  } catch (error: any) {
    console.error('Enrichment credits error:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch credits' }, { status: 500 });
  }
}
