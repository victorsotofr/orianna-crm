import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { getWorkspaceContext } from '@/lib/workspace';
import { getServiceSupabase } from '@/lib/supabase';
import { getEnrichmentResult, type EnrichmentResultData } from '@/lib/fullenrich';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ enrichmentId: string }> }
) {
  try {
    const { enrichmentId } = await params;

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

    // Fetch workspace's FullEnrich API key
    const serviceSupabase = getServiceSupabase();
    const { data: workspace } = await serviceSupabase
      .from('workspaces')
      .select('fullenrich_api_key_encrypted')
      .eq('id', ctx.workspaceId)
      .single();

    if (!workspace?.fullenrich_api_key_encrypted) {
      return NextResponse.json({ error: 'FullEnrich API key not configured' }, { status: 400 });
    }

    // Poll FullEnrich for results
    const result = await getEnrichmentResult(workspace.fullenrich_api_key_encrypted, enrichmentId);

    let updatedCount = 0;

    // Process each contact result
    for (const item of result.datas || []) {
      const custom = item.custom || (item as any).contact?.custom;
      const contactId = custom?.contact_id;
      const workspaceId = custom?.workspace_id;

      if (!contactId || !workspaceId || workspaceId !== ctx.workspaceId) continue;

      const contact = item.contact || (item as any);
      const email = contact.most_probable_email || contact.emails?.[0]?.email || null;
      const emailStatus = contact.most_probable_email_status || contact.emails?.[0]?.status || null;
      const phone = contact.most_probable_phone || contact.phones?.[0]?.number || null;

      if (!email && !phone) continue;

      // Fetch existing contact to avoid overwriting
      const { data: existing } = await serviceSupabase
        .from('contacts')
        .select('id, email, phone, enriched_at')
        .eq('id', contactId)
        .eq('workspace_id', workspaceId)
        .single();

      if (!existing) continue;

      // Skip if already enriched by a previous poll
      if (existing.enriched_at) continue;

      const update: Record<string, unknown> = {
        email_verified_status: emailStatus,
        enriched_at: new Date().toISOString(),
        enrichment_source: 'fullenrich',
      };

      if (email && !existing.email) {
        update.email = email;
      } else if (email && emailStatus === 'DELIVERABLE') {
        update.email = email;
      }

      if (phone && !existing.phone) {
        update.phone = phone;
      }

      await serviceSupabase
        .from('contacts')
        .update(update)
        .eq('id', contactId);

      // Timeline entry
      const desc = [
        email ? `Email: ${email} (${emailStatus || 'unknown'})` : null,
        phone ? `Phone: ${phone}` : null,
      ].filter(Boolean).join(', ');

      await serviceSupabase.from('contact_timeline').insert({
        contact_id: contactId,
        event_type: 'enriched',
        title: 'Contact enrichi via FullEnrich',
        description: desc,
        workspace_id: workspaceId,
      });

      updatedCount++;
    }

    return NextResponse.json({
      status: result.status,
      total: result.datas.length,
      updated: updatedCount,
      finished: result.status === 'FINISHED',
    });
  } catch (error: any) {
    console.error('Enrichment poll error:', error);
    return NextResponse.json({ error: error.message || 'Poll failed' }, { status: 500 });
  }
}
