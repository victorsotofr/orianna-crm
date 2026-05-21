import type { MetadataRoute } from 'next';

import { absoluteUrl } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/login', '/llms.txt', '/llms-full.txt', '/.well-known/ai-actions', '/.well-known/mcp', '/api/openapi'],
        disallow: ['/dashboard', '/contacts', '/campaigns', '/conversations', '/templates', '/follow-ups', '/settings', '/invite', '/create-workspace'],
      },
      {
        userAgent: ['GPTBot', 'ClaudeBot', 'PerplexityBot'],
        allow: ['/llms.txt', '/llms-full.txt', '/.well-known/ai-actions', '/.well-known/mcp', '/api/openapi'],
        disallow: ['/dashboard', '/contacts', '/campaigns', '/conversations', '/templates', '/follow-ups', '/settings'],
      },
    ],
    sitemap: absoluteUrl('/sitemap.xml'),
  };
}
