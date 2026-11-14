# Orianna CRM

A B2B prospecting CRM built by [Victor Soto](https://github.com/victorsotofr). It brings contact research, personalized outreach, email sequences, and conversations into a shared workspace, with French and English interfaces.

## Capabilities

- Import contacts from CSV, research companies and people with Linkup, and enrich contact details with FullEnrich.
- Score prospects and draft personalized opening lines, replies, and meeting briefings with AI.
- Create email templates and multi-step sequences; send through user-configured SMTP and track replies through IMAP.
- Manage threaded conversations, follow-ups, contact timelines, and team dashboards.
- Connect Google Calendar through OAuth for availability and meeting management.
- Review prospects before outreach, with Telegram notifications and operator actions for the isimple prospecting workflow.

These capabilities require their corresponding services and configuration. Cloning the repository does not activate scheduled prospecting or email delivery.

## Stack and architecture

| Area | Implementation |
|---|---|
| Application | Next.js 16 App Router, React 19, TypeScript |
| UI | Tailwind CSS, Radix UI, TipTap |
| Data and identity | Supabase PostgreSQL, Auth, row-level security |
| AI | Vercel AI SDK with OpenAI and Anthropic integrations |
| Research and enrichment | Linkup, FullEnrich |
| Email | Nodemailer for SMTP; IMAPFlow for mailbox synchronization |
| Background work | Supabase Edge Functions and configured cron jobs |
| Hosting | Vercel, with Supabase services |

Workspace membership and `workspace_id` scope shared CRM data. SMTP/IMAP settings are per user. Sensitive stored credentials are encrypted using the server-side `ENCRYPTION_KEY`; the Supabase service-role key must also remain server-side.

### AI behavior

The shared provider helper selects OpenAI when `OPENAI_API_KEY` is configured, otherwise Anthropic. Model overrides are listed in `.env.example`; this is configuration-based selection, not automatic failover on every provider error.

For contact scoring and personalization, Linkup supplies external research when configured. Without successful Linkup research, the OpenAI path uses existing CRM context; the Anthropic path can use its web-search tool. The application does not always perform a fresh web search. Additional outreach-agent code and provider configuration live alongside these task-specific helpers.

## Local setup

Use a supported Node.js release for Next.js 16 (Node.js 22 is a suitable baseline), npm, and a Supabase project.

```bash
git clone https://github.com/victorsotofr/orianna-crm.git
cd orianna-crm
npm ci
cp .env.example .env.local
```

1. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and a private, stable `ENCRYPTION_KEY` in `.env.local`.
2. Review and apply the numbered SQL migrations in `supabase/migrations/` in order. `ROLLBACK_*.sql` files are rollback scripts, not forward migrations. Review scheduling statements before execution: migrations 010 and 013 contain project/key placeholders and require Supabase `pg_cron` and `pg_net` extensions. Substitute credentials only in the private deployment environment, never in committed SQL.
3. Configure Supabase Auth for your local and deployed URLs. Sign in and create or join a workspace through the application.
4. Configure the integrations you need, then start the app:

```bash
npm run dev
```

Open http://localhost:3000. API keys, email credentials, and connected accounts are not bundled with the repository.

### Integration configuration

`.env.example` is the configuration reference; do not commit `.env.local`.

| Capability | Configuration |
|---|---|
| AI generation | `OPENAI_API_KEY` and/or `ANTHROPIC_API_KEY`; optional model overrides |
| Research and enrichment | Linkup and FullEnrich keys in the application's integration settings; server-side workflows also use environment configuration |
| Sending and replies | Per-user SMTP and IMAP settings in the application |
| Google Calendar | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and matching OAuth redirect configuration |
| Tracking and scheduled routes | `NEXT_PUBLIC_APP_URL`, `TRACKING_SECRET`, `CRON_SECRET` |
| Telegram | `TELEGRAM_BOT_TOKEN`, account/chat setup, and a configured webhook |

Keep the same encryption key when retaining encrypted records; changing it prevents existing credentials from being decrypted.

## Automation and deployment

Import the repository into Vercel and configure the relevant environment variables, Supabase Auth URLs, and external OAuth/webhook URLs for that deployment.

Deploy the `check-replies` and `process-sequences` Supabase Edge Functions when using those background features. Configure their service credentials and schedules separately. The SQL templates propose reply checks every 15 minutes and sequence processing every 5 minutes; their presence does not prove that either job is deployed or running.

`vercel.json` declares a daily Telegram digest route at 07:00 UTC. It does not schedule daily GTM prospecting. That workflow has its own run endpoint, workspace configuration, and operator controls; scheduling it requires an explicitly configured caller.

The isimple workspace initializer defaults GTM automation to disabled and review required. Depending on the selected run mode and workspace settings, a run can discover prospects, prepare them for review, or approve and enroll them automatically. Do not treat every run as an unsupervised send. Contact send checks apply separately to GTM-sourced prospects.

## Development

```bash
npm run dev          # Local development
npx tsc --noEmit     # TypeScript check
npm run test:unit    # Unit tests
npm run test:e2e     # Playwright tests; inspect test configuration first
npm run build       # Production build
npm run start       # Serve the production build
npm run lint        # ESLint
```

The app lives in `src/`; database migrations and Edge Functions are in `supabase/`. The older [audit report](AUDIT_REPORT.md) describes the pre-flattening repository layout and is retained as historical context, not current setup instructions.

## License

No license file is currently included in this repository.
