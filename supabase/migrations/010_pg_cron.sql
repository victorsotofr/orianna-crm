-- Migration 010: pg_cron scheduling for Edge Functions
-- Requires pg_cron and pg_net extensions to be enabled in Supabase Dashboard
--
-- Enable these in: Database > Extensions > Search "pg_cron" and "pg_net" > Enable
--
-- IMPORTANT: Replace [PROJECT_REF] with your actual Supabase project reference
-- and [SERVICE_ROLE_KEY] with your actual service role key.
-- Run this AFTER enabling pg_cron and pg_net extensions.

-- Check replies every 15 minutes
SELECT cron.schedule(
  'check-replies',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://[PROJECT_REF].supabase.co/functions/v1/check-replies',
    headers := '{"Authorization": "Bearer [SERVICE_ROLE_KEY]", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
