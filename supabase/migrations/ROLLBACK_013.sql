-- ROLLBACK for 013_campaign_sequences.sql
-- Use this ONLY if you need to completely remove the sequences feature

-- WARNING: This will delete ALL sequence data!
-- Make sure to backup first if you have important data

BEGIN;

-- Drop tables (CASCADE removes dependencies)
DROP TABLE IF EXISTS campaign_enrollments CASCADE;
DROP TABLE IF EXISTS campaign_sequence_steps CASCADE;
DROP TABLE IF EXISTS campaign_sequences CASCADE;

-- Remove added columns (optional - won't break anything if you keep them)
ALTER TABLE emails_sent DROP COLUMN IF EXISTS enrollment_id;
ALTER TABLE emails_sent DROP COLUMN IF EXISTS step_id;
ALTER TABLE email_stats DROP COLUMN IF EXISTS enrollment_id;
ALTER TABLE email_stats DROP COLUMN IF EXISTS step_id;
ALTER TABLE user_settings DROP COLUMN IF EXISTS bcc_enabled;

-- Note: We don't remove workspace_id columns as they may be used by other features

-- Drop the RPC function
DROP FUNCTION IF EXISTS get_pending_sequence_emails();

-- Unschedule the cron job (if it was set up)
SELECT cron.unschedule('process-sequences');

COMMIT;

-- After running this, the database will be back to its state before the migration
