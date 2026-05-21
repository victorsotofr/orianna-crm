import { NextResponse } from 'next/server';

import { absoluteUrl, siteConfig } from '@/lib/site';

export const dynamic = 'force-static';

export function GET() {
  return NextResponse.json({
    name: siteConfig.name,
    version: '0.1.0',
    description: 'MCP-ready manifest for Orianna CRM public agent surfaces.',
    protocol: 'modelcontextprotocol',
    openapi: absoluteUrl('/api/openapi'),
    llms: {
      concise: absoluteUrl('/llms.txt'),
      full: absoluteUrl('/llms-full.txt'),
    },
    auth: {
      user_routes: 'Supabase authenticated session cookies',
      service_routes: 'x-service-key or Bearer service token',
    },
    resources: [
      {
        name: 'GTM Status',
        uri: absoluteUrl('/api/gtm/status'),
        mimeType: 'application/json',
      },
      {
        name: 'OpenAPI',
        uri: absoluteUrl('/api/openapi'),
        mimeType: 'application/json',
      },
    ],
  });
}
