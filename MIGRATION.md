# Migration Guide

## Database Migrations

### Prerequisites

- Supabase project with access to SQL Editor
- Migration files are in `supabase/migrations/`

### Migration Order

Run these SQL files **in order** in your Supabase SQL Editor:

| # | File | Purpose |
|---|------|---------|
| 0 | `000_base_tables.sql` | contacts, templates, campaigns, emails_sent, user_settings |
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

### Steps

1. Go to **Supabase Dashboard > SQL Editor**
2. Copy-paste each migration file content
3. Run each one in order (000 through 009)
4. For `010_pg_cron.sql`:
   - First enable **pg_cron** and **pg_net** extensions in Database > Extensions
   - Replace `[PROJECT_REF]` with your project reference
   - Replace `[SERVICE_ROLE_KEY]` with your service role key

### Seeding Users

```bash
npx tsx scripts/seed-users.ts
```

This creates 3 team accounts and generates a `CREDENTIALS.md` file.

### Edge Functions

```bash
supabase functions deploy process-sequences
supabase functions deploy check-replies
```

### Verification

1. Check all tables exist in Database > Tables
2. Log in with seeded credentials
3. Create a test contact
4. Create a test sequence with steps
5. Activate and enroll a contact
6. Verify dashboard shows correct stats

---

## Project Restructure (2026-02-26)

### What changed

The project was restructured from a nested layout to a flat Next.js project.

### Before

```
orianna-crm/
├── backend/                    # Legacy Python scripts
│   ├── scripts/                # download_contacts.py, send_emails.py, watch_folder.py
│   └── templates/              # template_en.txt, template_fr.txt
├── email-automation/           # Next.js app (only working code)
│   ├── package.json
│   ├── src/
│   └── ...
├── requirements.txt            # Python deps
├── AUDIT.md                    # Technical audit
└── README.md
```

### After

```
orianna-crm/
├── package.json                # At root now
├── src/                        # Moved from email-automation/src/
├── supabase/                   # Moved from email-automation/supabase/
├── scripts/                    # Moved from email-automation/scripts/
├── public/                     # Moved from email-automation/public/
├── middleware.ts               # Moved from email-automation/
└── [config files at root]
```

### Changes made

| Action | Files |
|--------|-------|
| **Moved to root** | All `email-automation/` contents (src/, supabase/, public/, scripts/, config files) |
| **Deleted** | `backend/` (3 legacy Python scripts + 2 templates — all superseded by Next.js app) |
| **Deleted** | `requirements.txt` (Python deps no longer needed) |
| **Deleted** | `AUDIT.md` (superseded by AUDIT_REPORT.md) |
| **Updated** | `.gitignore` (merged email-automation + root gitignores) |
| **Rewritten** | `README.md` (for new flat structure) |

### Why

- `npm run dev` now works from root (previously required `cd email-automation`)
- Standard Next.js project structure — any developer can jump in
- `backend/` was 100% legacy — every feature rebuilt in Next.js
- Zero cross-references between backend/ and email-automation/

### Vercel

Update Vercel project settings: **Root Directory** from `email-automation` to `.` (root).
