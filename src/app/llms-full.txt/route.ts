import { NextResponse } from 'next/server';

import { absoluteUrl, siteConfig } from '@/lib/site';

export const dynamic = 'force-static';

export function GET() {
  const body = `# ${siteConfig.name}

${siteConfig.description}

## Core Capabilities

- Workspace-scoped contact CRM for B2B teams.
- AI prospecting from natural language ICP queries.
- AI scoring, meeting prep, reply suggestions, and personalized opening lines.
- SMTP email sending with templates and variables.
- Automatic multi-step campaign sequences and follow-ups.
- IMAP conversation sync, reply detection, bounce awareness, and timeline events.
- Telegram bot commands for CRM status, lead actions, drafting, meeting prep, and GTM autopilot.

## isimple GTM Workflow

The isimple GTM workflow targets French property managers, syndic firms, administrateurs de biens, and real estate operators. A daily job can research about 20 new contacts, dedupe them inside the active workspace, score and personalize the strongest leads, and place them in a human review queue. Approved prospects are queued into the active SMTP sequence; pending, rejected, generic-inbox, missing-email, bounced, opted-out, or unpersonalized prospects remain blocked.

## API And Agent Surfaces

- OpenAPI: ${absoluteUrl('/api/openapi')}
- GTM status: authenticated GET /api/gtm/status
- GTM run: authenticated POST /api/gtm/run
- GTM review queue: authenticated GET/POST /api/gtm/review
- Service cron: service-key protected /api/cron/daily-prospecting
- Telegram webhook: /api/webhooks/telegram
- Sequence processor: service-key protected /api/campaigns/process-sequences

## Security And Data Boundaries

Application data is scoped by workspace. Public AI/SEO/GEO/MCP resources describe the product and API affordances only; they do not expose contacts, emails, campaigns, templates, settings, or credentials.

## Recommended Agent Behavior

Agents should prefer the OpenAPI document for endpoint shape, use service-key routes only in trusted server contexts, and never infer private CRM data from public metadata. For outreach automation, agents should respect suppression fields, bounced emails, replied contacts, and do-not-contact statuses.
`;

  return new NextResponse(body, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
}
