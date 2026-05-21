import { NextResponse } from 'next/server';

import { absoluteUrl, siteConfig } from '@/lib/site';

export const dynamic = 'force-static';

export function GET() {
  const body = `# ${siteConfig.name}

${siteConfig.description}

## Public Machine-Readable Resources

- OpenAPI: ${absoluteUrl('/api/openapi')}
- Full AI context: ${absoluteUrl('/llms-full.txt')}
- AI actions manifest: ${absoluteUrl('/.well-known/ai-actions')}
- MCP manifest: ${absoluteUrl('/.well-known/mcp')}

## Product Summary

Orianna CRM is an AI-native outbound CRM for B2B prospecting. It combines Linkup web research, AI scoring and personalization, SMTP sending, IMAP reply detection, campaign sequences, and Telegram operations.

Private CRM data is not exposed through public resources. Authenticated API routes require user session cookies or service-key headers depending on the endpoint.
`;

  return new NextResponse(body, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
}
