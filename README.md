# Orianna CRM

A full-stack email automation and CRM platform for outbound cold emailing with contact management, multi-step sequences, campaign tracking, and team collaboration.

## Tech Stack

- **Framework**: Next.js 16, React 19, TypeScript
- **Database**: Supabase (PostgreSQL + Auth + Edge Functions)
- **UI**: Tailwind CSS, shadcn/ui, Radix UI
- **Email**: Nodemailer (SMTP), IMAPFlow (reply detection)
- **Deployment**: Vercel

## Quick Start

```bash
# Install dependencies
npm install

# Create .env.local with your Supabase keys
cp .env.example .env.local  # then edit with your values

# Start development server
npm run dev
```

Visit http://localhost:3000

## Environment Variables

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
ENCRYPTION_KEY=your-encryption-key
```

## Project Structure

```
orianna-crm/
├── src/
│   ├── app/                  # Next.js App Router
│   │   ├── api/              # REST API routes
│   │   ├── contacts/         # Contact management pages
│   │   ├── sequences/        # Email sequence pages
│   │   ├── templates/        # Template management
│   │   ├── dashboard/        # Analytics dashboard
│   │   ├── settings/         # User settings (SMTP/IMAP)
│   │   └── login/            # Authentication
│   ├── components/           # React components
│   │   └── ui/               # shadcn/ui primitives
│   ├── lib/                  # Utilities
│   │   ├── supabase.ts       # Supabase client
│   │   ├── email-sender.ts   # Nodemailer integration
│   │   ├── encryption.ts     # AES encryption
│   │   └── template-renderer.ts
│   ├── types/                # TypeScript types
│   └── hooks/                # React hooks
├── supabase/
│   ├── migrations/           # SQL migration files (000-010)
│   └── functions/            # Edge Functions
│       ├── process-sequences/
│       └── check-replies/
├── scripts/                  # Utility scripts
├── public/                   # Static assets
└── middleware.ts             # Auth middleware
```

## Features

- **Contact Management**: Import via CSV, track status, assign to team members, timeline view
- **Email Sequences**: Multi-step automated sequences with wait periods and manual tasks
- **Template System**: Database-stored templates with `{{variable}}` substitution
- **SMTP/IMAP Config**: Per-user encrypted credentials, connection testing
- **Dashboard**: Team and personal stats, recent activity
- **Security**: Row Level Security, AES-encrypted passwords, daily send limits

## Database Migrations

Migrations are in `supabase/migrations/` and should be run in order (000-010). See [MIGRATION.md](./MIGRATION.md) for details.

## Deployment

1. Push to GitHub
2. Import in Vercel (root directory: `.`)
3. Add environment variables
4. Deploy

## Scripts

```bash
npm run dev       # Start dev server
npm run build     # Production build
npm run start     # Start production server
npm run lint      # Run ESLint
```
