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
  // Bounce tracking
  email_bounced: boolean;
  bounce_reason: string | null;
  bounced_at: string | null;
  original_email: string | null;
  email_recovery_attempted: boolean;
  email_recovery_count: number;
  // GTM automation
  source: string | null;
  source_query: string | null;
  source_url: string | null;
  segment: string | null;
  persona: string | null;
  opted_out_at: string | null;
  suppressed_reason: string | null;
  gtm_review_status: 'pending' | 'approved' | 'rejected' | null;
  gtm_send_approved_at: string | null;
  gtm_send_approved_by: string | null;
}

export interface GtmDailyRun {
  id: string;
  workspace_id: string;
  user_id: string;
  status: 'running' | 'completed' | 'failed';
  started_at: string;
  finished_at: string | null;
  requested_limit: number;
  imported_count: number;
  prepared_count: number;
  enrolled_count: number;
  skipped_count: number;
  summary: Record<string, any>;
  error: string | null;
}

export interface OutreachSession {
  id: string;
  workspace_id: string;
  user_id: string | null;
  prompt: string;
  structured_brief: Record<string, unknown>;
  status: 'draft' | 'searching' | 'ready' | 'enriching' | 'sequence_draft' | 'saved' | 'launched' | 'automated' | 'failed';
  raw_search_result: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface OutreachSessionProspect {
  id: string;
  session_id: string;
  workspace_id: string;
  contact_id: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  email_verified_status: string | null;
  company_name: string | null;
  company_domain: string | null;
  job_title: string | null;
  linkedin_url: string | null;
  location: string | null;
  source_url: string | null;
  source_label: string | null;
  confidence: string | null;
  reason: string | null;
  raw_result: Record<string, unknown>;
  selected: boolean;
  ignored: boolean;
  enrichment_status: 'not_requested' | 'not_enrichable' | 'requested' | 'found' | 'not_found' | 'failed';
  created_at: string;
  updated_at: string;
}

export interface OutreachSequenceDraft {
  id: string;
  session_id: string;
  workspace_id: string;
  user_id: string | null;
  name: string;
  steps: Array<{ subject: string; body: string; delayDays: number }>;
  status: 'draft' | 'saved' | 'launched';
  sequence_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface OutreachAutomation {
  id: string;
  workspace_id: string;
  user_id: string | null;
  session_id: string | null;
  sequence_id: string | null;
  name: string;
  prompt: string;
  structured_brief: Record<string, unknown>;
  schedule: string;
  daily_limit: number;
  approval_required: boolean;
  enabled: boolean;
  status: 'active' | 'paused' | 'archived';
  last_run_at: string | null;
  next_run_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Template {
  id: string;
  workspace_id: string | null;
  name: string;
  subject: string;
  html_content: string;
  variables: string[];
  is_active: boolean;
  created_by: string | null;
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
  google_calendar_refresh_token_encrypted: string | null;
  google_calendar_email: string | null;
  google_calendar_scopes: string[] | null;
  google_calendar_connected_at: string | null;
  google_calendar_default_calendar_id: string | null;
  google_calendar_default_timezone: string | null;
  google_calendar_last_error: string | null;
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

export interface MailboxAddress {
  name: string | null;
  email: string;
}

export interface MailboxThread {
  id: string;
  workspace_id: string;
  user_id: string;
  contact_id: string | null;
  mail_account_id: string | null;
  provider_thread_id: string | null;
  subject: string | null;
  subject_normalized: string | null;
  snippet: string | null;
  unread_count: number;
  last_message_at: string;
  last_message_direction: 'inbound' | 'outbound' | null;
  participants: MailboxAddress[];
  last_message_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface MailboxMessage {
  id: string;
  thread_id: string;
  workspace_id: string;
  user_id: string;
  contact_id: string | null;
  email_sent_id: string | null;
  mail_account_id: string | null;
  provider: 'imap' | 'gmail' | 'outlook' | null;
  provider_message_id: string | null;
  provider_thread_id: string | null;
  provider_label_ids: string[];
  direction: 'inbound' | 'outbound';
  internet_message_id: string;
  in_reply_to: string | null;
  references: string[];
  subject: string | null;
  from_name: string | null;
  from_email: string | null;
  to_emails: MailboxAddress[];
  cc_emails: MailboxAddress[];
  bcc_emails: MailboxAddress[];
  text_body: string | null;
  html_body: string | null;
  snippet: string | null;
  message_at: string;
  sent_at: string | null;
  received_at: string | null;
  folder: string | null;
  imap_uid: number | null;
  is_auto_reply: boolean;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface CalendarEvent {
  id: string;
  user_id: string;
  workspace_id: string | null;
  contact_id: string | null;
  thread_id: string | null;
  google_event_id: string;
  calendar_id: string;
  summary: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  meet_url: string | null;
  google_event_url: string | null;
  status: 'confirmed' | 'cancelled' | 'deleted';
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
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
