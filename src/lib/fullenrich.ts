import 'server-only';
import { decrypt } from '@/lib/encryption';

const BASE_URL = 'https://app.fullenrich.com';

interface BulkContact {
  firstname: string;
  lastname: string;
  domain?: string;
  company_name?: string;
  linkedin_url?: string;
  enrich_fields: string[];
  custom?: Record<string, string>;
}

interface BulkEnrichmentRequest {
  name: string;
  webhook_url: string;
  datas: BulkContact[];
}

interface BulkEnrichmentResponse {
  enrichment_id: string;
}

interface CreditBalanceResponse {
  credits: number;
}

export interface EnrichmentResultData {
  custom?: Record<string, string>;
  contact?: {
    firstname?: string;
    lastname?: string;
    domain?: string;
    most_probable_email?: string;
    most_probable_email_status?: string;
    most_probable_phone?: string;
    emails?: Array<{ email: string; status: string }>;
    phones?: Array<{ number: string; region?: string }>;
  };
}

export interface EnrichmentResult {
  id: string;
  name: string;
  status: string; // CREATED, IN_PROGRESS, FINISHED, etc.
  datas: EnrichmentResultData[];
}

async function fullenrichFetch<T>(
  apiKeyEncrypted: string,
  path: string,
  options?: RequestInit
): Promise<T> {
  const apiKey = decrypt(apiKeyEncrypted);
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`FullEnrich API error (${res.status}): ${text}`);
  }

  return res.json();
}

export async function startBulkEnrichment(
  apiKeyEncrypted: string,
  contacts: Array<{
    contact_id: string;
    workspace_id: string;
    firstname: string;
    lastname: string;
    domain?: string;
    company_name?: string;
    linkedin_url?: string;
  }>,
  webhookUrl: string
): Promise<string> {
  const datas: BulkContact[] = contacts.map((c) => ({
    firstname: c.firstname,
    lastname: c.lastname,
    domain: c.domain,
    company_name: c.company_name,
    linkedin_url: c.linkedin_url,
    enrich_fields: ['contact.emails', 'contact.phones'],
    custom: {
      contact_id: c.contact_id,
      workspace_id: c.workspace_id,
    },
  }));

  const body: BulkEnrichmentRequest = {
    name: `Orianna CRM enrichment — ${new Date().toISOString()}`,
    webhook_url: webhookUrl,
    datas,
  };

  const result = await fullenrichFetch<BulkEnrichmentResponse>(
    apiKeyEncrypted,
    '/api/v1/contact/enrich/bulk',
    {
      method: 'POST',
      body: JSON.stringify(body),
    }
  );

  return result.enrichment_id;
}

export async function getEnrichmentResult(
  apiKeyEncrypted: string,
  enrichmentId: string
): Promise<EnrichmentResult> {
  return fullenrichFetch<EnrichmentResult>(
    apiKeyEncrypted,
    `/api/v1/contact/enrich/bulk/${enrichmentId}`
  );
}

export async function getCreditBalance(
  apiKeyEncrypted: string
): Promise<number> {
  const result = await fullenrichFetch<CreditBalanceResponse>(
    apiKeyEncrypted,
    '/api/v1/account/credits'
  );
  return result.credits;
}
