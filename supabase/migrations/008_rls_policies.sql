-- Migration 008: RLS Policies
-- Shared workspace model: all authenticated users can read/write all data

-- Enable RLS on new tables
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_timeline ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

-- Team Members: all authenticated users can view, only admins can modify
CREATE POLICY "team_members_select" ON team_members FOR SELECT TO authenticated USING (true);
CREATE POLICY "team_members_insert" ON team_members FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "team_members_update" ON team_members FOR UPDATE TO authenticated USING (true);

-- Contact Timeline: shared read/write
CREATE POLICY "timeline_select" ON contact_timeline FOR SELECT TO authenticated USING (true);
CREATE POLICY "timeline_insert" ON contact_timeline FOR INSERT TO authenticated WITH CHECK (true);

-- Comments: shared read/write
CREATE POLICY "comments_select" ON comments FOR SELECT TO authenticated USING (true);
CREATE POLICY "comments_insert" ON comments FOR INSERT TO authenticated WITH CHECK (true);
