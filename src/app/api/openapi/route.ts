import { NextResponse } from 'next/server';

import { absoluteUrl, siteConfig } from '@/lib/site';

export const dynamic = 'force-static';

export function GET() {
  return NextResponse.json({
    openapi: '3.1.0',
    info: {
      title: `${siteConfig.name} API`,
      version: '0.1.0',
      description: siteConfig.description,
    },
    servers: [{ url: absoluteUrl('/') }],
    paths: {
      '/api/gtm/status': {
        get: {
          summary: 'Get outbound automation status for the active workspace',
          security: [{ supabaseSession: [] }],
          responses: {
            '200': { description: 'Workspace outbound configuration and metrics' },
            '401': { description: 'Unauthorized' },
          },
        },
        post: {
          summary: 'Update outbound automation settings for the active workspace',
          security: [{ supabaseSession: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/GtmSettingsUpdate' },
              },
            },
          },
          responses: {
            '200': { description: 'Settings updated' },
            '400': { description: 'Invalid settings' },
          },
        },
      },
      '/api/gtm/run': {
        post: {
          summary: 'Run outbound prospecting for the active workspace',
          security: [{ supabaseSession: [] }],
          requestBody: {
            required: false,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/GtmRunRequest' },
              },
            },
          },
          responses: {
            '200': { description: 'Outbound run result' },
            '500': { description: 'Run failed' },
          },
        },
      },
      '/api/gtm/review': {
        get: {
          summary: 'List the outbound review queue for the active workspace',
          security: [{ supabaseSession: [] }],
          parameters: [
            {
              name: 'status',
              in: 'query',
              required: false,
              schema: {
                type: 'string',
                enum: ['all', 'pending', 'ready', 'blocked', 'approved', 'rejected', 'queued'],
              },
            },
          ],
          responses: {
            '200': { description: 'Review queue, readiness counts, and email previews' },
          },
        },
        post: {
          summary: 'Approve, reject, hold, or re-enrich outbound prospects',
          security: [{ supabaseSession: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/GtmReviewAction' },
              },
            },
          },
          responses: {
            '200': { description: 'Review action result' },
            '400': { description: 'Invalid action or contact ids' },
          },
        },
      },
      '/api/gtm/isimple-workspace': {
        post: {
          summary: 'Ensure the dedicated isimple workspace exists',
          security: [{ supabaseSession: [] }],
          responses: {
            '200': { description: 'Workspace id returned' },
          },
        },
      },
      '/api/cron/daily-prospecting': {
        get: {
          summary: 'Run daily outbound prospecting for enabled workspaces',
          security: [{ serviceKey: [] }],
          responses: {
            '200': { description: 'Cron run results' },
            '401': { description: 'Unauthorized' },
          },
        },
        post: {
          summary: 'Run daily outbound prospecting for enabled or specified workspace',
          security: [{ serviceKey: [] }],
          requestBody: {
            required: false,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CronProspectingRequest' },
              },
            },
          },
          responses: {
            '200': { description: 'Cron run results' },
            '401': { description: 'Unauthorized' },
          },
        },
      },
      '/api/ai/search-contacts': {
        post: {
          summary: 'Search and extract prospects from a natural language query',
          security: [{ supabaseSession: [] }],
          responses: {
            '200': { description: 'Prospected contacts and duplicate emails' },
          },
        },
      },
      '/api/campaigns/process-sequences': {
        post: {
          summary: 'Process pending campaign sequence emails through SMTP',
          security: [{ serviceKey: [] }],
          responses: {
            '200': { description: 'Sequence processing summary' },
          },
        },
      },
      '/api/webhooks/telegram': {
        post: {
          summary: 'Telegram bot webhook for CRM and outbound commands',
          responses: {
            '200': { description: 'Webhook accepted' },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        supabaseSession: {
          type: 'apiKey',
          in: 'cookie',
          name: 'Supabase auth cookies',
        },
        serviceKey: {
          type: 'apiKey',
          in: 'header',
          name: 'x-service-key',
        },
      },
      schemas: {
        GtmSettingsUpdate: {
          type: 'object',
          properties: {
            enabled: { type: 'boolean' },
            requiresApproval: { type: 'boolean' },
            activeSequenceId: { type: ['string', 'null'], format: 'uuid' },
            dailyLimit: { type: 'integer', minimum: 1, maximum: 100 },
          },
        },
        GtmRunRequest: {
          type: 'object',
          properties: {
            limit: { type: 'integer', minimum: 1, maximum: 100 },
            query: { type: 'string' },
            dryRun: { type: 'boolean' },
          },
        },
        GtmReviewAction: {
          type: 'object',
          required: ['action', 'contactIds'],
          properties: {
            action: {
              type: 'string',
              enum: ['approve_queue', 'reject', 'hold', 'reenrich'],
            },
            contactIds: {
              type: 'array',
              items: { type: 'string', format: 'uuid' },
            },
            source: {
              type: 'string',
              enum: ['web', 'telegram', 'voice', 'system'],
            },
            note: { type: 'string' },
          },
        },
        CronProspectingRequest: {
          type: 'object',
          properties: {
            workspace_id: { type: 'string', format: 'uuid' },
            user_id: { type: 'string', format: 'uuid' },
            limit: { type: 'integer', minimum: 1, maximum: 100 },
            dry_run: { type: 'boolean' },
          },
        },
      },
    },
  });
}
