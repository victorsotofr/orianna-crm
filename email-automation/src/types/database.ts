// Database types for Supabase tables
export interface Contact {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  company_domain: string | null;
  job_title: string | null;
  linkedin_url: string | null;
  industry: 'real_estate' | 'notary' | 'hotel' | 'other' | null;
  raw_data: Record<string, any> | null;
  created_at: string;
  updated_at: string;
  user_id: string;
}

export interface Template {
  id: string;
  name: string;
  industry: string;
  subject: string;
  html_content: string;
  variables: string[];
  is_active: boolean;
  created_at: string;
}

export interface Campaign {
  id: string;
  name: string;
  industry: string | null;
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
  contact_id: string;
  campaign_id: string | null;
  template_id: string | null;
  user_id: string;
  sent_at: string;
  status: 'sent' | 'failed' | 'delivered' | 'opened' | 'replied' | 'bounced';
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
  signature_html: string | null;
  daily_send_limit: number;
  created_at: string;
  updated_at: string;
}

// Extended types with joins
export interface EmailSentWithContact extends EmailSent {
  contacts?: Contact;
  templates?: Template;
}

export interface CampaignWithTemplate extends Campaign {
  templates?: Template;
}

