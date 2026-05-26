-- Migration 025: Agentic outreach thread messages and events
-- Persists ChatGPT-style thread history and visible tool/background activity.

ALTER TABLE outreach_sessions
  DROP CONSTRAINT IF EXISTS outreach_sessions_status_check;

ALTER TABLE outreach_sessions
  ADD CONSTRAINT outreach_sessions_status_check
  CHECK (status IN (
    'draft',
    'searching',
    'ready',
    'empty',
    'enriching',
    'sequence_draft',
    'saved',
    'launched',
    'automated',
    'failed'
  ));

CREATE TABLE IF NOT EXISTS outreach_session_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  session_id UUID REFERENCES outreach_sessions ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'tool', 'system')),
  content TEXT NOT NULL DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  status TEXT NOT NULL DEFAULT 'complete' CHECK (status IN ('running', 'complete', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS outreach_session_messages_session_created_idx
  ON outreach_session_messages(session_id, created_at ASC);

CREATE INDEX IF NOT EXISTS outreach_session_messages_workspace_created_idx
  ON outreach_session_messages(workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS outreach_session_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  session_id UUID REFERENCES outreach_sessions ON DELETE CASCADE NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'complete', 'failed')),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS outreach_session_events_session_created_idx
  ON outreach_session_events(session_id, created_at ASC);

CREATE INDEX IF NOT EXISTS outreach_session_events_workspace_status_idx
  ON outreach_session_events(workspace_id, status, created_at DESC);

ALTER TABLE outreach_session_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE outreach_session_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  DROP POLICY IF EXISTS "outreach_session_messages_select" ON outreach_session_messages;
  DROP POLICY IF EXISTS "outreach_session_messages_insert" ON outreach_session_messages;
  DROP POLICY IF EXISTS "outreach_session_messages_update" ON outreach_session_messages;
  DROP POLICY IF EXISTS "outreach_session_events_select" ON outreach_session_events;
  DROP POLICY IF EXISTS "outreach_session_events_insert" ON outreach_session_events;
  DROP POLICY IF EXISTS "outreach_session_events_update" ON outreach_session_events;

  IF to_regprocedure('public.user_workspace_ids()') IS NOT NULL THEN
    EXECUTE 'CREATE POLICY "outreach_session_messages_select" ON outreach_session_messages
      FOR SELECT TO authenticated
      USING (workspace_id IN (SELECT user_workspace_ids()))';
    EXECUTE 'CREATE POLICY "outreach_session_messages_insert" ON outreach_session_messages
      FOR INSERT TO authenticated
      WITH CHECK (workspace_id IN (SELECT user_workspace_ids()))';
    EXECUTE 'CREATE POLICY "outreach_session_messages_update" ON outreach_session_messages
      FOR UPDATE TO authenticated
      USING (workspace_id IN (SELECT user_workspace_ids()))';

    EXECUTE 'CREATE POLICY "outreach_session_events_select" ON outreach_session_events
      FOR SELECT TO authenticated
      USING (workspace_id IN (SELECT user_workspace_ids()))';
    EXECUTE 'CREATE POLICY "outreach_session_events_insert" ON outreach_session_events
      FOR INSERT TO authenticated
      WITH CHECK (workspace_id IN (SELECT user_workspace_ids()))';
    EXECUTE 'CREATE POLICY "outreach_session_events_update" ON outreach_session_events
      FOR UPDATE TO authenticated
      USING (workspace_id IN (SELECT user_workspace_ids()))';
  ELSE
    EXECUTE 'CREATE POLICY "outreach_session_messages_select" ON outreach_session_messages FOR SELECT TO authenticated USING (true)';
    EXECUTE 'CREATE POLICY "outreach_session_messages_insert" ON outreach_session_messages FOR INSERT TO authenticated WITH CHECK (true)';
    EXECUTE 'CREATE POLICY "outreach_session_messages_update" ON outreach_session_messages FOR UPDATE TO authenticated USING (true)';
    EXECUTE 'CREATE POLICY "outreach_session_events_select" ON outreach_session_events FOR SELECT TO authenticated USING (true)';
    EXECUTE 'CREATE POLICY "outreach_session_events_insert" ON outreach_session_events FOR INSERT TO authenticated WITH CHECK (true)';
    EXECUTE 'CREATE POLICY "outreach_session_events_update" ON outreach_session_events FOR UPDATE TO authenticated USING (true)';
  END IF;
END $$;
