# Orianna CRM

> Your AI-powered outbound sales copilot. Built for teams who'd rather close deals than wrestle with spreadsheets.

Orianna is a full-stack B2B prospecting CRM that combines contact management, email campaigns, and AI-driven personalization into one sleek tool. Import your leads, let Claude score and research them, craft personalized emails at scale, and track everything — all from a single dashboard.

## What Makes It Fun

- **AI Lead Scoring** — Claude scours the web, scores your contacts 0–100 across seniority, company fit, growth signals & digital presence, and slaps a `HOT` / `WARM` / `COLD` label on them. No more gut feelings.
- **AI Personalization** — One click generates a tailor-made opening line per contact, backed by real web research. Drop `{{ai_personalized_line}}` into any template and watch your reply rates climb.
- **Rich Email Templates** — TipTap-powered WYSIWYG editor with 20+ dynamic variables (`{{first_name}}`, `{{company_name}}`, `{{ai_score_label}}`…). Write once, send to thousands.
- **Campaign Engine** — Bulk send with built-in throttling (45s delay between emails), daily limits, open tracking pixels, and reply detection via IMAP polling.
- **CSV Import on Steroids** — Auto-detects headers in French or English, normalizes statuses, skips duplicates. Drag, drop, done.
- **Team Dashboard** — Real-time KPIs: total contacts, hot leads, daily sends, reply rate, per-member breakdown. Everyone stays in the loop.

## Tech Stack

| Layer | Tech |
|-------|------|
| **Framework** | Next.js 16, React 19, TypeScript |
| **Database** | Supabase (PostgreSQL + Auth + Edge Functions + RLS) |
| **AI** | Claude Sonnet via Vercel AI SDK + Anthropic web search |
| **UI** | Tailwind CSS, shadcn/ui, Radix UI, TipTap editor |
| **Email** | Nodemailer (SMTP send), IMAPFlow (reply detection) |
| **Security** | AES-256 encrypted credentials, Row Level Security, HMAC-signed tracking |
| **Deployment** | Vercel |

## Quick Start

```bash
# Install dependencies
npm install

# Create .env.local with your Supabase + Anthropic keys
cp .env.example .env.local  # then fill in your values

# Start development server
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000)

## Environment Variables

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
ENCRYPTION_KEY=your-encryption-key
ANTHROPIC_API_KEY=your-anthropic-key
```

## Project Structure

```
orianna-crm/
├── src/
│   ├── app/                     # Next.js App Router
│   │   ├── api/                 # REST API routes
│   │   │   ├── ai/              # AI scoring & personalization
│   │   │   ├── contacts/        # CRUD, bulk ops, CSV import
│   │   │   ├── campaigns/       # Email campaign dispatch
│   │   │   ├── templates/       # Template CRUD
│   │   │   └── ...
│   │   ├── (app)/               # Authenticated app shell
│   │   │   ├── contacts/        # Contact list, detail, import, new
│   │   │   ├── campaigns/       # Campaign management
│   │   │   ├── templates/       # Template editor & list
│   │   │   ├── dashboard/       # Analytics & KPIs
│   │   │   └── settings/        # SMTP/IMAP config
│   │   └── login/               # Auth page
│   ├── components/              # React components
│   │   └── ui/                  # shadcn/ui primitives
│   ├── lib/                     # Core utilities
│   │   ├── supabase.ts          # Supabase clients (browser + service role)
│   │   ├── supabase-server.ts   # SSR cookie-based auth client
│   │   ├── ai-personalization.ts # Two-pass AI personalization engine
│   │   ├── email-sender.ts      # Nodemailer SMTP integration
│   │   ├── encryption.ts        # AES encrypt/decrypt for credentials
│   │   └── template-renderer.ts # {{variable}} replacement engine
│   ├── types/                   # TypeScript interfaces
│   └── hooks/                   # React hooks
├── supabase/
│   ├── migrations/              # SQL migrations
│   └── functions/               # Edge Functions
│       └── check-replies/       # IMAP reply detection (cron)
└── middleware.ts                # Auth middleware
```

## Features at a Glance

### Contacts
- Full CRUD with inline editing from the table view
- CSV bulk import (auto-detect headers, skip dupes)
- Status pipeline: `new` → `contacted` → `replied` → `qualified` / `unqualified`
- Activity timeline with comments
- Assign contacts to team members
- Bulk actions: score, personalize, assign, delete

### AI
- **Lead Scoring**: 4-axis scoring (seniority, relevance, growth, digital presence) with web search context
- **Personalization**: Two-pass engine — research via web search, then clean sentence generation. No leaked reasoning, no hallucinations.

### Email
- WYSIWYG template editor with 20+ contact variables
- Campaign bulk send with throttling & daily limits
- Open tracking (HMAC-signed pixel)
- Reply detection via IMAP polling
- Per-user SMTP/IMAP configuration with encrypted credentials

### Dashboard
- Team & personal views
- KPIs: contacts, hot leads, daily sends, reply rate
- Per-member stats breakdown
- Recent activity feed

## Scripts

```bash
npm run dev       # Dev server (Turbopack)
npm run build     # Production build
npm run start     # Start production server
npm run lint      # ESLint
```

## Deployment

1. Push to GitHub
2. Import in Vercel
3. Add environment variables
4. Deploy — that's it

## License

Private — all rights reserved.
