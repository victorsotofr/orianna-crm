import 'server-only';
import { LinkupClient } from 'linkup-sdk';
import { decrypt } from '@/lib/encryption';
import { DEFAULT_LINKUP_COMPANY_QUERY, DEFAULT_LINKUP_CONTACT_QUERY, DEFAULT_LINKUP_PROSPECTING_QUERY } from '@/lib/ai-defaults';

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

  const response = await client.search({
    query,
    depth,
    outputType: 'sourcedAnswer',
  });

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
  customQuery?: string
): Promise<string> {
  const apiKey = decrypt(apiKeyEncrypted);
  const client = new LinkupClient({ apiKey });

  const linkedinPart = linkedinUrl ? ` LinkedIn: ${linkedinUrl}` : '';
  const template = customQuery || DEFAULT_LINKUP_CONTACT_QUERY;
  const query = template
    .replace(/\{contactName\}/g, contactName)
    .replace(/\{companyName\}/g, companyName)
    .replace(/\{linkedinPart\}/g, linkedinPart);

  const response = await client.search({
    query,
    depth: 'standard',
    outputType: 'sourcedAnswer',
  });

  return typeof response === 'string' ? response : (response as any).answer || JSON.stringify(response);
}

export async function searchProspecting(
  apiKeyEncrypted: string,
  userQuery: string,
  customTemplate?: string | null
): Promise<string> {
  const apiKey = decrypt(apiKeyEncrypted);
  const client = new LinkupClient({ apiKey });

  // Keep the search query concise — Linkup works best with focused queries.
  // The user's query IS the search; the template just adds output format instructions.
  const instructions = customTemplate
    || `Find real professionals matching this criteria. For each person found, extract: full name, company, job title, email (if visible), location, LinkedIn URL, company domain. Only include real people with verifiable data.`;

  const searchQuery = `${instructions}\n\n${userQuery}`;

  const response = await client.search({
    query: searchQuery,
    depth: 'standard',
    outputType: 'sourcedAnswer',
  });

  return typeof response === 'string' ? response : (response as any).answer || JSON.stringify(response);
}
