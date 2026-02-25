-- Migration 002: Extend contacts table with CRM fields
-- Adds status tracking, assignment, phone, notes, and activity timestamps

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'replied', 'qualified', 'unqualified', 'do_not_contact'));
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES auth.users;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_contacted_at TIMESTAMPTZ;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS replied_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS contacts_status_idx ON contacts(status);
CREATE INDEX IF NOT EXISTS contacts_assigned_to_idx ON contacts(assigned_to);
CREATE UNIQUE INDEX IF NOT EXISTS contacts_email_unique ON contacts(LOWER(email));
