-- Migration 019: GTM autopilot for isimple outbound workflows
-- Adds workspace-level automation settings, contact source/suppression metadata,
-- and a daily run ledger for observable prospecting jobs.

-- Workspace GTM settings
ALTER TABLE IF EXISTS workspaces
  ADD COLUMN IF NOT EXISTS gtm_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS gtm_daily_contact_limit INT NOT NULL DEFAULT 20 CHECK (gtm_daily_contact_limit BETWEEN 1 AND 100),
  ADD COLUMN IF NOT EXISTS gtm_active_sequence_id UUID,
  ADD COLUMN IF NOT EXISTS gtm_requires_approval BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS gtm_icp_queries TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS gtm_last_run_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS gtm_last_run_status TEXT CHECK (gtm_last_run_status IN ('running', 'completed', 'failed')),
  ADD COLUMN IF NOT EXISTS gtm_last_run_summary JSONB NOT NULL DEFAULT '{}'::JSONB;

CREATE INDEX IF NOT EXISTS workspaces_gtm_enabled_idx
  ON workspaces(gtm_enabled)
  WHERE gtm_enabled = TRUE;

CREATE INDEX IF NOT EXISTS workspaces_gtm_active_sequence_idx
  ON workspaces(gtm_active_sequence_id)
  WHERE gtm_active_sequence_id IS NOT NULL;

-- Contact provenance and suppression metadata
ALTER TABLE IF EXISTS contacts
  ADD COLUMN IF NOT EXISTS source TEXT,
  ADD COLUMN IF NOT EXISTS source_query TEXT,
  ADD COLUMN IF NOT EXISTS source_url TEXT,
  ADD COLUMN IF NOT EXISTS segment TEXT,
  ADD COLUMN IF NOT EXISTS persona TEXT,
  ADD COLUMN IF NOT EXISTS opted_out_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suppressed_reason TEXT;

CREATE INDEX IF NOT EXISTS contacts_workspace_segment_idx
  ON contacts(workspace_id, segment)
  WHERE segment IS NOT NULL;

CREATE INDEX IF NOT EXISTS contacts_workspace_source_idx
  ON contacts(workspace_id, source)
  WHERE source IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS contacts_workspace_email_unique
  ON contacts(workspace_id, LOWER(email))
  WHERE email IS NOT NULL;

-- Daily run ledger
CREATE TABLE IF NOT EXISTS gtm_daily_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  user_id UUID REFERENCES auth.users ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  requested_limit INT NOT NULL DEFAULT 20,
  imported_count INT NOT NULL DEFAULT 0,
  prepared_count INT NOT NULL DEFAULT 0,
  enrolled_count INT NOT NULL DEFAULT 0,
  skipped_count INT NOT NULL DEFAULT 0,
  summary JSONB NOT NULL DEFAULT '{}'::JSONB,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gtm_daily_runs_workspace_started_idx
  ON gtm_daily_runs(workspace_id, started_at DESC);

CREATE INDEX IF NOT EXISTS gtm_daily_runs_user_started_idx
  ON gtm_daily_runs(user_id, started_at DESC);

ALTER TABLE gtm_daily_runs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  DROP POLICY IF EXISTS "gtm_daily_runs_select" ON gtm_daily_runs;
  DROP POLICY IF EXISTS "gtm_daily_runs_insert" ON gtm_daily_runs;
  DROP POLICY IF EXISTS "gtm_daily_runs_update" ON gtm_daily_runs;

  IF to_regprocedure('public.user_workspace_ids()') IS NOT NULL THEN
    EXECUTE 'CREATE POLICY "gtm_daily_runs_select" ON gtm_daily_runs
      FOR SELECT TO authenticated
      USING (workspace_id IN (SELECT user_workspace_ids()))';
    EXECUTE 'CREATE POLICY "gtm_daily_runs_insert" ON gtm_daily_runs
      FOR INSERT TO authenticated
      WITH CHECK (workspace_id IN (SELECT user_workspace_ids()))';
    EXECUTE 'CREATE POLICY "gtm_daily_runs_update" ON gtm_daily_runs
      FOR UPDATE TO authenticated
      USING (workspace_id IN (SELECT user_workspace_ids()))';
  ELSE
    EXECUTE 'CREATE POLICY "gtm_daily_runs_select" ON gtm_daily_runs
      FOR SELECT TO authenticated
      USING (true)';
    EXECUTE 'CREATE POLICY "gtm_daily_runs_insert" ON gtm_daily_runs
      FOR INSERT TO authenticated
      WITH CHECK (true)';
    EXECUTE 'CREATE POLICY "gtm_daily_runs_update" ON gtm_daily_runs
      FOR UPDATE TO authenticated
      USING (true)';
  END IF;
END $$;
