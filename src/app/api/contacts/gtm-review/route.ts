import { NextRequest, NextResponse } from 'next/server';

import { applyGtmReviewAction, type GtmReviewAction } from '@/lib/gtm-review';
import { createServerClient } from '@/lib/supabase-server';
import { getWorkspaceContext } from '@/lib/workspace';

const VALID_REVIEW_STATUSES = ['pending', 'approved', 'rejected'] as const;
type ReviewStatus = typeof VALID_REVIEW_STATUSES[number];

function mapReviewStatus(status: ReviewStatus): GtmReviewAction {
  if (status === 'approved') return 'approve_queue';
  if (status === 'rejected') return 'reject';
  return 'hold';
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
    const contactIds = body.contact_ids || body.contactIds;
    const reviewStatus = body.review_status || body.reviewStatus;

    if (!Array.isArray(contactIds) || contactIds.length === 0 || contactIds.some((id) => typeof id !== 'string')) {
      return NextResponse.json({ error: 'contact_ids required' }, { status: 400 });
    }

    if (!VALID_REVIEW_STATUSES.includes(reviewStatus)) {
      return NextResponse.json({ error: 'Invalid GTM review status' }, { status: 400 });
    }

    const result = await applyGtmReviewAction({
      db: supabase,
      workspaceId: ctx.workspaceId,
      userId: user.id,
      contactIds,
      action: mapReviewStatus(reviewStatus),
      source: 'web',
      note: typeof body.note === 'string' ? body.note : undefined,
    });

    if (reviewStatus === 'approved' && result.updated === 0) {
      return NextResponse.json({
        ...result,
        reviewStatus,
        error: result.skippedContacts[0]?.reasons.join(', ') || 'No selected GTM prospects are ready to approve and queue',
      }, { status: 400 });
    }

    return NextResponse.json({
      ...result,
      reviewStatus,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update GTM review status';
    console.error('GTM review update error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
