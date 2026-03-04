import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { getWorkspaceContext } from '@/lib/workspace';
import { getServiceSupabase } from '@/lib/supabase';

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

    const serviceSupabase = getServiceSupabase();
    const { data: workspace } = await serviceSupabase
      .from('workspaces')
      .select('ai_personalization_prompt, ai_scoring_prompt, linkup_company_query, linkup_contact_query, linkup_prospecting_query, ai_company_description, ai_target_industry, ai_target_roles, ai_geographic_focus')
      .eq('id', ctx.workspaceId)
      .single();

    return NextResponse.json({
      aiPersonalizationPrompt: workspace?.ai_personalization_prompt || null,
      aiScoringPrompt: workspace?.ai_scoring_prompt || null,
      linkupCompanyQuery: workspace?.linkup_company_query || null,
      linkupContactQuery: workspace?.linkup_contact_query || null,
      linkupProspectingQuery: workspace?.linkup_prospecting_query || null,
      aiCompanyDescription: workspace?.ai_company_description || null,
      aiTargetIndustry: workspace?.ai_target_industry || null,
      aiTargetRoles: workspace?.ai_target_roles || null,
      aiGeographicFocus: workspace?.ai_geographic_focus || null,
    });
  } catch (error: any) {
    console.error('Workspace settings GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch workspace settings' }, { status: 500 });
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

    const {
      aiPersonalizationPrompt, aiScoringPrompt, linkupCompanyQuery, linkupContactQuery, linkupProspectingQuery,
      aiCompanyDescription, aiTargetIndustry, aiTargetRoles, aiGeographicFocus,
    } = await request.json();

    const serviceSupabase = getServiceSupabase();
    const update: Record<string, string | null> = {};

    // AI prompt fields — empty string resets to default (null)
    if (aiPersonalizationPrompt !== undefined) {
      update.ai_personalization_prompt = aiPersonalizationPrompt?.trim() || null;
    }
    if (aiScoringPrompt !== undefined) {
      update.ai_scoring_prompt = aiScoringPrompt?.trim() || null;
    }
    if (linkupCompanyQuery !== undefined) {
      update.linkup_company_query = linkupCompanyQuery?.trim() || null;
    }
    if (linkupContactQuery !== undefined) {
      update.linkup_contact_query = linkupContactQuery?.trim() || null;
    }
    if (linkupProspectingQuery !== undefined) {
      update.linkup_prospecting_query = linkupProspectingQuery?.trim() || null;
    }
    // Business context fields — empty string → null
    if (aiCompanyDescription !== undefined) {
      update.ai_company_description = aiCompanyDescription?.trim() || null;
    }
    if (aiTargetIndustry !== undefined) {
      update.ai_target_industry = aiTargetIndustry?.trim() || null;
    }
    if (aiTargetRoles !== undefined) {
      update.ai_target_roles = aiTargetRoles?.trim() || null;
    }
    if (aiGeographicFocus !== undefined) {
      update.ai_geographic_focus = aiGeographicFocus?.trim() || null;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const { error: updateError } = await serviceSupabase
      .from('workspaces')
      .update(update)
      .eq('id', ctx.workspaceId);

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Workspace settings POST error:', error);
    return NextResponse.json({ error: error.message || 'Failed to save workspace settings' }, { status: 500 });
  }
}
