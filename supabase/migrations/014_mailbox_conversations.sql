-- Migration 014: mailbox conversations, per-user sync state, and email tracking hardening

-- Align emails_sent status values with the application.
ALTER TABLE emails_sent DROP CONSTRAINT IF EXISTS emails_sent_status_check;
ALTER TABLE emails_sent
  ADD CONSTRAINT emails_sent_status_check
  CHECK (status IN ('pending', 'sent', 'failed', 'delivered', 'opened', 'replied', 'bounced'));

-- Scope emails_sent access to the active user's workspaces.
DROP POLICY IF EXISTS "emails_sent_select" ON emails_sent;
DROP POLICY IF EXISTS "emails_sent_insert" ON emails_sent;
DROP POLICY IF EXISTS "emails_sent_update" ON emails_sent;

CREATE POLICY "emails_sent_select" ON emails_sent
  FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT user_workspace_ids()));

CREATE POLICY "emails_sent_insert" ON emails_sent
  FOR INSERT TO authenticated
  WITH CHECK (workspace_id IN (SELECT user_workspace_ids()));

CREATE POLICY "emails_sent_update" ON emails_sent
  FOR UPDATE TO authenticated
  USING (workspace_id IN (SELECT user_workspace_ids()));

CREATE TABLE IF NOT EXISTS mailbox_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  contact_id UUID REFERENCES contacts ON DELETE SET NULL,
  subject TEXT,
  subject_normalized TEXT,
  snippet TEXT,
  unread_count INT DEFAULT 0,
  last_message_at TIMESTAMPTZ DEFAULT now(),
  last_message_direction TEXT CHECK (last_message_direction IN ('inbound', 'outbound')),
  participants JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mailbox_threads_workspace_idx
  ON mailbox_threads(workspace_id, user_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS mailbox_threads_contact_idx
  ON mailbox_threads(contact_id);
CREATE INDEX IF NOT EXISTS mailbox_threads_subject_idx
  ON mailbox_threads(user_id, workspace_id, subject_normalized);

CREATE TABLE IF NOT EXISTS mailbox_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID REFERENCES mailbox_threads ON DELETE CASCADE NOT NULL,
  workspace_id UUID NOT NULL,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  contact_id UUID REFERENCES contacts ON DELETE SET NULL,
  email_sent_id UUID REFERENCES emails_sent ON DELETE SET NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  internet_message_id TEXT NOT NULL,
  in_reply_to TEXT,
  "references" TEXT[] DEFAULT '{}'::text[],
  subject TEXT,
  from_name TEXT,
  from_email TEXT,
  to_emails JSONB DEFAULT '[]'::jsonb,
  cc_emails JSONB DEFAULT '[]'::jsonb,
  bcc_emails JSONB DEFAULT '[]'::jsonb,
  text_body TEXT,
  html_body TEXT,
  snippet TEXT,
  message_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  folder TEXT,
  imap_uid BIGINT,
  is_auto_reply BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS mailbox_messages_user_message_id_idx
  ON mailbox_messages(user_id, internet_message_id);
CREATE UNIQUE INDEX IF NOT EXISTS mailbox_messages_user_folder_uid_idx
  ON mailbox_messages(user_id, folder, imap_uid)
  WHERE folder IS NOT NULL AND imap_uid IS NOT NULL;
CREATE INDEX IF NOT EXISTS mailbox_messages_thread_idx
  ON mailbox_messages(thread_id, message_at ASC);
CREATE INDEX IF NOT EXISTS mailbox_messages_workspace_idx
  ON mailbox_messages(workspace_id, user_id, message_at DESC);
CREATE INDEX IF NOT EXISTS mailbox_messages_email_sent_idx
  ON mailbox_messages(email_sent_id);

ALTER TABLE mailbox_threads
  ADD COLUMN IF NOT EXISTS last_message_id UUID REFERENCES mailbox_messages ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS mailbox_sync_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL UNIQUE,
  folder TEXT NOT NULL DEFAULT 'INBOX',
  uid_validity BIGINT,
  last_seen_uid BIGINT DEFAULT 0,
  last_synced_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mailbox_sync_state_user_idx
  ON mailbox_sync_state(user_id);

ALTER TABLE mailbox_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE mailbox_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE mailbox_sync_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mailbox_threads_select" ON mailbox_threads
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND workspace_id IN (SELECT user_workspace_ids()));

CREATE POLICY "mailbox_threads_insert" ON mailbox_threads
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND workspace_id IN (SELECT user_workspace_ids()));

CREATE POLICY "mailbox_threads_update" ON mailbox_threads
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND workspace_id IN (SELECT user_workspace_ids()));

CREATE POLICY "mailbox_messages_select" ON mailbox_messages
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND workspace_id IN (SELECT user_workspace_ids()));

CREATE POLICY "mailbox_messages_insert" ON mailbox_messages
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND workspace_id IN (SELECT user_workspace_ids()));

CREATE POLICY "mailbox_messages_update" ON mailbox_messages
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND workspace_id IN (SELECT user_workspace_ids()));

CREATE POLICY "mailbox_sync_state_select" ON mailbox_sync_state
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "mailbox_sync_state_insert" ON mailbox_sync_state
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "mailbox_sync_state_update" ON mailbox_sync_state
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());
