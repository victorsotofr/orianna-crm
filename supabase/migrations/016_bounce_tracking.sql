-- Add bounce tracking columns to contacts
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS email_bounced BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS bounce_reason TEXT,
  ADD COLUMN IF NOT EXISTS bounced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS original_email TEXT,
  ADD COLUMN IF NOT EXISTS email_recovery_attempted BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS email_recovery_count INTEGER DEFAULT 0;

-- Index for filtering bounced contacts
CREATE INDEX IF NOT EXISTS contacts_email_bounced_idx
  ON contacts(workspace_id, email_bounced)
  WHERE email_bounced = TRUE;

COMMENT ON COLUMN contacts.email_bounced IS 'True if email address bounced (invalid/non-existent)';
COMMENT ON COLUMN contacts.bounce_reason IS 'Reason from bounce message (e.g., user unknown, mailbox unavailable)';
COMMENT ON COLUMN contacts.bounced_at IS 'When the bounce was detected';
COMMENT ON COLUMN contacts.original_email IS 'The original email that bounced (before recovery replaced it)';
COMMENT ON COLUMN contacts.email_recovery_attempted IS 'Whether we tried to find a new email for this contact';
COMMENT ON COLUMN contacts.email_recovery_count IS 'How many times we tried email recovery';
