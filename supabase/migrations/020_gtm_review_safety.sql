-- Migration 020: GTM review and send safety controls
-- Adds an explicit review gate for GTM-sourced prospects. Any contact sourced by
-- the GTM autopilot must be approved before sequence processors may send email.

ALTER TABLE IF EXISTS contacts
  ADD COLUMN IF NOT EXISTS gtm_review_status TEXT CHECK (gtm_review_status IN ('pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS gtm_send_approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS gtm_send_approved_by UUID REFERENCES auth.users ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS contacts_workspace_gtm_review_idx
  ON contacts(workspace_id, gtm_review_status)
  WHERE source = 'gtm_autopilot';

CREATE INDEX IF NOT EXISTS contacts_workspace_gtm_send_approved_idx
  ON contacts(workspace_id, gtm_send_approved_at)
  WHERE source = 'gtm_autopilot' AND gtm_send_approved_at IS NOT NULL;

UPDATE contacts
SET gtm_review_status = 'pending'
WHERE source = 'gtm_autopilot'
  AND gtm_review_status IS NULL;
