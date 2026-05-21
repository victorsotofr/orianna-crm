import { NextRequest, NextResponse } from 'next/server';

import { DEFAULT_GTM_DAILY_LIMIT, runDailyProspecting, type GtmRunMode } from '@/lib/gtm-automation';
import { getServiceSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function isAuthorized(request: NextRequest) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const cronSecret = process.env.CRON_SECRET;
  const xServiceKey = request.headers.get('x-service-key');
  const authorization = request.headers.get('authorization');

  return Boolean(
    request.headers.get('x-vercel-cron') ||
    (serviceKey && xServiceKey === serviceKey) ||
    (serviceKey && authorization === `Bearer ${serviceKey}`) ||
    (cronSecret && authorization === `Bearer ${cronSecret}`)
  );
}

function parseMode(value: unknown): GtmRunMode | undefined {
  return value === 'dry_run' || value === 'import_prepare' || value === 'full_auto' ? value : undefined;
}

async function parsePayload(request: NextRequest) {
  if (request.method === 'GET') {
    const url = new URL(request.url);
    const mode = parseMode(url.searchParams.get('mode'));
    return {
      workspaceId: url.searchParams.get('workspace_id') || undefined,
      userId: url.searchParams.get('user_id') || undefined,
      limit: url.searchParams.get('limit') ? Number(url.searchParams.get('limit')) : undefined,
      query: url.searchParams.get('query') || undefined,
      mode,
      dryRun: url.searchParams.get('dry_run') === 'true' || mode === 'dry_run',
    };
  }

  const body = await request.json().catch(() => ({}));
  const mode = parseMode(body.mode);
  return {
    workspaceId: body.workspace_id || body.workspaceId,
    userId: body.user_id || body.userId,
    limit: body.limit,
    query: body.query,
    mode,
    dryRun: body.dry_run === true || body.dryRun === true || mode === 'dry_run',
  };
}

async function handler(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const payload = await parsePayload(request);
  const db = getServiceSupabase();

  if (payload.workspaceId && payload.userId) {
    const result = await runDailyProspecting({
      workspaceId: payload.workspaceId,
      userId: payload.userId,
      limit: payload.limit,
      query: payload.query,
      mode: payload.mode || (payload.dryRun ? 'dry_run' : 'import_prepare'),
      dryRun: payload.dryRun,
      respectEnabled: false,
    });
    return NextResponse.json({ processed: 1, results: [result] }, { status: result.error ? 500 : 200 });
  }

  const { data: workspaces, error } = await db
    .from('workspaces')
    .select('id, gtm_daily_contact_limit')
    .eq('gtm_enabled', true)
    .limit(10);

  if (error) throw error;

  const results = [];
  for (const workspace of workspaces || []) {
    const { data: owner } = await db
      .from('workspace_members')
      .select('user_id')
      .eq('workspace_id', workspace.id)
      .eq('role', 'admin')
      .limit(1)
      .maybeSingle();

    if (!owner?.user_id) {
      results.push({
        runId: null,
        importedCount: 0,
        preparedCount: 0,
        enrolledCount: 0,
        skippedCount: 0,
        error: `No admin owner for workspace ${workspace.id}`,
      });
      continue;
    }

    results.push(await runDailyProspecting({
      workspaceId: workspace.id,
      userId: owner.user_id,
      limit: payload.limit || workspace.gtm_daily_contact_limit || DEFAULT_GTM_DAILY_LIMIT,
      query: payload.query,
      mode: payload.mode,
      dryRun: payload.dryRun,
      respectEnabled: true,
    }));
  }

  return NextResponse.json({
    processed: results.length,
    results,
  });
}

export async function GET(request: NextRequest) {
  try {
    return await handler(request);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Daily prospecting cron failed';
    console.error('Daily prospecting cron error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    return await handler(request);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Daily prospecting cron failed';
    console.error('Daily prospecting cron error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
