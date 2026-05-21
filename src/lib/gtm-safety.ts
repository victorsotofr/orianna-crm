import 'server-only';

export type GtmReviewStatus = 'pending' | 'approved' | 'rejected';

export interface GtmSendSafetyContact {
  source?: string | null;
  gtm_review_status?: GtmReviewStatus | null;
  gtm_send_approved_at?: string | null;
  email?: string | null;
  email_bounced?: boolean | null;
  opted_out_at?: string | null;
  replied_at?: string | null;
  status?: string | null;
}

const GENERIC_EMAIL_PREFIXES = new Set([
  'contact',
  'info',
  'hello',
  'bonjour',
  'accueil',
  'admin',
  'office',
  'gestion',
  'service',
  'support',
  'commercial',
  'agence',
  'syndic',
  'location',
  'locations',
]);

export function isGenericInbox(email?: string | null) {
  const prefix = email?.split('@')[0]?.trim().toLowerCase();
  if (!prefix) return false;
  return GENERIC_EMAIL_PREFIXES.has(prefix) || prefix.startsWith('contact.') || prefix.startsWith('info.');
}

export function getGtmSendBlockReason(contact: GtmSendSafetyContact) {
  if (contact.source !== 'gtm_autopilot') return null;
  if (contact.gtm_review_status === 'rejected') return 'GTM prospect rejected';
  if (!contact.email) return 'GTM prospect has no verified professional email';
  if (isGenericInbox(contact.email)) return 'GTM prospect has a generic company inbox';
  if (!contact.gtm_send_approved_at || contact.gtm_review_status !== 'approved') {
    return 'GTM prospect not approved for outreach';
  }
  return null;
}

export function isGtmApprovedForSend(contact: GtmSendSafetyContact) {
  return getGtmSendBlockReason(contact) === null;
}
