import { NextRequest, NextResponse } from 'next/server';

import { getGtmReviewQueue } from '@/lib/gtm-review';
import { createServerClient } from '@/lib/supabase-server';
import { getWorkspaceContext } from '@/lib/workspace';

export const dynamic = 'force-dynamic';

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

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      workspaceResult,
      sourcedResult,
      todayResult,
      hotResult,
      pendingReviewResult,
      enrollmentsResult,
      lastRunResult,
      sequencesResult,
      reviewQueue,
    ] = await Promise.all([
      supabase
        .from('workspaces')
        .select('name, gtm_enabled, gtm_daily_contact_limit, gtm_requires_approval, gtm_active_sequence_id, gtm_last_run_at, gtm_last_run_status, gtm_last_run_summary')
        .eq('id', ctx.workspaceId)
        .single(),
      supabase
        .from('contacts')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', ctx.workspaceId)
        .eq('segment', 'property_manager_france'),
      supabase
        .from('contacts')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', ctx.workspaceId)
        .eq('segment', 'property_manager_france')
        .gte('created_at', today.toISOString()),
      supabase
        .from('contacts')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', ctx.workspaceId)
        .eq('segment', 'property_manager_france')
        .eq('ai_score_label', 'HOT'),
      supabase
        .from('contacts')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', ctx.workspaceId)
        .eq('source', 'gtm_autopilot')
        .eq('gtm_review_status', 'pending'),
      supabase
        .from('campaign_enrollments')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', ctx.workspaceId)
        .eq('status', 'active'),
      supabase
        .from('gtm_daily_runs')
        .select('id, status, imported_count, prepared_count, enrolled_count, skipped_count, error, started_at, finished_at')
        .eq('workspace_id', ctx.workspaceId)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('campaign_sequences')
        .select('id, name, status')
        .eq('workspace_id', ctx.workspaceId)
        .in('status', ['active', 'paused', 'draft'])
        .order('updated_at', { ascending: false })
        .limit(10),
      getGtmReviewQueue({
        db: supabase,
        workspaceId: ctx.workspaceId,
        status: 'pending',
        limit: 1,
      }),
    ]);

    if (workspaceResult.error) throw workspaceResult.error;

    return NextResponse.json({
      workspace: workspaceResult.data,
      metrics: {
        sourcedContacts: sourcedResult.count || 0,
        addedToday: todayResult.count || 0,
        hotSourcedLeads: hotResult.count || 0,
        pendingReview: pendingReviewResult.count || 0,
        readyReview: reviewQueue.counts.ready,
        blockedReview: reviewQueue.counts.blocked,
        approvedReview: reviewQueue.counts.approved,
        queuedReview: reviewQueue.counts.queued,
        activeEnrollments: enrollmentsResult.count || 0,
      },
      lastRun: lastRunResult.data || null,
      sequences: sequencesResult.data || [],
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch GTM status';
    console.error('GTM status error:', message);
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
    const update: Record<string, unknown> = {};

    if (typeof body.enabled === 'boolean') update.gtm_enabled = body.enabled;
    if (typeof body.requiresApproval === 'boolean') update.gtm_requires_approval = body.requiresApproval;
    if (typeof body.activeSequenceId === 'string' || body.activeSequenceId === null) {
      if (body.activeSequenceId) {
        const { data: sequence, error: sequenceError } = await supabase
          .from('campaign_sequences')
          .select('id')
          .eq('id', body.activeSequenceId)
          .eq('workspace_id', ctx.workspaceId)
          .maybeSingle();

        if (sequenceError) throw sequenceError;
        if (!sequence) {
          return NextResponse.json({ error: 'Sequence not found for workspace' }, { status: 404 });
        }
      }

      update.gtm_active_sequence_id = body.activeSequenceId || null;
    }
    if (body.dailyLimit !== undefined) {
      const dailyLimit = Number(body.dailyLimit);
      if (!Number.isInteger(dailyLimit) || dailyLimit < 1 || dailyLimit > 100) {
        return NextResponse.json({ error: 'dailyLimit must be an integer between 1 and 100' }, { status: 400 });
      }
      update.gtm_daily_contact_limit = dailyLimit;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'No GTM settings provided' }, { status: 400 });
    }

    const { error } = await supabase
      .from('workspaces')
      .update(update)
      .eq('id', ctx.workspaceId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update GTM settings';
    console.error('GTM status update error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
