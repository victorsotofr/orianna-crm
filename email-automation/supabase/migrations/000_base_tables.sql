-- Migration 000: Base tables
-- Creates all pre-existing tables that the app depends on.
-- Run this FIRST, before any other migrations.

-- ============================================================
-- 1. contacts
-- ============================================================
CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  first_name TEXT,
  last_name TEXT,
  company_name TEXT,
  company_domain TEXT,
  job_title TEXT,
  linkedin_url TEXT,
  industry TEXT,
  raw_data JSONB,
  user_id UUID REFERENCES auth.users,
  created_by UUID REFERENCES auth.users,
  created_by_email TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 2. templates
-- ============================================================
CREATE TABLE IF NOT EXISTS templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  industry TEXT NOT NULL,
  subject TEXT NOT NULL,
  html_content TEXT NOT NULL,
  variables TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 3. campaigns
-- ============================================================
CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  industry TEXT,
  template_id UUID REFERENCES templates,
  template_variables JSONB,
  user_id UUID REFERENCES auth.users NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sending', 'completed', 'failed')),
  total_contacts INT DEFAULT 0,
  sent_count INT DEFAULT 0,
  failed_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 4. emails_sent
-- ============================================================
CREATE TABLE IF NOT EXISTS emails_sent (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID REFERENCES contacts ON DELETE CASCADE NOT NULL,
  campaign_id UUID REFERENCES campaigns,
  template_id UUID REFERENCES templates,
  user_id UUID REFERENCES auth.users,
  sent_by UUID REFERENCES auth.users,
  sent_by_email TEXT,
  sent_at TIMESTAMPTZ DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed', 'delivered', 'opened', 'replied', 'bounced')),
  error_message TEXT,
  message_id TEXT,
  follow_up_stage INT DEFAULT 0,
  next_follow_up_at TIMESTAMPTZ,
  replied_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS emails_sent_contact_idx ON emails_sent(contact_id);
CREATE INDEX IF NOT EXISTS emails_sent_sent_at_idx ON emails_sent(sent_at DESC);
CREATE INDEX IF NOT EXISTS emails_sent_sent_by_idx ON emails_sent(sent_by);

-- ============================================================
-- 5. user_settings
-- ============================================================
CREATE TABLE IF NOT EXISTS user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL UNIQUE,
  user_email TEXT,
  smtp_host TEXT,
  smtp_port INT DEFAULT 587,
  smtp_user TEXT,
  smtp_password_encrypted TEXT,
  imap_host TEXT,
  imap_port INT DEFAULT 993,
  signature_html TEXT,
  daily_send_limit INT DEFAULT 50,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 6. custom_industries
-- ============================================================
CREATE TABLE IF NOT EXISTS custom_industries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  user_id UUID REFERENCES auth.users,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS custom_industries_name_unique ON custom_industries(LOWER(name));

-- Seed predefined industries
INSERT INTO custom_industries (name, display_name, user_id, is_active) VALUES
  ('real_estate', 'Immobilier', NULL, true),
  ('notary', 'Notaire', NULL, true),
  ('hotel', 'Hôtellerie', NULL, true)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 7. RLS on base tables (shared workspace)
-- ============================================================
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE emails_sent ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_industries ENABLE ROW LEVEL SECURITY;

-- Contacts: shared read/write
CREATE POLICY "contacts_select" ON contacts FOR SELECT TO authenticated USING (true);
CREATE POLICY "contacts_insert" ON contacts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "contacts_update" ON contacts FOR UPDATE TO authenticated USING (true);
CREATE POLICY "contacts_delete" ON contacts FOR DELETE TO authenticated USING (true);

-- Templates: shared read/write
CREATE POLICY "templates_select" ON templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "templates_insert" ON templates FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "templates_update" ON templates FOR UPDATE TO authenticated USING (true);
CREATE POLICY "templates_delete" ON templates FOR DELETE TO authenticated USING (true);

-- Campaigns: shared read/write
CREATE POLICY "campaigns_select" ON campaigns FOR SELECT TO authenticated USING (true);
CREATE POLICY "campaigns_insert" ON campaigns FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "campaigns_update" ON campaigns FOR UPDATE TO authenticated USING (true);

-- Emails Sent: shared read/write
CREATE POLICY "emails_sent_select" ON emails_sent FOR SELECT TO authenticated USING (true);
CREATE POLICY "emails_sent_insert" ON emails_sent FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "emails_sent_update" ON emails_sent FOR UPDATE TO authenticated USING (true);

-- User Settings: users can only access their own
CREATE POLICY "user_settings_select" ON user_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "user_settings_insert" ON user_settings FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "user_settings_update" ON user_settings FOR UPDATE TO authenticated USING (true);

-- Custom Industries: shared read/write
CREATE POLICY "industries_select" ON custom_industries FOR SELECT TO authenticated USING (true);
CREATE POLICY "industries_insert" ON custom_industries FOR INSERT TO authenticated WITH CHECK (true);

-- ============================================================
-- 8. RPC function for campaign sent count
-- ============================================================
CREATE OR REPLACE FUNCTION increment_campaign_sent_count(campaign_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE campaigns
  SET sent_count = sent_count + 1
  WHERE id = campaign_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
