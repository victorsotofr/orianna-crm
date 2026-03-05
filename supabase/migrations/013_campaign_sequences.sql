-- Migration 013: Campaign Sequences
-- Adds email sequence functionality with multi-step follow-ups

-- ============================================================
-- 1. campaign_sequences table
-- ============================================================
CREATE TABLE IF NOT EXISTS campaign_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  name TEXT NOT NULL,
  template_variables JSONB, -- Shared variables for all steps in sequence
  created_by UUID REFERENCES auth.users NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'archived')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS campaign_sequences_workspace_idx ON campaign_sequences(workspace_id);
CREATE INDEX IF NOT EXISTS campaign_sequences_status_idx ON campaign_sequences(status);

-- ============================================================
-- 2. campaign_sequence_steps table (max 3 steps)
-- ============================================================
CREATE TABLE IF NOT EXISTS campaign_sequence_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id UUID REFERENCES campaign_sequences ON DELETE CASCADE NOT NULL,
  template_id UUID REFERENCES templates ON DELETE RESTRICT NOT NULL,
  step_order INT NOT NULL CHECK (step_order >= 0 AND step_order <= 2), -- Max 3 steps (0, 1, 2)
  delay_days INT NOT NULL DEFAULT 0 CHECK (delay_days >= 0), -- Days after previous step (0 for first step)
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(sequence_id, step_order)
);

CREATE INDEX IF NOT EXISTS sequence_steps_sequence_idx ON campaign_sequence_steps(sequence_id);
CREATE INDEX IF NOT EXISTS sequence_steps_order_idx ON campaign_sequence_steps(sequence_id, step_order);

-- ============================================================
-- 3. campaign_enrollments table
-- ============================================================
CREATE TABLE IF NOT EXISTS campaign_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  sequence_id UUID REFERENCES campaign_sequences ON DELETE CASCADE NOT NULL,
  contact_id UUID REFERENCES contacts ON DELETE CASCADE NOT NULL,
  enrolled_by UUID REFERENCES auth.users NOT NULL,
  enrolled_at TIMESTAMPTZ DEFAULT now(),
  current_step_id UUID REFERENCES campaign_sequence_steps,
  next_send_at TIMESTAMPTZ, -- When to send the next email in sequence
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'bounced')),
  completed_at TIMESTAMPTZ,
  retry_count INT NOT NULL DEFAULT 0,
  max_retries INT NOT NULL DEFAULT 3,
  UNIQUE(sequence_id, contact_id) -- One enrollment per contact per sequence
);

CREATE INDEX IF NOT EXISTS enrollments_workspace_idx ON campaign_enrollments(workspace_id);
CREATE INDEX IF NOT EXISTS enrollments_sequence_idx ON campaign_enrollments(sequence_id);
CREATE INDEX IF NOT EXISTS enrollments_contact_idx ON campaign_enrollments(contact_id);
CREATE INDEX IF NOT EXISTS enrollments_next_send_idx ON campaign_enrollments(next_send_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS enrollments_status_idx ON campaign_enrollments(status);

-- ============================================================
-- 4. email_stats table (for tracking opens, replies, etc.)
-- ============================================================
CREATE TABLE IF NOT EXISTS email_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  emails_sent_id UUID REFERENCES emails_sent ON DELETE CASCADE NOT NULL,
  enrollment_id UUID REFERENCES campaign_enrollments ON DELETE SET NULL,
  step_id UUID REFERENCES campaign_sequence_steps ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('sent', 'opened', 'replied', 'bounced')),
  event_at TIMESTAMPTZ DEFAULT now(),
  user_agent TEXT,
  ip_address TEXT
);

CREATE INDEX IF NOT EXISTS email_stats_workspace_idx ON email_stats(workspace_id);
CREATE INDEX IF NOT EXISTS email_stats_emails_sent_idx ON email_stats(emails_sent_id);
CREATE INDEX IF NOT EXISTS email_stats_enrollment_idx ON email_stats(enrollment_id);
CREATE INDEX IF NOT EXISTS email_stats_event_type_idx ON email_stats(event_type);
CREATE INDEX IF NOT EXISTS email_stats_event_at_idx ON email_stats(event_at DESC);

-- ============================================================
-- 5. Add sequence fields to emails_sent table
-- ============================================================
ALTER TABLE emails_sent ADD COLUMN IF NOT EXISTS workspace_id UUID;
ALTER TABLE emails_sent ADD COLUMN IF NOT EXISTS enrollment_id UUID REFERENCES campaign_enrollments ON DELETE SET NULL;
ALTER TABLE emails_sent ADD COLUMN IF NOT EXISTS step_id UUID REFERENCES campaign_sequence_steps ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS emails_sent_workspace_idx ON emails_sent(workspace_id);
CREATE INDEX IF NOT EXISTS emails_sent_enrollment_idx ON emails_sent(enrollment_id);

-- ============================================================
-- 6. Update contacts table to add workspace_id if not exists
-- ============================================================
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS workspace_id UUID;
CREATE INDEX IF NOT EXISTS contacts_workspace_idx ON contacts(workspace_id);

-- ============================================================
-- 7. Add workspace_id to other tables if not exists
-- ============================================================
ALTER TABLE templates ADD COLUMN IF NOT EXISTS workspace_id UUID;
CREATE INDEX IF NOT EXISTS templates_workspace_idx ON templates(workspace_id);

ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS workspace_id UUID;
CREATE INDEX IF NOT EXISTS campaigns_workspace_idx ON campaigns(workspace_id);

ALTER TABLE contact_timeline ADD COLUMN IF NOT EXISTS workspace_id UUID;
CREATE INDEX IF NOT EXISTS contact_timeline_workspace_idx ON contact_timeline(workspace_id);

-- ============================================================
-- 8. RLS Policies for new tables
-- ============================================================
ALTER TABLE campaign_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_sequence_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_stats ENABLE ROW LEVEL SECURITY;

-- campaign_sequences: scoped by workspace
CREATE POLICY "sequences_select" ON campaign_sequences
  FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT user_workspace_ids()));

CREATE POLICY "sequences_insert" ON campaign_sequences
  FOR INSERT TO authenticated
  WITH CHECK (workspace_id IN (SELECT user_workspace_ids()));

CREATE POLICY "sequences_update" ON campaign_sequences
  FOR UPDATE TO authenticated
  USING (workspace_id IN (SELECT user_workspace_ids()));

CREATE POLICY "sequences_delete" ON campaign_sequences
  FOR DELETE TO authenticated
  USING (workspace_id IN (SELECT user_workspace_ids()));

-- campaign_sequence_steps: scoped by workspace through sequence
CREATE POLICY "sequence_steps_select" ON campaign_sequence_steps
  FOR SELECT TO authenticated
  USING (sequence_id IN (SELECT id FROM campaign_sequences WHERE workspace_id IN (SELECT user_workspace_ids())));

CREATE POLICY "sequence_steps_insert" ON campaign_sequence_steps
  FOR INSERT TO authenticated
  WITH CHECK (sequence_id IN (SELECT id FROM campaign_sequences WHERE workspace_id IN (SELECT user_workspace_ids())));

CREATE POLICY "sequence_steps_update" ON campaign_sequence_steps
  FOR UPDATE TO authenticated
  USING (sequence_id IN (SELECT id FROM campaign_sequences WHERE workspace_id IN (SELECT user_workspace_ids())));

CREATE POLICY "sequence_steps_delete" ON campaign_sequence_steps
  FOR DELETE TO authenticated
  USING (sequence_id IN (SELECT id FROM campaign_sequences WHERE workspace_id IN (SELECT user_workspace_ids())));

-- campaign_enrollments: scoped by workspace
CREATE POLICY "enrollments_select" ON campaign_enrollments
  FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT user_workspace_ids()));

CREATE POLICY "enrollments_insert" ON campaign_enrollments
  FOR INSERT TO authenticated
  WITH CHECK (workspace_id IN (SELECT user_workspace_ids()));

CREATE POLICY "enrollments_update" ON campaign_enrollments
  FOR UPDATE TO authenticated
  USING (workspace_id IN (SELECT user_workspace_ids()));

CREATE POLICY "enrollments_delete" ON campaign_enrollments
  FOR DELETE TO authenticated
  USING (workspace_id IN (SELECT user_workspace_ids()));

-- email_stats: scoped by workspace
CREATE POLICY "email_stats_select" ON email_stats
  FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT user_workspace_ids()));

CREATE POLICY "email_stats_insert" ON email_stats
  FOR INSERT TO authenticated
  WITH CHECK (workspace_id IN (SELECT user_workspace_ids()));

-- ============================================================
-- 9. RPC function to get pending sequence emails
-- ============================================================
CREATE OR REPLACE FUNCTION get_pending_sequence_emails()
RETURNS TABLE (
  enrollment_id UUID,
  step_id UUID,
  workspace_id UUID,
  contact_id UUID,
  contact_email TEXT,
  contact_first_name TEXT,
  contact_last_name TEXT,
  contact_company_name TEXT,
  contact_company_domain TEXT,
  contact_job_title TEXT,
  contact_linkedin_url TEXT,
  contact_location TEXT,
  contact_education TEXT,
  contact_phone TEXT,
  contact_notes TEXT,
  contact_ai_score NUMERIC,
  contact_ai_score_label TEXT,
  contact_ai_personalized_line TEXT,
  user_id UUID,
  user_email TEXT,
  smtp_host TEXT,
  smtp_port INT,
  smtp_user TEXT,
  smtp_password_encrypted TEXT,
  bcc_enabled BOOLEAN,
  template_subject TEXT,
  template_html_content TEXT,
  delay_days INT,
  step_order INT,
  sequence_id UUID,
  retry_count INT,
  max_retries INT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ce.id AS enrollment_id,
    ce.current_step_id AS step_id,
    ce.workspace_id,
    c.id AS contact_id,
    c.email AS contact_email,
    c.first_name AS contact_first_name,
    c.last_name AS contact_last_name,
    c.company_name AS contact_company_name,
    c.company_domain AS contact_company_domain,
    c.job_title AS contact_job_title,
    c.linkedin_url AS contact_linkedin_url,
    c.location AS contact_location,
    c.education AS contact_education,
    c.phone AS contact_phone,
    c.notes AS contact_notes,
    c.ai_score AS contact_ai_score,
    c.ai_score_label AS contact_ai_score_label,
    c.ai_personalized_line AS contact_ai_personalized_line,
    c.assigned_to AS user_id,
    us.user_email,
    us.smtp_host,
    us.smtp_port,
    us.smtp_user,
    us.smtp_password_encrypted,
    COALESCE(us.bcc_enabled, false) AS bcc_enabled,
    t.subject AS template_subject,
    t.html_content AS template_html_content,
    css.delay_days,
    css.step_order,
    ce.sequence_id,
    ce.retry_count,
    ce.max_retries
  FROM campaign_enrollments ce
  JOIN contacts c ON ce.contact_id = c.id
  JOIN campaign_sequence_steps css ON ce.current_step_id = css.id
  JOIN templates t ON css.template_id = t.id
  JOIN user_settings us ON c.assigned_to = us.user_id
  WHERE ce.status = 'active'
    AND ce.next_send_at <= NOW()
    AND c.replied_at IS NULL -- Exclude contacts that have replied
    AND us.smtp_host IS NOT NULL -- User must have SMTP configured
  ORDER BY ce.next_send_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 10. Add bcc_enabled to user_settings if not exists
-- ============================================================
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS bcc_enabled BOOLEAN DEFAULT false;

-- ============================================================
-- 11. Add cron job to process sequences every 5 minutes
-- ============================================================
-- Note: This requires pg_cron and pg_net extensions to be enabled
-- Replace [PROJECT_REF] with your actual Supabase project reference
-- Replace [SERVICE_ROLE_KEY] with your actual service role key
SELECT cron.schedule(
  'process-sequences',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://[PROJECT_REF].supabase.co/functions/v1/process-sequences',
    headers := '{"Authorization": "Bearer [SERVICE_ROLE_KEY]", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
