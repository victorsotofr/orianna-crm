-- Migration 024: Cover outreach foreign keys used by the prompt-to-outreach flow.

CREATE INDEX IF NOT EXISTS outreach_automations_session_idx
  ON outreach_automations(session_id)
  WHERE session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS outreach_automations_user_idx
  ON outreach_automations(user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS outreach_sequence_drafts_sequence_idx
  ON outreach_sequence_drafts(sequence_id)
  WHERE sequence_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS outreach_sequence_drafts_user_idx
  ON outreach_sequence_drafts(user_id)
  WHERE user_id IS NOT NULL;
