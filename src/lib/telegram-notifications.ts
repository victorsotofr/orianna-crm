import 'server-only';

import { getServiceSupabase } from './supabase';
import { sendMessage, isTelegramConfigured } from './telegram';

interface NotifyOptions {
  userId: string;
  type: 'reply' | 'bounce' | 'meeting';
}

/**
 * Get the Telegram chat ID for a user if they have notifications enabled for this type.
 * Returns null if notifications are disabled or not configured.
 */
async function getChatId(opts: NotifyOptions): Promise<number | null> {
  if (!isTelegramConfigured()) return null;

  const supabase = getServiceSupabase();
  const { data } = await supabase
    .from('user_settings')
    .select('telegram_chat_id, telegram_notifications_enabled, telegram_notify_replies, telegram_notify_bounces, telegram_notify_meetings')
    .eq('user_id', opts.userId)
    .single();

  if (!data?.telegram_chat_id || !data.telegram_notifications_enabled) return null;

  const typeMap: Record<string, boolean | null> = {
    reply: data.telegram_notify_replies,
    bounce: data.telegram_notify_bounces,
    meeting: data.telegram_notify_meetings,
  };

  if (typeMap[opts.type] === false) return null;
  return data.telegram_chat_id;
}

/**
 * Notify user about a new email reply. Fire-and-forget.
 */
export async function notifyReply(userId: string, contactName: string, subject: string, preview: string) {
  try {
    const chatId = await getChatId({ userId, type: 'reply' });
    if (!chatId) return;

    const text = [
      `<b>New reply from ${escapeHtml(contactName)}</b>`,
      `<i>${escapeHtml(subject)}</i>`,
      '',
      escapeHtml(preview.slice(0, 200)),
    ].join('\n');

    await sendMessage(chatId, text);
  } catch (err) {
    console.error('Telegram notifyReply error:', err);
  }
}

/**
 * Notify user about an email bounce. Fire-and-forget.
 */
export async function notifyBounce(userId: string, contactName: string, email: string, reason: string) {
  try {
    const chatId = await getChatId({ userId, type: 'bounce' });
    if (!chatId) return;

    const text = [
      `<b>Email bounced for ${escapeHtml(contactName)}</b>`,
      `${escapeHtml(email)}`,
      '',
      `Reason: ${escapeHtml(reason.slice(0, 150))}`,
    ].join('\n');

    await sendMessage(chatId, text);
  } catch (err) {
    console.error('Telegram notifyBounce error:', err);
  }
}

/**
 * Notify user about a meeting-related message. Fire-and-forget.
 */
export async function notifyMeeting(userId: string, contactName: string, summary: string) {
  try {
    const chatId = await getChatId({ userId, type: 'meeting' });
    if (!chatId) return;

    const text = [
      `<b>Meeting update — ${escapeHtml(contactName)}</b>`,
      '',
      escapeHtml(summary.slice(0, 300)),
    ].join('\n');

    await sendMessage(chatId, text);
  } catch (err) {
    console.error('Telegram notifyMeeting error:', err);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
