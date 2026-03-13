-- Add created_by column to templates
ALTER TABLE templates ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);

-- Backfill: set created_by to workspace creator for existing templates
UPDATE templates t
SET created_by = w.created_by
FROM workspaces w
WHERE t.workspace_id = w.id
  AND t.created_by IS NULL;

CREATE INDEX IF NOT EXISTS templates_created_by_idx ON templates(created_by);
