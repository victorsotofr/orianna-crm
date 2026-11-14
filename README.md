# Orianna CRM

A B2B prospecting CRM built by [Victor Soto](https://github.com/victorsotofr), combining AI research, personalized emails, and automated follow-ups. Shared workspaces, with French and English interfaces.

## What it does

- Import, research, enrich, and score prospects.
- Draft personalized emails and run multi-step follow-up sequences.
- Keep conversations, contact history, and meeting preparation in one place.
- Review prospects and manage outreach through the app and Telegram.

**Stack:** Next.js · React · TypeScript · Supabase · Vercel AI SDK · OpenAI / Anthropic · Linkup · FullEnrich · SMTP / IMAP.

## Run locally

```bash
git clone https://github.com/victorsotofr/orianna-crm.git
cd orianna-crm
npm ci
cp .env.example .env.local
# Configure Supabase, apply migrations, and set up the integrations you need.
npm run dev
```

See [setup and deployment](docs/setup.md) for the required configuration. Scheduled outreach needs explicit setup; cloning the repository does not start sending emails.

## Development

```bash
npx tsc --noEmit
npm run test:unit
npm run build
```

- [Architecture and AI behavior](docs/architecture.md)
- [Historical audit](AUDIT_REPORT.md) — describes an older repository layout.

No license file is currently included.
