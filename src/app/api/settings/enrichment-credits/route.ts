import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { getWorkspaceContext } from '@/lib/workspace';
import { getServiceSupabase } from '@/lib/supabase';
import { getCreditBalance as getFullenrichCredits } from '@/lib/fullenrich';
import { getLinkupCreditBalance } from '@/lib/linkup';

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

    const result: {
      fullenrich: { configured: boolean; credits: number | null };
      linkup: { configured: boolean; credits: number | null };
    } = {
      fullenrich: { configured: false, credits: null },
      linkup: { configured: false, credits: null },
    };

    // Fetch both credit balances in parallel
    const promises: Promise<void>[] = [];

    if (workspace?.fullenrich_api_key_encrypted) {
      result.fullenrich.configured = true;
      promises.push(
        getFullenrichCredits(workspace.fullenrich_api_key_encrypted)
          .then((credits) => { result.fullenrich.credits = credits; })
          .catch((err) => { console.error('FullEnrich credits fetch error:', err.message); })
      );
    }

    if (workspace?.linkup_api_key_encrypted) {
      result.linkup.configured = true;
      promises.push(
        getLinkupCreditBalance(workspace.linkup_api_key_encrypted)
          .then((credits) => { result.linkup.credits = credits; })
          .catch((err) => { console.error('Linkup credits fetch error:', err.message); })
      );
    }

    await Promise.all(promises);

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Credits fetch error:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch credits' }, { status: 500 });
  }
}
