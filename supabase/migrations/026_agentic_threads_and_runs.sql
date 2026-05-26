-- Migration 026: Agentic thread CRUD and graph run persistence
-- Adds soft-managed thread metadata plus durable run/tool-call tracking.

ALTER TABLE outreach_sessions
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS duplicated_from_session_id UUID REFERENCES outreach_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::JSONB;

UPDATE outreach_sessions
SET
  title = COALESCE(NULLIF(title, ''), LEFT(prompt, 120)),
  last_message_at = COALESCE(last_message_at, updated_at, created_at)
WHERE title IS NULL OR last_message_at IS NULL;

CREATE INDEX IF NOT EXISTS outreach_sessions_workspace_last_message_idx
  ON outreach_sessions(workspace_id, last_message_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS outreach_sessions_workspace_archived_idx
  ON outreach_sessions(workspace_id, archived_at DESC)
  WHERE archived_at IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS outreach_agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  session_id UUID REFERENCES outreach_sessions ON DELETE CASCADE NOT NULL,
  user_id UUID,
  provider TEXT NOT NULL DEFAULT 'langgraph',
  model_provider TEXT,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'waiting_confirmation', 'complete', 'failed', 'cancelled')),
  input JSONB NOT NULL DEFAULT '{}'::JSONB,
  output JSONB NOT NULL DEFAULT '{}'::JSONB,
  error TEXT,
  trace_id TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS outreach_agent_runs_session_created_idx
  ON outreach_agent_runs(session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS outreach_agent_runs_workspace_status_idx
  ON outreach_agent_runs(workspace_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS outreach_agent_tool_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  session_id UUID REFERENCES outreach_sessions ON DELETE CASCADE NOT NULL,
  run_id UUID REFERENCES outreach_agent_runs ON DELETE CASCADE,
  tool_name TEXT NOT NULL,
  specialist TEXT,
  permission TEXT NOT NULL DEFAULT 'read',
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('pending_confirmation', 'running', 'complete', 'failed', 'cancelled')),
  input JSONB NOT NULL DEFAULT '{}'::JSONB,
  output JSONB NOT NULL DEFAULT '{}'::JSONB,
  error TEXT,
  confirmation_required BOOLEAN NOT NULL DEFAULT false,
  confirmed_at TIMESTAMPTZ,
  confirmed_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS outreach_agent_tool_calls_run_created_idx
  ON outreach_agent_tool_calls(run_id, created_at ASC);

CREATE INDEX IF NOT EXISTS outreach_agent_tool_calls_session_status_idx
  ON outreach_agent_tool_calls(session_id, status, created_at DESC);

ALTER TABLE outreach_agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE outreach_agent_tool_calls ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  DROP POLICY IF EXISTS "outreach_agent_runs_select" ON outreach_agent_runs;
  DROP POLICY IF EXISTS "outreach_agent_runs_insert" ON outreach_agent_runs;
  DROP POLICY IF EXISTS "outreach_agent_runs_update" ON outreach_agent_runs;
  DROP POLICY IF EXISTS "outreach_agent_tool_calls_select" ON outreach_agent_tool_calls;
  DROP POLICY IF EXISTS "outreach_agent_tool_calls_insert" ON outreach_agent_tool_calls;
  DROP POLICY IF EXISTS "outreach_agent_tool_calls_update" ON outreach_agent_tool_calls;

  IF to_regprocedure('public.user_workspace_ids()') IS NOT NULL THEN
    EXECUTE 'CREATE POLICY "outreach_agent_runs_select" ON outreach_agent_runs
      FOR SELECT TO authenticated
      USING (workspace_id IN (SELECT user_workspace_ids()))';
    EXECUTE 'CREATE POLICY "outreach_agent_runs_insert" ON outreach_agent_runs
      FOR INSERT TO authenticated
      WITH CHECK (workspace_id IN (SELECT user_workspace_ids()))';
    EXECUTE 'CREATE POLICY "outreach_agent_runs_update" ON outreach_agent_runs
      FOR UPDATE TO authenticated
      USING (workspace_id IN (SELECT user_workspace_ids()))';

    EXECUTE 'CREATE POLICY "outreach_agent_tool_calls_select" ON outreach_agent_tool_calls
      FOR SELECT TO authenticated
      USING (workspace_id IN (SELECT user_workspace_ids()))';
    EXECUTE 'CREATE POLICY "outreach_agent_tool_calls_insert" ON outreach_agent_tool_calls
      FOR INSERT TO authenticated
      WITH CHECK (workspace_id IN (SELECT user_workspace_ids()))';
    EXECUTE 'CREATE POLICY "outreach_agent_tool_calls_update" ON outreach_agent_tool_calls
      FOR UPDATE TO authenticated
      USING (workspace_id IN (SELECT user_workspace_ids()))';
  ELSE
    EXECUTE 'CREATE POLICY "outreach_agent_runs_select" ON outreach_agent_runs FOR SELECT TO authenticated USING (true)';
    EXECUTE 'CREATE POLICY "outreach_agent_runs_insert" ON outreach_agent_runs FOR INSERT TO authenticated WITH CHECK (true)';
    EXECUTE 'CREATE POLICY "outreach_agent_runs_update" ON outreach_agent_runs FOR UPDATE TO authenticated USING (true)';
    EXECUTE 'CREATE POLICY "outreach_agent_tool_calls_select" ON outreach_agent_tool_calls FOR SELECT TO authenticated USING (true)';
    EXECUTE 'CREATE POLICY "outreach_agent_tool_calls_insert" ON outreach_agent_tool_calls FOR INSERT TO authenticated WITH CHECK (true)';
    EXECUTE 'CREATE POLICY "outreach_agent_tool_calls_update" ON outreach_agent_tool_calls FOR UPDATE TO authenticated USING (true)';
  END IF;
END $$;
