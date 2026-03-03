import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { getServiceSupabase } from '@/lib/supabase';
import { encrypt } from '@/lib/encryption';

export async function GET() {
  try {
    const { supabase, error: clientError } = await createServerClient();
    if (!supabase || clientError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const serviceSupabase = getServiceSupabase();
    const { data: settings } = await serviceSupabase
      .from('user_settings')
      .select('fullenrich_api_key_encrypted, linkup_api_key_encrypted')
      .eq('user_id', user.id)
      .single();

    return NextResponse.json({
      fullenrichConfigured: !!settings?.fullenrich_api_key_encrypted,
      linkupConfigured: !!settings?.linkup_api_key_encrypted,
    });
  } catch (error: any) {
    console.error('Integrations GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch integrations' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, error: clientError } = await createServerClient();
    if (!supabase || clientError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { fullenrichApiKey, linkupApiKey } = await request.json();

    const update: Record<string, string | null> = {};
    if (fullenrichApiKey !== undefined) {
      update.fullenrich_api_key_encrypted = fullenrichApiKey ? encrypt(fullenrichApiKey) : null;
    }
    if (linkupApiKey !== undefined) {
      update.linkup_api_key_encrypted = linkupApiKey ? encrypt(linkupApiKey) : null;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const serviceSupabase = getServiceSupabase();

    // Upsert: create user_settings row if it doesn't exist
    const { data: existing } = await serviceSupabase
      .from('user_settings')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (existing) {
      const { error: updateError } = await serviceSupabase
        .from('user_settings')
        .update(update)
        .eq('user_id', user.id);
      if (updateError) throw updateError;
    } else {
      const { error: insertError } = await serviceSupabase
        .from('user_settings')
        .insert({ user_id: user.id, user_email: user.email, ...update });
      if (insertError) throw insertError;
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Integrations POST error:', error);
    return NextResponse.json({ error: error.message || 'Failed to save integrations' }, { status: 500 });
  }
}
