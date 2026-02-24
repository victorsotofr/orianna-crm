-- Migration 005: Sequence Steps table
-- Individual steps within a sequence (email, manual task, etc.)

CREATE TABLE IF NOT EXISTS sequence_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id UUID REFERENCES sequences ON DELETE CASCADE NOT NULL,
  step_order INT NOT NULL,
  step_type TEXT NOT NULL DEFAULT 'email' CHECK (step_type IN ('email', 'manual_task', 'wait')),
  template_id UUID REFERENCES templates,
  delay_days INT NOT NULL DEFAULT 0,
  instructions TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(sequence_id, step_order)
);

CREATE INDEX IF NOT EXISTS steps_sequence_idx ON sequence_steps(sequence_id, step_order);
