import { NextRequest, NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase-server';
import { getWorkspaceContext } from '@/lib/workspace';
import { isGenericInbox, type GtmReviewStatus } from '@/lib/gtm-safety';

const VALID_REVIEW_STATUSES: GtmReviewStatus[] = ['pending', 'approved', 'rejected'];

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
    const contactIds = Array.isArray(body.contact_ids) ? body.contact_ids : body.contactIds;
    const reviewStatus = body.review_status || body.reviewStatus;

    if (!Array.isArray(contactIds) || contactIds.length === 0) {
      return NextResponse.json({ error: 'contact_ids array is required' }, { status: 400 });
    }
    if (!VALID_REVIEW_STATUSES.includes(reviewStatus)) {
      return NextResponse.json({ error: 'Invalid GTM review status' }, { status: 400 });
    }

    let idsToUpdate = contactIds as string[];
    let skipped = 0;
    if (reviewStatus === 'approved') {
      const { data: contactsToApprove, error: contactsError } = await supabase
        .from('contacts')
        .select('id, email')
        .eq('workspace_id', ctx.workspaceId)
        .eq('source', 'gtm_autopilot')
        .in('id', contactIds);

      if (contactsError) throw contactsError;
      idsToUpdate = (contactsToApprove || [])
        .filter((contact) => contact.email && !isGenericInbox(contact.email))
        .map((contact) => contact.id);
      skipped = contactIds.length - idsToUpdate.length;

      if (idsToUpdate.length === 0) {
        return NextResponse.json({
          updated: 0,
          skipped,
          reviewStatus,
          error: 'No selected GTM prospects have a direct professional email yet',
        }, { status: 400 });
      }
    }

    const now = new Date().toISOString();
    const update = reviewStatus === 'approved'
      ? {
          gtm_review_status: 'approved',
          gtm_send_approved_at: now,
          gtm_send_approved_by: user.id,
          suppressed_reason: null,
        }
      : reviewStatus === 'rejected'
        ? {
            gtm_review_status: 'rejected',
            gtm_send_approved_at: null,
            gtm_send_approved_by: null,
            suppressed_reason: 'gtm_rejected',
          }
        : {
            gtm_review_status: 'pending',
            gtm_send_approved_at: null,
            gtm_send_approved_by: null,
            suppressed_reason: null,
          };

    const { data: updatedContacts, error } = await supabase
      .from('contacts')
      .update(update)
      .eq('workspace_id', ctx.workspaceId)
      .eq('source', 'gtm_autopilot')
      .in('id', idsToUpdate)
      .select('id');

    if (error) throw error;

    if (updatedContacts && updatedContacts.length > 0) {
      const timelineEvents = updatedContacts.map((contact) => ({
        contact_id: contact.id,
        workspace_id: ctx.workspaceId,
        event_type: 'gtm_review_updated',
        title: `GTM review ${reviewStatus}`,
        description: reviewStatus === 'approved'
          ? 'Approved for outreach'
          : reviewStatus === 'rejected'
            ? 'Rejected from GTM outreach'
            : 'Returned to pending review',
        metadata: { review_status: reviewStatus },
        created_by: user.id,
      }));

      await supabase.from('contact_timeline').insert(timelineEvents);
    }

    return NextResponse.json({
      updated: updatedContacts?.length || 0,
      skipped,
      reviewStatus,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update GTM review status';
    console.error('GTM review update error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
