import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

export async function POST(request: Request) {
  try {
    // Get authenticated Supabase client
    const { supabase, error: clientError } = await createServerClient();

    if (clientError || !supabase) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { name, templateId, templateVariables, totalContacts } = body;

    if (!name || !templateId) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    // Get template to determine industry
    const { data: template } = await supabase
      .from('templates')
      .select('industry')
      .eq('id', templateId)
      .single();

    // Create campaign with audit trail
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .insert({
        name,
        template_id: templateId,
        template_variables: templateVariables,
        industry: template?.industry,
        total_contacts: totalContacts,
        status: 'sending',
        // Audit trail: track who created this campaign
        created_by: user.id,
        created_by_email: user.email,
      })
      .select()
      .single();

    if (campaignError) {
      throw campaignError;
    }

    return NextResponse.json({
      success: true,
      campaignId: campaign.id,
    });
  } catch (error: any) {
    console.error('Campaign creation error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create campaign' },
      { status: 500 }
    );
  }
}

