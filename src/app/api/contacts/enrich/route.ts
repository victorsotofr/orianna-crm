import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { createServerClient } from '@/lib/supabase-server';
import { getWorkspaceContext } from '@/lib/workspace';
import { getServiceSupabase } from '@/lib/supabase';
import { startBulkEnrichment, getCreditBalance } from '@/lib/fullenrich';


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

    const { contactIds } = await request.json();

    if (!contactIds || !Array.isArray(contactIds) || contactIds.length === 0) {
      return NextResponse.json({ error: 'contactIds required' }, { status: 400 });
    }

    if (contactIds.length > 100) {
      return NextResponse.json({ error: 'Maximum 100 contacts per request' }, { status: 400 });
    }

    // Fetch workspace's FullEnrich API key
    const serviceSupabase = getServiceSupabase();
    const { data: workspace } = await serviceSupabase
      .from('workspaces')
      .select('fullenrich_api_key_encrypted')
      .eq('id', ctx.workspaceId)
      .single();

    if (!workspace?.fullenrich_api_key_encrypted) {
      return NextResponse.json(
        { error: 'FullEnrich API key not configured. Go to Settings > Integrations.' },
        { status: 400 }
      );
    }

    // Check credit balance before starting enrichment
    try {
      const credits = await getCreditBalance(workspace.fullenrich_api_key_encrypted);
      if (credits <= 0) {
        console.warn(`[FullEnrich] No credits remaining for workspace ${ctx.workspaceId}. Enrichment blocked.`);
        return NextResponse.json(
          { error: 'No FullEnrich credits remaining. Please top up your account at fullenrich.com.' },
          { status: 402 }
        );
      }
      console.log(`[FullEnrich] Credits available: ${credits} for workspace ${ctx.workspaceId}`);
    } catch (creditErr: any) {
      console.warn(`[FullEnrich] Could not verify credits for workspace ${ctx.workspaceId}:`, creditErr.message);
      // Continue anyway — the enrichment call itself will fail if no credits
    }

    // Fetch contacts
    const { data: contacts, error: contactsError } = await supabase
      .from('contacts')
      .select('id, first_name, last_name, company_domain, company_name, linkedin_url, workspace_id')
      .in('id', contactIds)
      .eq('workspace_id', ctx.workspaceId);

    if (contactsError || !contacts || contacts.length === 0) {
      return NextResponse.json({ error: 'No contacts found' }, { status: 404 });
    }

    // Filter contacts that have enough data for enrichment
    // FullEnrich needs at least firstname + lastname, plus ideally domain/company_name/linkedin
    const enrichable = contacts.filter(
      (c) => c.first_name && c.last_name && (c.company_domain || c.company_name || c.linkedin_url)
    );

    if (enrichable.length === 0) {
      return NextResponse.json(
        { error: 'No contacts have enough data for enrichment (need first name, last name, and company or LinkedIn)' },
        { status: 400 }
      );
    }

    // Build webhook URL
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!appUrl) {
      return NextResponse.json({ error: 'NEXT_PUBLIC_APP_URL not configured' }, { status: 500 });
    }
    const webhookUrl = `${appUrl}/api/webhooks/fullenrich`;

    // Start enrichment
    const enrichmentId = await startBulkEnrichment(
      workspace.fullenrich_api_key_encrypted,
      enrichable.map((c) => ({
        contact_id: c.id,
        workspace_id: c.workspace_id,
        firstname: c.first_name!,
        lastname: c.last_name!,
        domain: c.company_domain || undefined,
        company_name: c.company_name || undefined,
        linkedin_url: c.linkedin_url || undefined,
      })),
      webhookUrl
    );

    return NextResponse.json({
      enrichmentId,
      contactCount: enrichable.length,
      skipped: contacts.length - enrichable.length,
    });
  } catch (error: any) {
    console.error('Enrich error:', error);
    Sentry.captureException(error);
    return NextResponse.json({ error: error.message || 'Enrichment failed' }, { status: 500 });
  }
}
