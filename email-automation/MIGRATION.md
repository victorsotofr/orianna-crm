# Database Migration Guide

## Prerequisites

- Supabase project with access to SQL Editor
- All migration files are in `supabase/migrations/`

## Migration Order

Run these SQL files **in order** in your Supabase SQL Editor:

| # | File | Purpose |
|---|------|---------|
| 1 | `001_team_members.sql` | Team members table |
| 2 | `002_contacts_extensions.sql` | CRM fields on contacts |
| 3 | `003_contact_timeline.sql` | Contact activity timeline |
| 4 | `004_sequences.sql` | Sequences table |
| 5 | `005_sequence_steps.sql` | Sequence steps table |
| 6 | `006_sequence_enrollments.sql` | Enrollment tracking |
| 7 | `007_comments.sql` | Team comments |
| 8 | `008_rls_policies.sql` | Row-level security |
| 9 | `009_imap_credentials.sql` | IMAP credentials columns |
| 10 | `010_pg_cron.sql` | Scheduler (requires pg_cron + pg_net extensions) |

## Steps

1. Go to **Supabase Dashboard > SQL Editor**
2. Copy-paste each migration file content
3. Run each one in order (001 through 009)
4. For `010_pg_cron.sql`:
   - First enable **pg_cron** and **pg_net** extensions in Database > Extensions
   - Replace `[PROJECT_REF]` with your project reference
   - Replace `[SERVICE_ROLE_KEY]` with your service role key

## Seeding Users

After running migrations:

```bash
cd email-automation
npx tsx scripts/seed-users.ts
```

This creates 3 team accounts and generates a `CREDENTIALS.md` file.

## Edge Functions

Deploy Edge Functions after migrations:

```bash
supabase functions deploy process-sequences
supabase functions deploy check-replies
```

## Verification

1. Check all tables exist in Database > Tables
2. Log in with seeded credentials
3. Create a test contact
4. Create a test sequence with steps
5. Activate and enroll a contact
6. Verify dashboard shows correct stats
