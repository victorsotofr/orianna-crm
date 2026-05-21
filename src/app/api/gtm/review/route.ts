import { NextRequest, NextResponse } from 'next/server';

import {
  applyGtmReviewAction,
  getGtmReviewQueue,
  type GtmReviewAction,
  type GtmReviewFilter,
  type GtmReviewSource,
} from '@/lib/gtm-review';
import { createServerClient } from '@/lib/supabase-server';
import { getWorkspaceContext } from '@/lib/workspace';

export const dynamic = 'force-dynamic';

const VALID_FILTERS: GtmReviewFilter[] = ['all', 'pending', 'ready', 'blocked', 'approved', 'rejected', 'queued'];
const VALID_ACTIONS: GtmReviewAction[] = ['approve_queue', 'reject', 'hold', 'reenrich'];
const VALID_SOURCES: GtmReviewSource[] = ['web', 'telegram', 'voice', 'system'];

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

    const { searchParams } = new URL(request.url);
    const requestedStatus = searchParams.get('status') as GtmReviewFilter | null;
    const status = requestedStatus && VALID_FILTERS.includes(requestedStatus) ? requestedStatus : 'pending';
    const requestedLimit = Number(searchParams.get('limit') || 50);
    const limit = Number.isInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 100) : 50;

    const queue = await getGtmReviewQueue({
      db: supabase,
      workspaceId: ctx.workspaceId,
      status,
      limit,
    });

    return NextResponse.json(queue);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch outbound review queue';
    console.error('Outbound review queue error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
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

    const body = await request.json();
    const action = body.action as GtmReviewAction | undefined;
    const source = body.source as GtmReviewSource | undefined;
    const contactIds = body.contactIds || body.contact_ids;

    if (!action || !VALID_ACTIONS.includes(action)) {
      return NextResponse.json({ error: 'Invalid outbound review action' }, { status: 400 });
    }

    if (!Array.isArray(contactIds) || contactIds.length === 0 || contactIds.some((id) => typeof id !== 'string')) {
      return NextResponse.json({ error: 'contactIds required' }, { status: 400 });
    }

    if (contactIds.length > 100) {
      return NextResponse.json({ error: 'Maximum 100 outbound prospects per review action' }, { status: 400 });
    }

    const result = await applyGtmReviewAction({
      db: supabase,
      workspaceId: ctx.workspaceId,
      userId: user.id,
      contactIds,
      action,
      source: source && VALID_SOURCES.includes(source) ? source : 'web',
      note: typeof body.note === 'string' ? body.note : undefined,
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update outbound review queue';
    console.error('Outbound review action error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
