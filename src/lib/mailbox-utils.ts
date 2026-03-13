import type { MessageAddressObject } from 'imapflow';
import { buildSnippet, extractPlainText } from '@/lib/email-content';

export interface MailboxAddress {
  name: string | null;
  email: string;
}

export function normalizeEmail(email?: string | null): string | null {
  const value = email?.trim().toLowerCase();
  return value || null;
}

export function normalizeMessageId(messageId?: string | null): string | null {
  const value = messageId?.trim();
  if (!value) return null;
  return value.replace(/^<|>$/g, '').trim() || null;
}

export function formatMessageId(messageId?: string | null): string | undefined {
  const normalized = normalizeMessageId(messageId);
  return normalized ? `<${normalized}>` : undefined;
}

export function stripReplyPrefixes(subject?: string | null): string {
  let value = (subject || '').trim();
  while (/^(re|aw|sv|fwd?)\s*:/i.test(value)) {
    value = value.replace(/^(re|aw|sv|fwd?)\s*:\s*/i, '').trim();
  }
  return value;
}

export function normalizeThreadSubject(subject?: string | null): string {
  return stripReplyPrefixes(subject)
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function ensureReplySubject(subject?: string | null): string {
  const value = (subject || '').trim();
  if (!value) return 'Re: Conversation';
  if (/^(re|aw|sv)\s*:/i.test(value)) return value;
  return `Re: ${value}`;
}

export function parseAddressString(value: string): MailboxAddress | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const match = trimmed.match(/^(?:"?([^"]*)"?\s)?<?([^<>@\s]+@[^<>@\s]+)>?$/);
  if (!match) {
    const normalized = normalizeEmail(trimmed);
    return normalized ? { name: null, email: normalized } : null;
  }

  const email = normalizeEmail(match[2]);
  if (!email) return null;

  return {
    name: match[1]?.trim() || null,
    email,
  };
}

export function uniqueAddresses(addresses: MailboxAddress[]): MailboxAddress[] {
  const deduped = new Map<string, MailboxAddress>();
  for (const address of addresses) {
    const normalized = normalizeEmail(address.email);
    if (!normalized) continue;

    const existing = deduped.get(normalized);
    if (!existing || (!existing.name && address.name)) {
      deduped.set(normalized, {
        name: address.name?.trim() || null,
        email: normalized,
      });
    }
  }
  return Array.from(deduped.values());
}

export function addressesFromEnvelope(addresses?: MessageAddressObject[]): MailboxAddress[] {
  if (!addresses?.length) return [];
  return uniqueAddresses(
    addresses
      .map((entry) => {
        const email = normalizeEmail(entry.address);
        if (!email) return null;
        return {
          name: entry.name?.trim() || null,
          email,
        } satisfies MailboxAddress;
      })
      .filter((entry): entry is MailboxAddress => Boolean(entry))
  );
}

export function addressesFromStrings(addresses?: Array<string | null | undefined>): MailboxAddress[] {
  if (!addresses?.length) return [];
  return uniqueAddresses(
    addresses
      .map((value) => (value ? parseAddressString(value) : null))
      .filter((entry): entry is MailboxAddress => Boolean(entry))
  );
}

export function extractPrimaryEmail(addresses?: MailboxAddress[]): string | null {
  return addresses?.[0]?.email || null;
}

export function buildParticipantList(...groups: MailboxAddress[][]): MailboxAddress[] {
  return uniqueAddresses(groups.flat());
}

export function parseHeadersBuffer(headers?: Buffer | null): Record<string, string> {
  const lines = (headers?.toString('utf8') || '')
    .replace(/\r\n/g, '\n')
    .split('\n');

  const unfolded: string[] = [];
  for (const line of lines) {
    if (!line) continue;
    if (/^\s/.test(line) && unfolded.length > 0) {
      unfolded[unfolded.length - 1] += ` ${line.trim()}`;
    } else {
      unfolded.push(line);
    }
  }

  const record: Record<string, string> = {};
  for (const line of unfolded) {
    const index = line.indexOf(':');
    if (index === -1) continue;
    const key = line.slice(0, index).trim().toLowerCase();
    const value = line.slice(index + 1).trim();
    if (!key) continue;
    record[key] = record[key] ? `${record[key]} ${value}` : value;
  }
  return record;
}

export function parseMessageIdHeader(value?: string | null): string[] {
  if (!value) return [];
  const matches = value.match(/<[^>]+>/g);
  if (matches?.length) {
    return matches
      .map((entry) => normalizeMessageId(entry))
      .filter((entry): entry is string => Boolean(entry));
  }

  return value
    .split(/\s+/)
    .map((entry) => normalizeMessageId(entry))
    .filter((entry): entry is string => Boolean(entry));
}

export function createMessageSnippet(textBody?: string | null, htmlBody?: string | null): string {
  return buildSnippet(extractPlainText(textBody, htmlBody));
}

export interface BounceDetectionResult {
  isBounce: boolean;
  originalRecipient?: string;
  bounceReason?: string;
  isHardBounce: boolean;
}

export function detectBounce(
  subject: string | null | undefined,
  from: string | null | undefined,
  textBody: string | null | undefined,
  headers: Record<string, string>
): BounceDetectionResult {
  const subjectLower = (subject || '').toLowerCase();
  const fromLower = (from || '').toLowerCase();
  const bodyLower = (textBody || '').toLowerCase();

  // Check sender patterns (NDR senders)
  const bounceSenders = [
    'postmaster@',
    'mailer-daemon@',
    'mail delivery subsystem',
    'microsoft outlook',
    'postmaster',
  ];
  const isBounceFrom = bounceSenders.some((s) => fromLower.includes(s));

  // Check subject patterns
  const bounceSubjects = [
    'undeliverable',
    'undelivered',
    'delivery status notification',
    'returned mail',
    'failure notice',
    'delivery failure',
    'non remis',
    'échec de remise',
    'non distribuable',
    "couldn't be delivered",
    'warning: could not send message',
    'could not be delivered',
    'mail delivery failed',
  ];
  const isBounceSubject = bounceSubjects.some((p) => subjectLower.includes(p));

  // Check body patterns (hard bounce indicators)
  const hardBouncePatterns = [
    "couldn't be delivered",
    "wasn't found",
    'recipient unknown',
    'address not found',
    'user unknown',
    'mailbox unavailable',
    'mailbox not found',
    'no such user',
    'does not exist',
    'account disabled',
    'account has been disabled',
    'permanent failure',
    'permanently rejected',
    '550 5.1.1',
    '550 5.1.10',
    '550 5.4.1',
    'adresse introuvable',
    'destinataire inconnu',
    'utilisateur inconnu',
    'boîte aux lettres introuvable',
  ];

  // Soft bounce patterns (temporary issues)
  const softBouncePatterns = [
    'mailbox full',
    'over quota',
    'quota exceeded',
    'temporarily rejected',
    'try again later',
    'temporary failure',
    '452 4.2.2',
    'boîte pleine',
  ];

  const hardMatch = hardBouncePatterns.find((p) => bodyLower.includes(p));
  const softMatch = softBouncePatterns.find((p) => bodyLower.includes(p));
  const bounceMatch = hardMatch || softMatch;

  // A bounce is confirmed if sender/subject match AND body has bounce patterns,
  // OR if both sender AND subject match (strong signal even without body patterns)
  const isBounce = ((isBounceFrom || isBounceSubject) && !!bounceMatch) ||
    (isBounceFrom && isBounceSubject);

  // Extract original recipient email from bounce message body
  let originalRecipient: string | undefined;
  if (isBounce) {
    const emailRegex = /([a-zA-Z0-9._+-]+@[a-zA-Z0-9._-]+\.[a-zA-Z]{2,})/gi;
    const emails = (textBody || '').match(emailRegex);
    if (emails) {
      // Filter out known system emails and the sender's own address
      originalRecipient = emails.find(
        (e) =>
          !e.toLowerCase().startsWith('postmaster@') &&
          !e.toLowerCase().startsWith('mailer-daemon@') &&
          !e.toLowerCase().includes('noreply') &&
          !e.toLowerCase().includes('no-reply') &&
          !e.toLowerCase().includes('mail-delivery-subsystem') &&
          e.toLowerCase() !== fromLower
      );
    }
  }

  return {
    isBounce,
    originalRecipient,
    bounceReason: bounceMatch || (isBounce ? 'bounce detected from sender/subject' : undefined),
    isHardBounce: !!hardMatch,
  };
}

export function detectAutoReply(
  subject: string | null | undefined,
  headers: Record<string, string>,
  textBody?: string | null
): boolean {
  const autoSubmitted = headers['auto-submitted']?.toLowerCase();
  const precedence = headers['precedence']?.toLowerCase();

  if (autoSubmitted && autoSubmitted !== 'no') return true;
  if (headers['x-autoreply'] || headers['x-autorespond'] || headers['x-auto-response-suppress']) return true;
  if (precedence && ['bulk', 'list', 'auto_reply', 'junk'].includes(precedence)) return true;

  const haystack = `${subject || ''}\n${textBody || ''}`.toLowerCase();
  return /\b(automatic reply|auto reply|out of office|away from the office|vacation|réponse automatique|absence|cong[ée]s?|hors du bureau)\b/i.test(
    haystack
  );
}
