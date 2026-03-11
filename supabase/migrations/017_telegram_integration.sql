-- Telegram bot integration columns on user_settings
ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS telegram_chat_id BIGINT,
  ADD COLUMN IF NOT EXISTS telegram_link_token TEXT,
  ADD COLUMN IF NOT EXISTS telegram_link_token_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS telegram_connected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS telegram_notifications_enabled BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS telegram_notify_replies BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS telegram_notify_bounces BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS telegram_notify_meetings BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS telegram_notify_digest BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS telegram_pending_action JSONB;

-- Index for webhook lookups by chat_id
CREATE INDEX IF NOT EXISTS idx_user_settings_telegram_chat_id
  ON user_settings (telegram_chat_id)
  WHERE telegram_chat_id IS NOT NULL;
