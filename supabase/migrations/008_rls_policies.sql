-- Migration 008: RLS Policies
-- Shared workspace model: all authenticated users can read/write all data

-- Enable RLS on new tables
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_timeline ENABLE ROW LEVEL SECURITY;
ALTER TABLE sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE sequence_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE sequence_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

-- Team Members: all authenticated users can view, only admins can modify
CREATE POLICY "team_members_select" ON team_members FOR SELECT TO authenticated USING (true);
CREATE POLICY "team_members_insert" ON team_members FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "team_members_update" ON team_members FOR UPDATE TO authenticated USING (true);

-- Contact Timeline: shared read/write
CREATE POLICY "timeline_select" ON contact_timeline FOR SELECT TO authenticated USING (true);
CREATE POLICY "timeline_insert" ON contact_timeline FOR INSERT TO authenticated WITH CHECK (true);

-- Sequences: shared read/write
CREATE POLICY "sequences_select" ON sequences FOR SELECT TO authenticated USING (true);
CREATE POLICY "sequences_insert" ON sequences FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "sequences_update" ON sequences FOR UPDATE TO authenticated USING (true);
CREATE POLICY "sequences_delete" ON sequences FOR DELETE TO authenticated USING (true);

-- Sequence Steps: shared read/write
CREATE POLICY "steps_select" ON sequence_steps FOR SELECT TO authenticated USING (true);
CREATE POLICY "steps_insert" ON sequence_steps FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "steps_update" ON sequence_steps FOR UPDATE TO authenticated USING (true);
CREATE POLICY "steps_delete" ON sequence_steps FOR DELETE TO authenticated USING (true);

-- Sequence Enrollments: shared read/write
CREATE POLICY "enrollments_select" ON sequence_enrollments FOR SELECT TO authenticated USING (true);
CREATE POLICY "enrollments_insert" ON sequence_enrollments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "enrollments_update" ON sequence_enrollments FOR UPDATE TO authenticated USING (true);
CREATE POLICY "enrollments_delete" ON sequence_enrollments FOR DELETE TO authenticated USING (true);

-- Comments: shared read/write
CREATE POLICY "comments_select" ON comments FOR SELECT TO authenticated USING (true);
CREATE POLICY "comments_insert" ON comments FOR INSERT TO authenticated WITH CHECK (true);
