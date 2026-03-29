# Orianna CRM

> Your AI-powered outbound sales copilot. Built for teams who'd rather close deals than wrestle with spreadsheets.

Orianna is a full-stack B2B prospecting CRM that combines contact management, email sequences, conversations, and AI-driven personalization into one sleek tool. Import your leads, let Claude score and research them, craft personalized emails at scale, automate multi-step follow-ups, and track everything — all from a single dashboard.

## What Makes It Fun

- **AI Contact Prospecting** — Type what you're looking for in plain language ("Find real estate agency directors in Paris"), and Linkup searches the web for matching contacts. Preview results, pick the ones you want, import in one click.
- **AI Lead Scoring** — Claude + Linkup scour the web, score your contacts 0–100 across seniority, company fit, growth signals & digital presence, and slap a `HOT` / `WARM` / `COLD` label on them. No more gut feelings.
- **AI Personalization** — One click generates a tailor-made opening line per contact, backed by real web research. Drop `{{ai_personalized_line}}` into any template and watch your reply rates climb.
- **AI Meeting Prep** — Before any call, generate a comprehensive briefing with company summary, talking points, suggested questions, and red flags — powered by CRM data + Linkup web research + Claude.
- **Email Sequences** — Build 3-step automated sequences (first contact → first follow-up → last contact) with configurable delays. Enroll contacts, launch, pause, resume — the sequence engine runs every 5 minutes and handles the rest.
- **Conversations** — Full email inbox with threaded conversations, IMAP sync, and AI-powered reply suggestions. See all inbound and outbound messages in one place, linked to your contacts.
- **Auto Bounce Recovery** — Automatically detect email bounces (NDR/DSN), mark contacts, and recover with FullEnrich email finder. Found a new email? The original message is auto-resent.
- **Google Calendar** — Connect via OAuth, view your availability, and create meetings directly from conversation threads.
- **Contact Enrichment** — FullEnrich finds verified emails and phone numbers for your contacts in the background. Verified data always takes priority over guesses.
- **Rich Email Templates** — TipTap-powered WYSIWYG editor with 20+ dynamic variables (`{{first_name}}`, `{{company_name}}`, `{{ai_score_label}}`…). Write once, send to thousands.
- **Follow-Up Tracking** — Dedicated follow-ups page shows which contacts need a first or second follow-up, with bulk send actions.
- **CSV Import on Steroids** — Auto-detects headers in French or English, normalizes statuses, skips duplicates. Drag, drop, done.
- **Multi-Tenant Workspaces** — Invite your team, share contacts, and keep data isolated between organizations. Role-based access (admin / member).
- **Team Dashboard** — Real-time KPIs: total contacts, hot leads, daily sends, reply rate, per-member breakdown. Everyone stays in the loop.
- **Bilingual** — Full French / English UI toggle, saved per user.

## Tech Stack

| Layer | Tech |
|-------|------|
| **Framework** | Next.js 16, React 19, TypeScript |
| **Database** | Supabase (PostgreSQL + Auth + Edge Functions + RLS) |
| **AI** | Claude Sonnet 4.5 via Vercel AI SDK |
| **Web Research** | Linkup API (agentic web search) |
| **Enrichment** | FullEnrich API (verified emails & phones) |
| **Calendar** | Google Calendar API (OAuth 2.0) |
| **UI** | Tailwind CSS, shadcn/ui, Radix UI, TipTap editor |
| **Email** | Nodemailer (SMTP send), IMAPFlow (sync & reply detection) |
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
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
```

## Project Structure

```
orianna-crm/
├── src/
│   ├── app/                     # Next.js App Router
│   │   ├── api/                 # REST API routes (~60 endpoints)
│   │   │   ├── ai/              # AI scoring, personalization, prospecting
│   │   │   ├── campaigns/       # Campaign dispatch + sequence automation
│   │   │   ├── contacts/        # CRUD, bulk ops, CSV import, enrichment
│   │   │   ├── conversations/   # Threaded inbox, sync, AI reply suggestions
│   │   │   ├── google-calendar/ # Calendar events, free/busy
│   │   │   ├── templates/       # Template CRUD
│   │   │   ├── settings/        # SMTP/IMAP, Google Calendar OAuth, integrations
│   │   │   ├── webhooks/        # FullEnrich result callbacks
│   │   │   ├── cron/            # Scheduled jobs (sequence processing)
│   │   │   └── ...
│   │   ├── (app)/               # Authenticated app shell
│   │   │   ├── contacts/        # Contact list, detail, import, new
│   │   │   ├── campaigns/       # Campaigns + email sequences
│   │   │   ├── conversations/   # Email inbox & threads
│   │   │   ├── templates/       # Template editor & list
│   │   │   ├── follow-ups/      # Follow-up tracking & bulk send
│   │   │   ├── dashboard/       # Analytics & KPIs
│   │   │   └── settings/        # SMTP/IMAP, integrations, AI prompts, calendar
│   │   └── login/               # Auth page
│   ├── components/              # React components
│   │   └── ui/                  # shadcn/ui primitives
│   ├── lib/                     # Core utilities
│   │   ├── supabase.ts          # Supabase clients (browser + service role)
│   │   ├── supabase-server.ts   # SSR cookie-based auth client
│   │   ├── ai-personalization.ts # Two-pass AI personalization engine
│   │   ├── ai-scoring.ts        # AI lead scoring engine
│   │   ├── ai-defaults.ts       # Default prompts & query templates
│   │   ├── linkup.ts            # Linkup web search (company, contact, prospecting)
│   │   ├── email-sender.ts      # Nodemailer SMTP integration
│   │   ├── mailbox-sync.ts      # IMAP synchronization (inbox threading)
│   │   ├── mailbox-store.ts     # Persist synced messages to DB
│   │   ├── mailbox-utils.ts     # Message parsing, normalization, threading
│   │   ├── google-calendar.ts   # Google Calendar API wrapper
│   │   ├── google-oauth.ts      # OAuth 2.0 flow for Google
│   │   ├── encryption.ts        # AES encrypt/decrypt for credentials
│   │   ├── workspace.ts         # Multi-tenant workspace context
│   │   ├── background-jobs.tsx  # Background job UI state tracking
│   │   ├── i18n/                # FR / EN translations
│   │   └── template-renderer.ts # {{variable}} replacement engine
│   ├── types/                   # TypeScript interfaces
│   └── hooks/                   # React hooks
├── supabase/
│   ├── migrations/              # SQL migrations
│   └── functions/               # Edge Functions
│       ├── check-replies/       # IMAP reply detection (every 15 min)
│       └── process-sequences/   # Sequence email sending (every 5 min)
└── middleware.ts                # Auth middleware
```

## Features at a Glance

### Contacts
- Full CRUD with inline editing from the table view
- CSV bulk import (auto-detect headers, skip dupes)
- AI-powered prospecting: search for new contacts with natural language
- FullEnrich integration: find verified emails & phone numbers
- Status pipeline: `new` → `contacted` → `engaged` → `qualified` → `meeting_scheduled` → `opportunity` → `customer` / `lost`
- Auto bounce detection: bounced emails flagged, contacts marked, recovery via FullEnrich
- Activity timeline with comments
- Assign contacts to team members
- Bulk actions: score, personalize, enrich, assign, update status, delete

### AI
- **Prospecting**: Describe who you're looking for, Linkup finds them on the web, preview & import
- **Lead Scoring**: 4-axis scoring (seniority, relevance, growth, digital presence) with Linkup web research
- **Personalization**: Two-pass engine — Linkup researches company & contact, then Claude generates a clean opening line
- **Reply Suggestions**: AI-generated reply drafts in conversations, based on thread context
- **Meeting Prep**: Generate AI-powered briefings before calls with company summary, engagement recap, talking points, questions, and red flags. Stored in contact timeline for reuse.
- **Meeting Extraction**: Pull meeting details from conversation threads into calendar events
- **Customizable prompts**: Fine-tune every AI prompt and search query from Settings

### Email Sequences
- 3-step automated sequences: Premier Contact → Première Relance → Dernier Contact
- Configurable delays between steps (default: 0, 3, 7 days)
- Sequence lifecycle: `draft` → `active` → `paused` → `archived`
- Per-contact enrollment tracking: `active`, `paused`, `completed`, `bounced`
- Automatic processing every 5 minutes via Edge Function cron
- Manual send option for immediate dispatch

### Conversations
- IMAP-synced inbox with threaded message view
- Inbound & outbound message tracking
- Contact association for each thread
- AI-powered reply suggestions
- Meeting prep briefings (per-thread or per-contact)
- Auto bounce detection with email recovery flow
- Meeting extraction from thread context
- Per-user sync state with error tracking
- Auto-refresh polling (60s)

### Email
- WYSIWYG template editor with 20+ contact variables
- Campaign bulk send with throttling & daily limits
- BCC toggle for campaign sends
- Open tracking (HMAC-signed pixel)
- Reply detection via IMAP polling
- Per-user SMTP/IMAP configuration with encrypted credentials

### Follow-Ups
- Dedicated page showing contacts due for first and second follow-ups
- Auto-calculated follow-up dates based on first contact timestamp
- Bulk send actions for each follow-up stage

### Dashboard
- Team & personal views
- KPIs: contacts, hot leads, daily sends, reply rate
- Per-member stats breakdown
- Recent activity feed

### Workspace & Team
- Multi-tenant workspaces with invite system
- Role-based access: admin / member
- Shared contacts, templates, and campaigns within a workspace
- Per-user API keys and AI prompts

### Google Calendar
- OAuth 2.0 connection flow from Settings
- View calendars and check availability (free/busy)
- Create, update, and delete events
- Link events to contacts and conversation threads

## How to Use It

A typical workflow from setup to sending your first campaign:

### 1. Set Up Your Account

After logging in for the first time, head to **Settings**:

- **Email** — Enter your SMTP server credentials (host, port, username, password). This is required to send emails. If your organization uses IMAP for reply tracking, configure that too.
- **Integrations** — Paste your API keys for **FullEnrich** (contact enrichment) and **Linkup** (AI web search). Both are optional but unlock the best features.
- **Google Calendar** — Connect your Google account to enable calendar features.
- **Preferences** — Set your daily send limit and preferred language (French or English).

### 2. Build Your Contact List

You have three ways to add contacts:

- **CSV Import** — Go to Contacts, click **CSV**, drag & drop your file. Orianna auto-detects column headers and skips duplicates.
- **Search with AI** — Click **Search with AI**, describe who you're looking for in plain language (e.g. "Marketing directors at SaaS companies in Lyon"). Linkup searches the web, shows you what it found, and you pick which contacts to import.
- **Manual** — Click **New** to add contacts one by one.

### 3. Enrich & Score Your Contacts

Select contacts in the table, then use the bulk action bar at the bottom:

- **Enrich** — Sends contacts to FullEnrich to find verified email addresses and phone numbers. This runs in the background and takes a few minutes.
- **ICP AI Score** — Claude + Linkup research each contact's company and role, then assign a score from 0 to 100. Contacts are labeled HOT / WARM / COLD automatically.
- **Personalize** — Generates a one-line personalized opener for each contact, based on real web research about them and their company.

### 4. Create Email Templates

Go to **Templates** and create your email templates using the rich text editor. Use dynamic variables like:

- `{{first_name}}`, `{{last_name}}`, `{{company_name}}` — basic contact info
- `{{ai_personalized_line}}` — the AI-generated opening line
- `{{ai_score_label}}` — HOT / WARM / COLD label

### 5. Send Campaigns or Set Up Sequences

**One-off campaigns**: Go to **Campaigns**, create a new campaign, pick a template, select your target contacts, and send.

**Automated sequences**: Create a sequence with 3 email steps and configurable delays. Enroll your contacts, launch the sequence, and Orianna sends each step automatically on schedule.

Both methods handle throttled sending, daily limits, open tracking, and reply detection.

### 6. Manage Conversations

Check the **Conversations** page to see threaded email exchanges with your contacts. Orianna syncs your inbox via IMAP and groups messages into threads. Use AI-powered reply suggestions to draft responses quickly.

### 7. Track Results

Your **Dashboard** shows real-time stats: emails sent today, open rate, reply rate, hot leads count, and a per-team-member breakdown. The **Follow-ups** page shows which contacts are due for their next touch.

### Tips

- **Customize AI behavior** — In Settings > Integrations, click "Configure" to open the AI Prompts panel. You can fine-tune every prompt Claude and Linkup use, and enhance them with AI.
- **Invite your team** — In Settings > Members, invite colleagues by email. They'll join your workspace and see the same contacts.
- **Filter smartly** — Use the status and owner filters on the Contacts page to focus on what matters. The "ICP Leads" view shows only hot-scored contacts.

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

MIT
