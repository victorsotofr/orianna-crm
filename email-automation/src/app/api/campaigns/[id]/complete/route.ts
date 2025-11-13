import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
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
    const { sentCount, failedCount } = body;
    const params = await context.params;
    const campaignId = params.id;

    // Update campaign status (shared data - no user_id filter)
    const { error: updateError } = await supabase
      .from('campaigns')
      .update({
        status: 'completed',
        sent_count: sentCount,
        failed_count: failedCount,
      })
      .eq('id', campaignId);

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Campaign completion error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to complete campaign' },
      { status: 500 }
    );
  }
}

