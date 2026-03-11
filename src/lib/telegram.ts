import 'server-only';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const API_BASE = `https://api.telegram.org/bot${BOT_TOKEN}`;

export function isTelegramConfigured(): boolean {
  return !!BOT_TOKEN;
}

async function callApi(method: string, body?: Record<string, unknown>) {
  const res = await fetch(`${API_BASE}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!data.ok) {
    console.error(`Telegram API error (${method}):`, data.description);
  }
  return data;
}

export async function sendMessage(chatId: number | string, text: string, options?: {
  parseMode?: 'HTML' | 'Markdown' | 'MarkdownV2';
  replyMarkup?: Record<string, unknown>;
}) {
  return callApi('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: options?.parseMode ?? 'HTML',
    ...(options?.replyMarkup && { reply_markup: options.replyMarkup }),
  });
}

export async function setWebhook(url: string) {
  return callApi('setWebhook', { url, allowed_updates: ['message', 'callback_query'] });
}

export async function deleteWebhook() {
  return callApi('deleteWebhook');
}

/** Inline keyboard helper */
export function inlineKeyboard(rows: Array<Array<{ text: string; callback_data: string }>>) {
  return { inline_keyboard: rows };
}
