-- Persist the workspace that Telegram commands should operate on.
-- This keeps the bot multi-workspace without coupling it to browser localStorage.

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS telegram_active_workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_user_settings_telegram_active_workspace_id
  ON user_settings (telegram_active_workspace_id)
  WHERE telegram_active_workspace_id IS NOT NULL;
