-- Migration 022: multi-mailbox accounts and prospect email aliases
-- Adds provider-neutral mail account storage while preserving legacy user_settings SMTP/IMAP.

CREATE TABLE IF NOT EXISTS mail_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('imap', 'gmail', 'outlook')),
  email TEXT NOT NULL,
  display_name TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'error')),
  sync_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  send_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  is_default_send BOOLEAN NOT NULL DEFAULT FALSE,
  provider_account_id TEXT,
  oauth_refresh_token_encrypted TEXT,
  oauth_scopes TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  oauth_expires_at TIMESTAMPTZ,
  smtp_host TEXT,
  smtp_port INT,
  smtp_user TEXT,
  smtp_password_encrypted TEXT,
  imap_host TEXT,
  imap_port INT,
  imap_user TEXT,
  imap_password_encrypted TEXT,
  bcc_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_synced_at TIMESTAMPTZ,
  last_error TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS mail_accounts_user_provider_email_idx
  ON mail_accounts(user_id, provider, LOWER(email));

CREATE UNIQUE INDEX IF NOT EXISTS mail_accounts_default_send_user_idx
  ON mail_accounts(user_id)
  WHERE is_default_send = TRUE;

CREATE INDEX IF NOT EXISTS mail_accounts_user_idx
  ON mail_accounts(user_id, status, provider);

CREATE TABLE IF NOT EXISTS mail_account_sync_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mail_account_id UUID REFERENCES mail_accounts ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  folder TEXT NOT NULL DEFAULT 'INBOX',
  provider_cursor TEXT,
  uid_validity BIGINT,
  last_seen_uid BIGINT DEFAULT 0,
  history_id TEXT,
  delta_link TEXT,
  webhook_subscription_id TEXT,
  webhook_resource TEXT,
  webhook_expires_at TIMESTAMPTZ,
  last_synced_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(mail_account_id, folder)
);

CREATE INDEX IF NOT EXISTS mail_account_sync_state_user_idx
  ON mail_account_sync_state(user_id);

CREATE TABLE IF NOT EXISTS contact_email_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  contact_id UUID REFERENCES contacts ON DELETE CASCADE NOT NULL,
  email TEXT NOT NULL,
  normalized_email TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'primary' CHECK (kind IN ('primary', 'alias', 'reply_to', 'discovered')),
  confidence NUMERIC,
  source TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS contact_email_addresses_workspace_email_idx
  ON contact_email_addresses(workspace_id, normalized_email);

CREATE INDEX IF NOT EXISTS contact_email_addresses_contact_idx
  ON contact_email_addresses(contact_id);

ALTER TABLE mailbox_threads
  ADD COLUMN IF NOT EXISTS mail_account_id UUID REFERENCES mail_accounts ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS provider_thread_id TEXT;

ALTER TABLE mailbox_messages
  ADD COLUMN IF NOT EXISTS mail_account_id UUID REFERENCES mail_accounts ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS provider TEXT,
  ADD COLUMN IF NOT EXISTS provider_message_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_thread_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_label_ids TEXT[] DEFAULT '{}'::TEXT[];

ALTER TABLE emails_sent
  ADD COLUMN IF NOT EXISTS mail_account_id UUID REFERENCES mail_accounts ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS provider TEXT,
  ADD COLUMN IF NOT EXISTS provider_message_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_thread_id TEXT,
  ADD COLUMN IF NOT EXISTS sent_from_email TEXT;

CREATE INDEX IF NOT EXISTS mailbox_threads_mail_account_idx
  ON mailbox_threads(mail_account_id, last_message_at DESC);

CREATE INDEX IF NOT EXISTS mailbox_messages_mail_account_idx
  ON mailbox_messages(mail_account_id, message_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS mailbox_messages_user_provider_message_idx
  ON mailbox_messages(user_id, provider, provider_message_id)
  WHERE provider IS NOT NULL AND provider_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS emails_sent_mail_account_idx
  ON emails_sent(mail_account_id, sent_at DESC);

ALTER TABLE mail_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE mail_account_sync_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_email_addresses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mail_accounts_select" ON mail_accounts;
DROP POLICY IF EXISTS "mail_accounts_insert" ON mail_accounts;
DROP POLICY IF EXISTS "mail_accounts_update" ON mail_accounts;
DROP POLICY IF EXISTS "mail_accounts_delete" ON mail_accounts;

CREATE POLICY "mail_accounts_select" ON mail_accounts
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "mail_accounts_insert" ON mail_accounts
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "mail_accounts_update" ON mail_accounts
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "mail_accounts_delete" ON mail_accounts
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "mail_account_sync_state_select" ON mail_account_sync_state;
DROP POLICY IF EXISTS "mail_account_sync_state_insert" ON mail_account_sync_state;
DROP POLICY IF EXISTS "mail_account_sync_state_update" ON mail_account_sync_state;

CREATE POLICY "mail_account_sync_state_select" ON mail_account_sync_state
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "mail_account_sync_state_insert" ON mail_account_sync_state
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "mail_account_sync_state_update" ON mail_account_sync_state
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "contact_email_addresses_select" ON contact_email_addresses;
DROP POLICY IF EXISTS "contact_email_addresses_insert" ON contact_email_addresses;
DROP POLICY IF EXISTS "contact_email_addresses_update" ON contact_email_addresses;
DROP POLICY IF EXISTS "contact_email_addresses_delete" ON contact_email_addresses;

CREATE POLICY "contact_email_addresses_select" ON contact_email_addresses
  FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT user_workspace_ids()));

CREATE POLICY "contact_email_addresses_insert" ON contact_email_addresses
  FOR INSERT TO authenticated
  WITH CHECK (workspace_id IN (SELECT user_workspace_ids()));

CREATE POLICY "contact_email_addresses_update" ON contact_email_addresses
  FOR UPDATE TO authenticated
  USING (workspace_id IN (SELECT user_workspace_ids()));

CREATE POLICY "contact_email_addresses_delete" ON contact_email_addresses
  FOR DELETE TO authenticated
  USING (workspace_id IN (SELECT user_workspace_ids()));

-- Seed primary contact email aliases for existing contacts.
INSERT INTO contact_email_addresses (workspace_id, contact_id, email, normalized_email, kind, source)
SELECT c.workspace_id, c.id, c.email, LOWER(c.email), 'primary', 'contacts.email'
FROM contacts c
WHERE c.workspace_id IS NOT NULL
  AND c.email IS NOT NULL
ON CONFLICT DO NOTHING;

-- Seed one legacy IMAP/SMTP mail account per configured user.
INSERT INTO mail_accounts (
  user_id,
  email,
  display_name,
  provider,
  smtp_host,
  smtp_port,
  smtp_user,
  smtp_password_encrypted,
  imap_host,
  imap_port,
  imap_user,
  imap_password_encrypted,
  bcc_enabled,
  is_default_send,
  metadata
)
SELECT
  us.user_id,
  COALESCE(NULLIF(us.smtp_user, ''), NULLIF(us.imap_user, ''), NULLIF(us.user_email, '')),
  us.user_email,
  'imap',
  us.smtp_host,
  us.smtp_port,
  us.smtp_user,
  us.smtp_password_encrypted,
  us.imap_host,
  us.imap_port,
  us.imap_user,
  us.imap_password_encrypted,
  COALESCE(us.bcc_enabled, TRUE),
  TRUE,
  '{"seeded_from":"user_settings"}'::JSONB
FROM user_settings us
WHERE COALESCE(NULLIF(us.smtp_user, ''), NULLIF(us.imap_user, ''), NULLIF(us.user_email, '')) IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM mail_accounts ma
    WHERE ma.user_id = us.user_id
      AND ma.provider = 'imap'
      AND LOWER(ma.email) = LOWER(COALESCE(NULLIF(us.smtp_user, ''), NULLIF(us.imap_user, ''), NULLIF(us.user_email, '')))
  );
