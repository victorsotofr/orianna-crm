-- Migration 015: Google Calendar OAuth connection + calendar event tracking

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS google_calendar_refresh_token_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS google_calendar_email TEXT,
  ADD COLUMN IF NOT EXISTS google_calendar_scopes TEXT[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS google_calendar_connected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS google_calendar_default_calendar_id TEXT DEFAULT 'primary',
  ADD COLUMN IF NOT EXISTS google_calendar_default_timezone TEXT,
  ADD COLUMN IF NOT EXISTS google_calendar_last_error TEXT;

CREATE TABLE IF NOT EXISTS calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  workspace_id UUID,
  contact_id UUID REFERENCES contacts ON DELETE SET NULL,
  thread_id UUID REFERENCES mailbox_threads ON DELETE SET NULL,
  google_event_id TEXT NOT NULL,
  calendar_id TEXT NOT NULL DEFAULT 'primary',
  summary TEXT NOT NULL,
  description TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  meet_url TEXT,
  google_event_url TEXT,
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled', 'deleted')),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, google_event_id)
);

CREATE INDEX IF NOT EXISTS calendar_events_user_idx
  ON calendar_events(user_id, starts_at DESC);
CREATE INDEX IF NOT EXISTS calendar_events_workspace_idx
  ON calendar_events(workspace_id, starts_at DESC);
CREATE INDEX IF NOT EXISTS calendar_events_contact_idx
  ON calendar_events(contact_id, starts_at DESC);
CREATE INDEX IF NOT EXISTS calendar_events_thread_idx
  ON calendar_events(thread_id, starts_at DESC);

ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "calendar_events_select" ON calendar_events
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    AND (workspace_id IS NULL OR workspace_id IN (SELECT user_workspace_ids()))
  );

CREATE POLICY "calendar_events_insert" ON calendar_events
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (workspace_id IS NULL OR workspace_id IN (SELECT user_workspace_ids()))
  );

CREATE POLICY "calendar_events_update" ON calendar_events
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    AND (workspace_id IS NULL OR workspace_id IN (SELECT user_workspace_ids()))
  );
