import { NextResponse } from 'next/server';

import { absoluteUrl, siteConfig } from '@/lib/site';

export const dynamic = 'force-static';

export function GET() {
  return NextResponse.json({
    schema_version: '2026-05-21',
    name: siteConfig.name,
    description: siteConfig.description,
    openapi: absoluteUrl('/api/openapi'),
    llms: absoluteUrl('/llms.txt'),
    actions: [
      {
        id: 'get_gtm_status',
        name: 'Get GTM autopilot status',
        method: 'GET',
        endpoint: absoluteUrl('/api/gtm/status'),
        auth: 'authenticated_session',
      },
      {
        id: 'run_gtm_prospecting',
        name: 'Run GTM prospecting',
        method: 'POST',
        endpoint: absoluteUrl('/api/gtm/run'),
        auth: 'authenticated_session',
        input_schema: {
          type: 'object',
          properties: {
            limit: { type: 'integer', minimum: 1, maximum: 100 },
            query: { type: 'string' },
            dryRun: { type: 'boolean' },
          },
        },
      },
      {
        id: 'daily_gtm_cron',
        name: 'Run enabled GTM workspaces',
        method: 'POST',
        endpoint: absoluteUrl('/api/cron/daily-prospecting'),
        auth: 'service_key',
      },
    ],
  });
}
