-- Migration 009: IMAP credentials for reply detection
-- Adds IMAP username and encrypted password to user_settings

ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS imap_user TEXT;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS imap_password_encrypted TEXT;
