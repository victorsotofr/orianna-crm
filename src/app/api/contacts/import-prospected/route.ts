import { NextRequest, NextResponse } from 'next/server';
// import * as Sentry from '@sentry/nextjs';
import { createServerClient } from '@/lib/supabase-server';
import { getWorkspaceContext } from '@/lib/workspace';
import { getServiceSupabase } from '@/lib/supabase';


interface ProspectedContact {
  first_name: string;
  last_name: string;
  company_name: string;
  job_title: string;
  email: string;
  location: string;
  linkedin_url: string;
  company_domain: string;
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

    const { contacts } = await request.json();
    if (!Array.isArray(contacts) || contacts.length === 0) {
      return NextResponse.json({ error: 'contacts array is required' }, { status: 400 });
    }

    const serviceSupabase = getServiceSupabase();

    const rows = contacts.map((c: ProspectedContact) => ({
      workspace_id: ctx.workspaceId,
      user_id: user.id,
      first_name: c.first_name || '',
      last_name: c.last_name || '',
      email: c.email?.toLowerCase().trim() || null,
      company_name: c.company_name || '',
      job_title: c.job_title || '',
      location: c.location || '',
      linkedin_url: c.linkedin_url || '',
      company_domain: c.company_domain || '',
      status: 'new',
      assigned_to: user.id,
    }));

    const { error: insertError, data } = await serviceSupabase
      .from('contacts')
      .upsert(rows, {
        onConflict: 'workspace_id,email',
        ignoreDuplicates: true,
      })
      .select('id');

    if (insertError) {
      throw insertError;
    }

    return NextResponse.json({ imported: data?.length || 0 });
  } catch (error: any) {
    console.error('Import prospected contacts error:', error);
    // Sentry.captureException(error);
    return NextResponse.json({ error: error.message || 'Import failed' }, { status: 500 });
  }
}
