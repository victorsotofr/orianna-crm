-- Drop old constraint FIRST so we can update data
ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_status_check;

-- Migrate existing data to new statuses
UPDATE contacts SET status = 'engaged' WHERE status = 'replied';
UPDATE contacts SET status = 'lost' WHERE status = 'unqualified';

-- Add new constraint with 9-stage pipeline
ALTER TABLE contacts ADD CONSTRAINT contacts_status_check
  CHECK (status IN ('new','contacted','engaged','qualified','meeting_scheduled','opportunity','customer','lost','do_not_contact'));
