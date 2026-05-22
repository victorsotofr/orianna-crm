import { NextRequest, NextResponse } from 'next/server';

import { getCreditBalance, startBulkEnrichment } from '@/lib/fullenrich';
import { saveSessionProspectsAsContacts } from '@/lib/outreach';
import { getServiceSupabase } from '@/lib/supabase';
import { createServerClient } from '@/lib/supabase-server';
import { getWorkspaceContext } from '@/lib/workspace';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { supabase, error: clientError } = await createServerClient();
    if (!supabase || clientError) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const wsId = request.headers.get('x-workspace-id');
    const ctx = await getWorkspaceContext(supabase, user.id, wsId);
    if (!ctx) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

    const body = await request.json().catch(() => ({}));
    const prospectIds = Array.isArray(body.prospectIds)
      ? body.prospectIds.filter((value: unknown): value is string => typeof value === 'string')
      : undefined;

    const serviceSupabase = getServiceSupabase();
    const { data: userSettings } = await serviceSupabase
      .from('user_settings')
      .select('fullenrich_api_key_encrypted')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!userSettings?.fullenrich_api_key_encrypted) {
      return NextResponse.json(
        { error: 'FullEnrich API key not configured. Go to Settings > Integrations.' },
        { status: 400 }
      );
    }

    try {
      const credits = await getCreditBalance(userSettings.fullenrich_api_key_encrypted);
      if (credits <= 0) {
        return NextResponse.json({ error: 'No FullEnrich credits remaining.' }, { status: 402 });
      }
    } catch (error) {
      console.warn('[Outreach] Could not verify FullEnrich credits:', error);
    }

    await supabase
      .from('outreach_sessions')
      .update({ status: 'enriching', updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('workspace_id', ctx.workspaceId);

    const saved = await saveSessionProspectsAsContacts({
      db: supabase,
      workspaceId: ctx.workspaceId,
      userId: user.id,
      sessionId: id,
      prospectIds,
    });

    if (saved.contactIds.length === 0) {
      return NextResponse.json({ error: 'No selected prospects could be saved for enrichment', skipped: saved.skipped }, { status: 400 });
    }

    const { data: contacts, error: contactsError } = await supabase
      .from('contacts')
      .select('id, first_name, last_name, company_domain, company_name, linkedin_url, workspace_id')
      .in('id', saved.contactIds)
      .eq('workspace_id', ctx.workspaceId);

    if (contactsError) throw contactsError;

    const enrichable = (contacts || []).filter(
      (contact) => contact.first_name && contact.last_name && (contact.company_domain || contact.company_name || contact.linkedin_url)
    );

    if (enrichable.length === 0) {
      await supabase
        .from('outreach_session_prospects')
        .update({ enrichment_status: 'not_enrichable', updated_at: new Date().toISOString() })
        .eq('session_id', id)
        .eq('workspace_id', ctx.workspaceId)
        .in('contact_id', saved.contactIds);

      return NextResponse.json({ error: 'No selected prospects have enough data for enrichment', skipped: saved.skipped }, { status: 400 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!appUrl) {
      return NextResponse.json({ error: 'NEXT_PUBLIC_APP_URL not configured' }, { status: 500 });
    }

    const enrichmentId = await startBulkEnrichment(
      userSettings.fullenrich_api_key_encrypted,
      enrichable.map((contact) => ({
        contact_id: contact.id,
        workspace_id: contact.workspace_id,
        firstname: contact.first_name!,
        lastname: contact.last_name!,
        domain: contact.company_domain || undefined,
        company_name: contact.company_name || undefined,
        linkedin_url: contact.linkedin_url || undefined,
      })),
      `${appUrl}/api/webhooks/fullenrich`
    );

    await supabase
      .from('outreach_session_prospects')
      .update({ enrichment_status: 'requested', updated_at: new Date().toISOString() })
      .eq('session_id', id)
      .eq('workspace_id', ctx.workspaceId)
      .in('contact_id', enrichable.map((contact) => contact.id));

    await supabase
      .from('outreach_sessions')
      .update({ status: 'ready', updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('workspace_id', ctx.workspaceId);

    return NextResponse.json({
      enrichmentId,
      contactCount: enrichable.length,
      skipped: saved.skipped.length + saved.contactIds.length - enrichable.length,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Enrichment failed';
    console.error('Outreach enrich error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
