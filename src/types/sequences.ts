/**
 * Campaign Sequences Types
 *
 * Email sequences allow campaigns to have up to 3 automated follow-up steps.
 * Each step has a template and a delay (in days) from the previous step.
 */

export interface CampaignSequenceStep {
  step_order: number; // 0, 1, or 2 (max 3 steps)
  template_id: string;
  delay_days: number; // Days to wait after previous step (step 0 = 0 days)
}

export interface CampaignSequence {
  campaign_id: string;
  steps: CampaignSequenceStep[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Campaign {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  created_at: string;
  created_by: string;
  is_sequence: boolean; // True if this is an automated sequence campaign
  sequence?: CampaignSequence | null;
}

export interface SequenceProgress {
  contact_id: string;
  campaign_id: string;
  current_step: number; // 0, 1, or 2
  next_send_date: string | null; // When the next step should be sent
  is_paused: boolean;
  is_completed: boolean;
  created_at: string;
  updated_at: string;
}

// Default delays for sequence builder
export const DEFAULT_SEQUENCE_DELAYS = {
  step_0: 0, // Initial email sent immediately
  step_1: 3, // First follow-up after 3 days
  step_2: 7, // Second follow-up after 7 days
} as const;

export const MAX_SEQUENCE_STEPS = 3;
