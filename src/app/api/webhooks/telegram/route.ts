import { NextRequest, NextResponse } from 'next/server';

import { getServiceSupabase } from '@/lib/supabase';
import { sendMessage, isTelegramConfigured, inlineKeyboard } from '@/lib/telegram';

export const dynamic = 'force-dynamic';

/**
 * Telegram Bot webhook receiver.
 * Handles /start <token> for account linking and command routing.
 */
export async function POST(request: NextRequest) {
  if (!isTelegramConfigured()) {
    return NextResponse.json({ ok: false }, { status: 503 });
  }

  try {
    const update = await request.json();

    // Handle callback queries (inline button presses)
    if (update.callback_query) {
      await handleCallbackQuery(update.callback_query);
      return NextResponse.json({ ok: true });
    }

    const message = update.message;
    if (!message?.text) {
      return NextResponse.json({ ok: true });
    }

    const chatId = message.chat.id;
    const text = message.text.trim();

    // Route commands
    if (text.startsWith('/start ')) {
      await handleStart(chatId, text.slice(7).trim());
    } else if (text === '/start' || text === '/help') {
      await handleHelp(chatId);
    } else if (text === '/status') {
      await handleStatus(chatId);
    } else if (text === '/contacts') {
      await handleContacts(chatId);
    } else if (text === '/hot') {
      await handleHotLeads(chatId);
    } else if (text === '/digest') {
      await handleDigest(chatId);
    } else if (text === '/disconnect') {
      await handleDisconnect(chatId);
    } else {
      // Check for pending action
      await handlePendingOrUnknown(chatId, text);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Telegram webhook error:', err);
    return NextResponse.json({ ok: true }); // Always 200 to avoid retries
  }
}

// ─── Helpers ────────────────────────────────────────────

async function getUserByChatId(chatId: number) {
  const supabase = getServiceSupabase();
  const { data } = await supabase
    .from('user_settings')
    .select('user_id, telegram_pending_action')
    .eq('telegram_chat_id', chatId)
    .single();
  return data;
}

async function getWorkspaceForUser(userId: string) {
  const supabase = getServiceSupabase();
  const { data } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', userId)
    .limit(1)
    .single();
  return data?.workspace_id ?? null;
}

// ─── Command Handlers ───────────────────────────────────

async function handleStart(chatId: number, token: string) {
  const supabase = getServiceSupabase();

  // Find user with this link token that hasn't expired
  const { data: settings } = await supabase
    .from('user_settings')
    .select('user_id, telegram_link_token_expires_at')
    .eq('telegram_link_token', token)
    .single();

  if (!settings) {
    await sendMessage(chatId, 'Invalid or expired link code. Please generate a new one from Settings > Integrations in Orianna.');
    return;
  }

  const expiresAt = settings.telegram_link_token_expires_at;
  if (expiresAt && new Date(expiresAt) < new Date()) {
    await sendMessage(chatId, 'This link code has expired. Please generate a new one from Settings.');
    return;
  }

  // Link the account
  await supabase
    .from('user_settings')
    .update({
      telegram_chat_id: chatId,
      telegram_connected_at: new Date().toISOString(),
      telegram_link_token: null,
      telegram_link_token_expires_at: null,
      telegram_notifications_enabled: true,
    })
    .eq('user_id', settings.user_id);

  await sendMessage(chatId, [
    '<b>Account linked successfully!</b>',
    '',
    "You'll now receive notifications for replies, bounces, and meetings.",
    '',
    'Available commands:',
    '/contacts — Recent contacts',
    '/hot — Hot leads',
    '/digest — Daily summary',
    '/status — Connection status',
    '/disconnect — Unlink account',
    '/help — Show commands',
  ].join('\n'));
}

async function handleHelp(chatId: number) {
  await sendMessage(chatId, [
    '<b>Orianna CRM Bot</b>',
    '',
    '/contacts — View recent contacts',
    '/hot — View hot leads',
    '/digest — Daily summary',
    '/status — Connection status',
    '/disconnect — Unlink this account',
    '/help — Show this message',
  ].join('\n'));
}

async function handleStatus(chatId: number) {
  const user = await getUserByChatId(chatId);
  if (!user) {
    await sendMessage(chatId, 'Not connected. Use the link code from Settings to connect.');
    return;
  }

  const supabase = getServiceSupabase();
  const { data: settings } = await supabase
    .from('user_settings')
    .select('telegram_connected_at, telegram_notifications_enabled, telegram_notify_replies, telegram_notify_bounces, telegram_notify_meetings')
    .eq('user_id', user.user_id)
    .single();

  if (!settings) {
    await sendMessage(chatId, 'Connected but settings not found.');
    return;
  }

  const on = (v: boolean | null) => v !== false ? 'ON' : 'OFF';
  await sendMessage(chatId, [
    '<b>Connection Status</b>',
    '',
    `Connected since: ${settings.telegram_connected_at ? new Date(settings.telegram_connected_at).toLocaleDateString() : 'Unknown'}`,
    `Notifications: ${on(settings.telegram_notifications_enabled)}`,
    `  Replies: ${on(settings.telegram_notify_replies)}`,
    `  Bounces: ${on(settings.telegram_notify_bounces)}`,
    `  Meetings: ${on(settings.telegram_notify_meetings)}`,
  ].join('\n'));
}

async function handleContacts(chatId: number) {
  const user = await getUserByChatId(chatId);
  if (!user) { await sendMessage(chatId, 'Not connected.'); return; }

  const wsId = await getWorkspaceForUser(user.user_id);
  if (!wsId) { await sendMessage(chatId, 'No workspace found.'); return; }

  const supabase = getServiceSupabase();
  const { data: contacts } = await supabase
    .from('contacts')
    .select('first_name, last_name, company_name, status, email')
    .eq('workspace_id', wsId)
    .order('created_at', { ascending: false })
    .limit(10);

  if (!contacts?.length) {
    await sendMessage(chatId, 'No contacts found.');
    return;
  }

  const lines = contacts.map((c, i) => {
    const name = [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Unknown';
    const company = c.company_name ? ` @ ${c.company_name}` : '';
    return `${i + 1}. <b>${escapeHtml(name)}</b>${escapeHtml(company)}\n   ${c.status || 'new'} · ${c.email || 'no email'}`;
  });

  await sendMessage(chatId, `<b>Recent Contacts (${contacts.length})</b>\n\n${lines.join('\n\n')}`);
}

async function handleHotLeads(chatId: number) {
  const user = await getUserByChatId(chatId);
  if (!user) { await sendMessage(chatId, 'Not connected.'); return; }

  const wsId = await getWorkspaceForUser(user.user_id);
  if (!wsId) { await sendMessage(chatId, 'No workspace found.'); return; }

  const supabase = getServiceSupabase();
  const { data: contacts } = await supabase
    .from('contacts')
    .select('first_name, last_name, company_name, ai_score, email, status')
    .eq('workspace_id', wsId)
    .eq('ai_score_label', 'HOT')
    .order('ai_score', { ascending: false })
    .limit(10);

  if (!contacts?.length) {
    await sendMessage(chatId, 'No hot leads found. Score your contacts first!');
    return;
  }

  const lines = contacts.map((c, i) => {
    const name = [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Unknown';
    return `${i + 1}. <b>${escapeHtml(name)}</b> — ${c.ai_score}/100\n   ${c.company_name || ''} · ${c.status || 'new'}`;
  });

  await sendMessage(chatId, `<b>Hot Leads (${contacts.length})</b>\n\n${lines.join('\n\n')}`);
}

async function handleDigest(chatId: number) {
  const user = await getUserByChatId(chatId);
  if (!user) { await sendMessage(chatId, 'Not connected.'); return; }

  const wsId = await getWorkspaceForUser(user.user_id);
  if (!wsId) { await sendMessage(chatId, 'No workspace found.'); return; }

  const supabase = getServiceSupabase();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayISO = today.toISOString();

  // Parallel queries
  const [sentResult, repliesResult, hotResult, contactsResult] = await Promise.all([
    supabase.from('emails_sent').select('id', { count: 'exact', head: true })
      .eq('workspace_id', wsId).gte('sent_at', todayISO).eq('status', 'sent'),
    supabase.from('email_stats').select('id', { count: 'exact', head: true })
      .eq('workspace_id', wsId).eq('event_type', 'reply').gte('created_at', todayISO),
    supabase.from('contacts').select('id', { count: 'exact', head: true })
      .eq('workspace_id', wsId).eq('ai_score_label', 'HOT'),
    supabase.from('contacts').select('id', { count: 'exact', head: true })
      .eq('workspace_id', wsId),
  ]);

  await sendMessage(chatId, [
    '<b>Daily Digest</b>',
    '',
    `Emails sent today: ${sentResult.count ?? 0}`,
    `Replies today: ${repliesResult.count ?? 0}`,
    `Hot leads: ${hotResult.count ?? 0}`,
    `Total contacts: ${contactsResult.count ?? 0}`,
  ].join('\n'));
}

async function handleDisconnect(chatId: number) {
  const user = await getUserByChatId(chatId);
  if (!user) { await sendMessage(chatId, 'Not connected.'); return; }

  await sendMessage(chatId, 'Disconnect from Orianna CRM?', {
    replyMarkup: inlineKeyboard([[
      { text: 'Yes, disconnect', callback_data: 'disconnect_confirm' },
      { text: 'Cancel', callback_data: 'disconnect_cancel' },
    ]]),
  });
}

async function handleCallbackQuery(query: { id: string; message?: { chat: { id: number } }; data?: string }) {
  const chatId = query.message?.chat?.id;
  if (!chatId || !query.data) return;

  if (query.data === 'disconnect_confirm') {
    const supabase = getServiceSupabase();
    await supabase
      .from('user_settings')
      .update({
        telegram_chat_id: null,
        telegram_connected_at: null,
        telegram_notifications_enabled: true,
        telegram_pending_action: null,
      })
      .eq('telegram_chat_id', chatId);

    await sendMessage(chatId, 'Disconnected from Orianna CRM. You can reconnect anytime from Settings.');
  } else if (query.data === 'disconnect_cancel') {
    await sendMessage(chatId, 'Disconnect cancelled.');
  }
}

async function handlePendingOrUnknown(chatId: number, text: string) {
  const user = await getUserByChatId(chatId);
  if (!user) {
    await sendMessage(chatId, 'Not connected. Use the link code from Settings to connect.\nType /help for available commands.');
    return;
  }

  // If there's a pending action, handle it
  if (user.telegram_pending_action) {
    const supabase = getServiceSupabase();
    // Clear pending action
    await supabase
      .from('user_settings')
      .update({ telegram_pending_action: null })
      .eq('user_id', user.user_id);

    // For now, just acknowledge
    await sendMessage(chatId, 'Action cancelled. Type /help for available commands.');
    return;
  }

  await sendMessage(chatId, "I didn't understand that. Type /help for available commands.");
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
