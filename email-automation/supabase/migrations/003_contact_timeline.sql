-- Migration 003: Contact Timeline table
-- Tracks all events/activities related to a contact

CREATE TABLE IF NOT EXISTS contact_timeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID REFERENCES contacts ON DELETE CASCADE NOT NULL,
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  metadata JSONB DEFAULT '{}',
  created_by UUID REFERENCES auth.users,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS timeline_contact_idx ON contact_timeline(contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS timeline_event_type_idx ON contact_timeline(event_type);
