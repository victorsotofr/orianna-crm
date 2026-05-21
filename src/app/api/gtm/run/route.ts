import { NextRequest, NextResponse } from 'next/server';

import { runDailyProspecting, type GtmRunMode } from '@/lib/gtm-automation';
import { createServerClient } from '@/lib/supabase-server';
import { getWorkspaceContext } from '@/lib/workspace';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function parseMode(value: unknown): GtmRunMode | null {
  if (value === 'dry_run' || value === 'import_prepare' || value === 'full_auto') return value;
  return null;
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

    const body = await request.json().catch(() => ({}));
    const mode = parseMode(body.mode) || (body.dryRun === true ? 'dry_run' : 'import_prepare');
    if (body.mode && !parseMode(body.mode)) {
      return NextResponse.json({ error: 'Invalid GTM run mode' }, { status: 400 });
    }

    const result = await runDailyProspecting({
      workspaceId: ctx.workspaceId,
      userId: user.id,
      limit: body.limit,
      query: body.query,
      mode,
      dryRun: mode === 'dry_run',
    });

    const status = result.error ? 500 : 200;
    return NextResponse.json(result, { status });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to run GTM prospecting';
    console.error('GTM run error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
