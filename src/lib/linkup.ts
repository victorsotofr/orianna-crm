import 'server-only';
import { LinkupClient } from 'linkup-sdk';
import { decrypt } from '@/lib/encryption';

export async function searchCompany(
  apiKeyEncrypted: string,
  companyName: string,
  domain?: string | null,
  depth: 'deep' | 'standard' = 'deep'
): Promise<string> {
  const apiKey = decrypt(apiKeyEncrypted);
  const client = new LinkupClient({ apiKey });

  const domainPart = domain ? ` (${domain})` : '';
  const query = `Company info for ${companyName}${domainPart}: size, funding, recent news, growth signals, industry`;

  const response = await client.search({
    query,
    depth,
    outputType: 'sourcedAnswer',
  });

  return typeof response === 'string' ? response : (response as any).answer || JSON.stringify(response);
}

export async function searchContact(
  apiKeyEncrypted: string,
  contactName: string,
  companyName: string,
  linkedinUrl?: string | null
): Promise<string> {
  const apiKey = decrypt(apiKeyEncrypted);
  const client = new LinkupClient({ apiKey });

  const linkedinPart = linkedinUrl ? ` LinkedIn: ${linkedinUrl}` : '';
  const query = `Professional background of ${contactName} at ${companyName}: role, career, recent activity${linkedinPart}`;

  const response = await client.search({
    query,
    depth: 'standard',
    outputType: 'sourcedAnswer',
  });

  return typeof response === 'string' ? response : (response as any).answer || JSON.stringify(response);
}
