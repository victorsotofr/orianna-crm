-- Migration 023: Prompt-to-outreach sessions
-- Adds workspace-scoped session, draft sequence, and recurring automation tables
-- for the fast isimple GTM workflow.

CREATE TABLE IF NOT EXISTS outreach_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  user_id UUID REFERENCES auth.users ON DELETE SET NULL,
  prompt TEXT NOT NULL,
  structured_brief JSONB NOT NULL DEFAULT '{}'::JSONB,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'searching', 'ready', 'enriching', 'sequence_draft', 'saved', 'launched', 'automated', 'failed')),
  raw_search_result TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS outreach_sessions_workspace_created_idx
  ON outreach_sessions(workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS outreach_sessions_user_created_idx
  ON outreach_sessions(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS outreach_session_prospects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES outreach_sessions ON DELETE CASCADE NOT NULL,
  workspace_id UUID NOT NULL,
  contact_id UUID REFERENCES contacts ON DELETE SET NULL,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  email_verified_status TEXT,
  company_name TEXT,
  company_domain TEXT,
  job_title TEXT,
  linkedin_url TEXT,
  location TEXT,
  source_url TEXT,
  source_label TEXT,
  confidence TEXT,
  reason TEXT,
  raw_result JSONB NOT NULL DEFAULT '{}'::JSONB,
  selected BOOLEAN NOT NULL DEFAULT TRUE,
  ignored BOOLEAN NOT NULL DEFAULT FALSE,
  enrichment_status TEXT NOT NULL DEFAULT 'not_requested' CHECK (enrichment_status IN ('not_requested', 'not_enrichable', 'requested', 'found', 'not_found', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS outreach_session_prospects_session_idx
  ON outreach_session_prospects(session_id);

CREATE INDEX IF NOT EXISTS outreach_session_prospects_workspace_idx
  ON outreach_session_prospects(workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS outreach_session_prospects_contact_idx
  ON outreach_session_prospects(contact_id)
  WHERE contact_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS outreach_sequence_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES outreach_sessions ON DELETE CASCADE NOT NULL UNIQUE,
  workspace_id UUID NOT NULL,
  user_id UUID REFERENCES auth.users ON DELETE SET NULL,
  name TEXT NOT NULL,
  steps JSONB NOT NULL DEFAULT '[]'::JSONB,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'saved', 'launched')),
  sequence_id UUID REFERENCES campaign_sequences ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS outreach_sequence_drafts_workspace_idx
  ON outreach_sequence_drafts(workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS outreach_automations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  user_id UUID REFERENCES auth.users ON DELETE SET NULL,
  session_id UUID REFERENCES outreach_sessions ON DELETE SET NULL,
  sequence_id UUID REFERENCES campaign_sequences ON DELETE SET NULL,
  name TEXT NOT NULL,
  prompt TEXT NOT NULL,
  structured_brief JSONB NOT NULL DEFAULT '{}'::JSONB,
  schedule TEXT NOT NULL DEFAULT 'weekday_morning',
  daily_limit INT NOT NULL DEFAULT 20 CHECK (daily_limit BETWEEN 1 AND 100),
  approval_required BOOLEAN NOT NULL DEFAULT TRUE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS outreach_automations_workspace_status_idx
  ON outreach_automations(workspace_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS outreach_automations_sequence_idx
  ON outreach_automations(sequence_id)
  WHERE sequence_id IS NOT NULL;

ALTER TABLE outreach_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE outreach_session_prospects ENABLE ROW LEVEL SECURITY;
ALTER TABLE outreach_sequence_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE outreach_automations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  DROP POLICY IF EXISTS "outreach_sessions_select" ON outreach_sessions;
  DROP POLICY IF EXISTS "outreach_sessions_insert" ON outreach_sessions;
  DROP POLICY IF EXISTS "outreach_sessions_update" ON outreach_sessions;
  DROP POLICY IF EXISTS "outreach_session_prospects_select" ON outreach_session_prospects;
  DROP POLICY IF EXISTS "outreach_session_prospects_insert" ON outreach_session_prospects;
  DROP POLICY IF EXISTS "outreach_session_prospects_update" ON outreach_session_prospects;
  DROP POLICY IF EXISTS "outreach_sequence_drafts_select" ON outreach_sequence_drafts;
  DROP POLICY IF EXISTS "outreach_sequence_drafts_insert" ON outreach_sequence_drafts;
  DROP POLICY IF EXISTS "outreach_sequence_drafts_update" ON outreach_sequence_drafts;
  DROP POLICY IF EXISTS "outreach_automations_select" ON outreach_automations;
  DROP POLICY IF EXISTS "outreach_automations_insert" ON outreach_automations;
  DROP POLICY IF EXISTS "outreach_automations_update" ON outreach_automations;

  IF to_regprocedure('public.user_workspace_ids()') IS NOT NULL THEN
    EXECUTE 'CREATE POLICY "outreach_sessions_select" ON outreach_sessions
      FOR SELECT TO authenticated
      USING (workspace_id IN (SELECT user_workspace_ids()))';
    EXECUTE 'CREATE POLICY "outreach_sessions_insert" ON outreach_sessions
      FOR INSERT TO authenticated
      WITH CHECK (workspace_id IN (SELECT user_workspace_ids()))';
    EXECUTE 'CREATE POLICY "outreach_sessions_update" ON outreach_sessions
      FOR UPDATE TO authenticated
      USING (workspace_id IN (SELECT user_workspace_ids()))';

    EXECUTE 'CREATE POLICY "outreach_session_prospects_select" ON outreach_session_prospects
      FOR SELECT TO authenticated
      USING (workspace_id IN (SELECT user_workspace_ids()))';
    EXECUTE 'CREATE POLICY "outreach_session_prospects_insert" ON outreach_session_prospects
      FOR INSERT TO authenticated
      WITH CHECK (workspace_id IN (SELECT user_workspace_ids()))';
    EXECUTE 'CREATE POLICY "outreach_session_prospects_update" ON outreach_session_prospects
      FOR UPDATE TO authenticated
      USING (workspace_id IN (SELECT user_workspace_ids()))';

    EXECUTE 'CREATE POLICY "outreach_sequence_drafts_select" ON outreach_sequence_drafts
      FOR SELECT TO authenticated
      USING (workspace_id IN (SELECT user_workspace_ids()))';
    EXECUTE 'CREATE POLICY "outreach_sequence_drafts_insert" ON outreach_sequence_drafts
      FOR INSERT TO authenticated
      WITH CHECK (workspace_id IN (SELECT user_workspace_ids()))';
    EXECUTE 'CREATE POLICY "outreach_sequence_drafts_update" ON outreach_sequence_drafts
      FOR UPDATE TO authenticated
      USING (workspace_id IN (SELECT user_workspace_ids()))';

    EXECUTE 'CREATE POLICY "outreach_automations_select" ON outreach_automations
      FOR SELECT TO authenticated
      USING (workspace_id IN (SELECT user_workspace_ids()))';
    EXECUTE 'CREATE POLICY "outreach_automations_insert" ON outreach_automations
      FOR INSERT TO authenticated
      WITH CHECK (workspace_id IN (SELECT user_workspace_ids()))';
    EXECUTE 'CREATE POLICY "outreach_automations_update" ON outreach_automations
      FOR UPDATE TO authenticated
      USING (workspace_id IN (SELECT user_workspace_ids()))';
  ELSE
    EXECUTE 'CREATE POLICY "outreach_sessions_select" ON outreach_sessions FOR SELECT TO authenticated USING (true)';
    EXECUTE 'CREATE POLICY "outreach_sessions_insert" ON outreach_sessions FOR INSERT TO authenticated WITH CHECK (true)';
    EXECUTE 'CREATE POLICY "outreach_sessions_update" ON outreach_sessions FOR UPDATE TO authenticated USING (true)';
    EXECUTE 'CREATE POLICY "outreach_session_prospects_select" ON outreach_session_prospects FOR SELECT TO authenticated USING (true)';
    EXECUTE 'CREATE POLICY "outreach_session_prospects_insert" ON outreach_session_prospects FOR INSERT TO authenticated WITH CHECK (true)';
    EXECUTE 'CREATE POLICY "outreach_session_prospects_update" ON outreach_session_prospects FOR UPDATE TO authenticated USING (true)';
    EXECUTE 'CREATE POLICY "outreach_sequence_drafts_select" ON outreach_sequence_drafts FOR SELECT TO authenticated USING (true)';
    EXECUTE 'CREATE POLICY "outreach_sequence_drafts_insert" ON outreach_sequence_drafts FOR INSERT TO authenticated WITH CHECK (true)';
    EXECUTE 'CREATE POLICY "outreach_sequence_drafts_update" ON outreach_sequence_drafts FOR UPDATE TO authenticated USING (true)';
    EXECUTE 'CREATE POLICY "outreach_automations_select" ON outreach_automations FOR SELECT TO authenticated USING (true)';
    EXECUTE 'CREATE POLICY "outreach_automations_insert" ON outreach_automations FOR INSERT TO authenticated WITH CHECK (true)';
    EXECUTE 'CREATE POLICY "outreach_automations_update" ON outreach_automations FOR UPDATE TO authenticated USING (true)';
  END IF;
END $$;
