// Database types for Supabase tables
export interface Contact {
  id: string;
  workspace_id: string | null;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  company_domain: string | null;
  job_title: string | null;
  linkedin_url: string | null;
  location: string | null;
  education: string | null;
  first_contact: string | null;
  second_contact: string | null;
  third_contact: string | null;
  follow_up_1: string | null; // generated column (first_contact + 3 days)
  follow_up_2: string | null; // generated column (first_contact + 7 days)
  raw_data: Record<string, any> | null;
  created_at: string;
  updated_at: string;
  user_id: string;
  // CRM extensions
  status: 'new' | 'contacted' | 'engaged' | 'qualified' | 'meeting_scheduled' | 'opportunity' | 'customer' | 'lost' | 'do_not_contact';
  assigned_to: string | null;
  phone: string | null;
  notes: string | null;
  last_contacted_at: string | null;
  replied_at: string | null;
  // AI scoring
  ai_score: number | null;
  ai_score_label: 'HOT' | 'WARM' | 'COLD' | null;
  ai_score_reasoning: string | null;
  ai_scored_at: string | null;
  // AI personalization
  ai_personalized_line: string | null;
  ai_personalized_at: string | null;
  // Enrichment
  email_verified_status: 'DELIVERABLE' | 'HIGH_PROBABILITY' | 'CATCH_ALL' | 'INVALID' | null;
  enriched_at: string | null;
  enrichment_source: string | null;
}

export interface Template {
  id: string;
  workspace_id: string | null;
  name: string;
  subject: string;
  html_content: string;
  variables: string[];
  is_active: boolean;
  created_at: string;
}

export interface Campaign {
  id: string;
  workspace_id: string | null;
  name: string;
  template_id: string | null;
  template_variables: Record<string, string> | null;
  user_id: string;
  status: 'draft' | 'sending' | 'completed' | 'failed';
  total_contacts: number;
  sent_count: number;
  failed_count: number;
  created_at: string;
}

export interface EmailSent {
  id: string;
  workspace_id: string | null;
  contact_id: string;
  campaign_id: string | null;
  template_id: string | null;
  user_id: string;
  enrollment_id: string | null;
  step_id: string | null;
  sent_at: string;
  status: 'sent' | 'failed' | 'delivered' | 'opened' | 'replied' | 'bounced' | 'pending';
  error_message: string | null;
  message_id: string | null;
  follow_up_stage: number;
  next_follow_up_at: string | null;
  replied_at: string | null;
  opened_at: string | null;
}

export interface UserSettings {
  id: string;
  user_id: string;
  user_email: string | null;
  smtp_host: string | null;
  smtp_port: number;
  smtp_user: string | null;
  smtp_password_encrypted: string | null;
  imap_host: string | null;
  imap_port: number;
  imap_user: string | null;
  imap_password_encrypted: string | null;
  signature_html: string | null;
  daily_send_limit: number;
  bcc_enabled: boolean;
  created_at: string;
  updated_at: string;
}

// New CRM types

export interface TeamMember {
  id: string;
  user_id: string;
  email: string;
  display_name: string;
  role: 'admin' | 'member';
  created_at: string;
  updated_at: string;
}

export interface ContactTimeline {
  id: string;
  workspace_id: string | null;
  contact_id: string;
  event_type: string;
  title: string;
  description: string | null;
  metadata: Record<string, any>;
  created_by: string | null;
  created_at: string;
}

export interface Comment {
  id: string;
  contact_id: string;
  content: string;
  created_by: string;
  created_at: string;
}

// Extended types with joins
export interface EmailSentWithContact extends EmailSent {
  contacts?: Contact;
  templates?: Template;
}

export interface CampaignWithTemplate extends Campaign {
  templates?: Template;
}

export interface CommentWithAuthor extends Comment {
  team_members?: TeamMember;
}

export interface TimelineWithAuthor extends ContactTimeline {
  team_members?: TeamMember;
}

// Email Sequences types

export interface CampaignSequence {
  id: string;
  workspace_id: string;
  name: string;
  template_variables: Record<string, string> | null;
  created_by: string;
  status: 'draft' | 'active' | 'paused' | 'archived';
  created_at: string;
  updated_at: string;
}

export interface CampaignSequenceStep {
  id: string;
  sequence_id: string;
  template_id: string;
  step_order: number;
  delay_days: number;
  created_at: string;
}

export interface CampaignEnrollment {
  id: string;
  workspace_id: string;
  sequence_id: string;
  contact_id: string;
  enrolled_by: string;
  enrolled_at: string;
  current_step_id: string | null;
  next_send_at: string | null;
  status: 'active' | 'paused' | 'completed' | 'bounced';
  completed_at: string | null;
  retry_count: number;
  max_retries: number;
}

export interface EmailStats {
  id: string;
  workspace_id: string;
  emails_sent_id: string;
  enrollment_id: string | null;
  step_id: string | null;
  event_type: 'sent' | 'opened' | 'replied' | 'bounced';
  event_at: string;
  user_agent: string | null;
  ip_address: string | null;
}

// Extended types with joins

export interface CampaignSequenceWithSteps extends CampaignSequence {
  campaign_sequence_steps?: CampaignSequenceStep[];
}

export interface CampaignSequenceStepWithTemplate extends CampaignSequenceStep {
  templates?: Template;
}

export interface CampaignEnrollmentWithDetails extends CampaignEnrollment {
  contacts?: Contact;
  campaign_sequences?: CampaignSequence;
  campaign_sequence_steps?: CampaignSequenceStep;
}
