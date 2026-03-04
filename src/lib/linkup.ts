import 'server-only';
import { LinkupClient } from 'linkup-sdk';
import { decrypt } from '@/lib/encryption';
import { DEFAULT_LINKUP_COMPANY_QUERY, DEFAULT_LINKUP_CONTACT_QUERY, DEFAULT_LINKUP_PROSPECTING_QUERY } from '@/lib/ai-defaults';

const RETRYABLE_STATUS_CODES = [502, 503, 504];
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 3000;

async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      const status = err?.statusCode ?? err?.status;
      const isRetryable = RETRYABLE_STATUS_CODES.some(s => String(err?.message ?? '').includes(String(s))) || RETRYABLE_STATUS_CODES.includes(status);
      if (isRetryable && attempt < MAX_RETRIES) {
        const delay = RETRY_DELAY_MS * (attempt + 1);
        console.warn(`[Linkup] ${label} attempt ${attempt + 1} failed (${status || 'timeout'}), retrying in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw new Error(`[Linkup] ${label} failed after ${MAX_RETRIES + 1} attempts`);
}

export async function searchCompany(
  apiKeyEncrypted: string,
  companyName: string,
  domain?: string | null,
  depth: 'deep' | 'standard' = 'deep',
  customQuery?: string
): Promise<string> {
  const apiKey = decrypt(apiKeyEncrypted);
  const client = new LinkupClient({ apiKey });

  const domainPart = domain ? ` (${domain})` : '';
  const template = customQuery || DEFAULT_LINKUP_COMPANY_QUERY;
  const query = template
    .replace(/\{companyName\}/g, companyName)
    .replace(/\{domainPart\}/g, domainPart);

  const response = await withRetry(
    () => client.search({ query, depth, outputType: 'sourcedAnswer' }),
    `searchCompany(${companyName})`
  );

  return typeof response === 'string' ? response : (response as any).answer || JSON.stringify(response);
}

export async function getLinkupCreditBalance(
  apiKeyEncrypted: string
): Promise<number> {
  const apiKey = decrypt(apiKeyEncrypted);
  const res = await fetch('https://api.linkup.so/v1/credits/balance', {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Linkup API error (${res.status}): ${text}`);
  }

  const data = await res.json();
  return typeof data === 'number' ? data : data.balance ?? data.credits ?? 0;
}

export async function searchContact(
  apiKeyEncrypted: string,
  contactName: string,
  companyName: string,
  linkedinUrl?: string | null,
  customQuery?: string,
  depth: 'deep' | 'standard' = 'standard',
  title?: string | null,
  location?: string | null,
): Promise<string> {
  const apiKey = decrypt(apiKeyEncrypted);
  const client = new LinkupClient({ apiKey });

  const linkedinPart = linkedinUrl
    ? `If available, also check their LinkedIn profile: ${linkedinUrl}`
    : 'Search for their LinkedIn profile to verify identity';
  const titlePart = title ? `\nKnown title: ${title}` : '';
  const locationPart = location ? `\nKnown location: ${location}` : '';
  const template = customQuery || DEFAULT_LINKUP_CONTACT_QUERY;
  const query = template
    .replace(/\{contactName\}/g, contactName)
    .replace(/\{companyName\}/g, companyName)
    .replace(/\{linkedinPart\}/g, linkedinPart)
    .replace(/\{titlePart\}/g, titlePart)
    .replace(/\{locationPart\}/g, locationPart);

  const response = await withRetry(
    () => client.search({ query, depth, outputType: 'sourcedAnswer' }),
    `searchContact(${contactName})`
  );

  return typeof response === 'string' ? response : (response as any).answer || JSON.stringify(response);
}

export async function searchProspecting(
  apiKeyEncrypted: string,
  userQuery: string,
  customTemplate?: string | null,
  depth: 'standard' | 'deep' = 'standard'
): Promise<string> {
  const apiKey = decrypt(apiKeyEncrypted);
  const client = new LinkupClient({ apiKey });

  // Keep the search query concise — Linkup works best with focused queries.
  // The user's query IS the search; the template just adds output format instructions.
  const instructions = customTemplate
    || `Find real professionals matching this criteria. For each person found, extract: full name, company, job title, email (if visible), location, LinkedIn URL, company domain. Only include real people with verifiable data.`;

  const searchQuery = `${instructions}\n\n${userQuery}`;

  const response = await withRetry(
    () => client.search({ query: searchQuery, depth, outputType: 'sourcedAnswer' }),
    `searchProspecting(${depth})`
  );

  return typeof response === 'string' ? response : (response as any).answer || JSON.stringify(response);
}
