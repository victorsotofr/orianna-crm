import { NextResponse } from 'next/server';

import { GtmWorkspaceAccessError, ensureIsimpleGtmWorkspace } from '@/lib/gtm-automation';
import { createServerClient } from '@/lib/supabase-server';

export async function POST() {
  try {
    const { supabase, error: clientError } = await createServerClient();
    if (!supabase || clientError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const workspaceId = await ensureIsimpleGtmWorkspace({
      userId: user.id,
      email: user.email,
      displayName: user.user_metadata?.full_name || user.email?.split('@')[0] || null,
    });

    return NextResponse.json({ workspaceId });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to ensure isimple GTM workspace';
    console.error('Ensure isimple workspace error:', message);
    return NextResponse.json({ error: message }, { status: error instanceof GtmWorkspaceAccessError ? 403 : 500 });
  }
}
