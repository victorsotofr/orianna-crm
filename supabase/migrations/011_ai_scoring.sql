-- Add AI scoring columns to contacts
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS ai_score integer CHECK (ai_score >= 0 AND ai_score <= 100),
  ADD COLUMN IF NOT EXISTS ai_score_label text CHECK (ai_score_label IN ('HOT', 'WARM', 'COLD')),
  ADD COLUMN IF NOT EXISTS ai_score_reasoning text,
  ADD COLUMN IF NOT EXISTS ai_scored_at timestamptz;

-- Indexes for filtering and sorting
CREATE INDEX IF NOT EXISTS idx_contacts_ai_score_label ON contacts (ai_score_label);
CREATE INDEX IF NOT EXISTS idx_contacts_ai_score_desc ON contacts (ai_score DESC NULLS LAST);
