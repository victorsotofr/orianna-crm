import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

import { createServerClient } from '@/lib/supabase-server';
import { getServiceSupabase } from '@/lib/supabase';
import { isTelegramConfigured } from '@/lib/telegram';

export const dynamic = 'force-dynamic';

/**
 * GET — Fetch Telegram connection status & notification preferences
 */
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
      .select('telegram_chat_id, telegram_connected_at, telegram_notifications_enabled, telegram_notify_replies, telegram_notify_bounces, telegram_notify_meetings, telegram_notify_digest, telegram_link_token, telegram_link_token_expires_at')
      .eq('user_id', user.id)
      .single();

    const connected = !!settings?.telegram_chat_id;
    // Check if there's a valid pending link token
    let pendingToken: string | null = null;
    if (settings?.telegram_link_token && settings.telegram_link_token_expires_at) {
      if (new Date(settings.telegram_link_token_expires_at) > new Date()) {
        pendingToken = settings.telegram_link_token;
      }
    }

    return NextResponse.json({
      available: isTelegramConfigured(),
      connected,
      connectedAt: settings?.telegram_connected_at ?? null,
      pendingToken,
      notifications: {
        enabled: settings?.telegram_notifications_enabled ?? true,
        replies: settings?.telegram_notify_replies ?? true,
        bounces: settings?.telegram_notify_bounces ?? true,
        meetings: settings?.telegram_notify_meetings ?? true,
        digest: settings?.telegram_notify_digest ?? false,
      },
    });
  } catch (error) {
    console.error('Telegram settings GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch Telegram settings' }, { status: 500 });
  }
}

/**
 * POST — Generate link token or update notification preferences
 */
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

    const body = await request.json();
    const serviceSupabase = getServiceSupabase();

    // Generate link token
    if (body.action === 'generate_token') {
      if (!isTelegramConfigured()) {
        return NextResponse.json({ error: 'Telegram bot not configured on this server' }, { status: 400 });
      }

      const token = crypto.randomBytes(16).toString('hex');
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes

      await serviceSupabase
        .from('user_settings')
        .update({
          telegram_link_token: token,
          telegram_link_token_expires_at: expiresAt,
        })
        .eq('user_id', user.id);

      return NextResponse.json({ token, expiresAt });
    }

    // Update notification preferences
    if (body.action === 'update_notifications') {
      const updates: Record<string, boolean> = {};
      if (typeof body.enabled === 'boolean') updates.telegram_notifications_enabled = body.enabled;
      if (typeof body.replies === 'boolean') updates.telegram_notify_replies = body.replies;
      if (typeof body.bounces === 'boolean') updates.telegram_notify_bounces = body.bounces;
      if (typeof body.meetings === 'boolean') updates.telegram_notify_meetings = body.meetings;
      if (typeof body.digest === 'boolean') updates.telegram_notify_digest = body.digest;

      if (Object.keys(updates).length > 0) {
        await serviceSupabase
          .from('user_settings')
          .update(updates)
          .eq('user_id', user.id);
      }

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Telegram settings POST error:', error);
    return NextResponse.json({ error: 'Failed to update Telegram settings' }, { status: 500 });
  }
}

/**
 * DELETE — Disconnect Telegram
 */
export async function DELETE() {
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
    await serviceSupabase
      .from('user_settings')
      .update({
        telegram_chat_id: null,
        telegram_connected_at: null,
        telegram_link_token: null,
        telegram_link_token_expires_at: null,
        telegram_pending_action: null,
      })
      .eq('user_id', user.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Telegram settings DELETE error:', error);
    return NextResponse.json({ error: 'Failed to disconnect Telegram' }, { status: 500 });
  }
}
