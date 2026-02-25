-- Migration 006: Sequence Enrollments table
-- Tracks which contacts are enrolled in which sequences

CREATE TABLE IF NOT EXISTS sequence_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id UUID REFERENCES sequences ON DELETE CASCADE NOT NULL,
  contact_id UUID REFERENCES contacts ON DELETE CASCADE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'replied', 'bounced', 'unenrolled')),
  current_step_order INT NOT NULL DEFAULT 0,
  next_action_at TIMESTAMPTZ,
  enrolled_by UUID REFERENCES auth.users,
  enrolled_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  UNIQUE(sequence_id, contact_id)
);

CREATE INDEX IF NOT EXISTS enrollments_next_action_idx ON sequence_enrollments(next_action_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS enrollments_sequence_idx ON sequence_enrollments(sequence_id);
CREATE INDEX IF NOT EXISTS enrollments_contact_idx ON sequence_enrollments(contact_id);
CREATE INDEX IF NOT EXISTS enrollments_status_idx ON sequence_enrollments(status);
