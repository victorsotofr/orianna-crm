# Orianna CRM - Audit Report

> Generated: 2026-02-26

---

## 1. Current Project Structure

```
orianna-crm/
├── .git/
├── .gitignore              ✅ Active (covers both Python & Next.js)
├── .mcp.json               ✅ Active (Supabase MCP config)
├── AUDIT.md                📄 31KB comprehensive audit (pre-existing)
├── README.md               📄 5KB project overview
├── requirements.txt        ⚠️  Legacy Python deps
├── backend/
│   ├── scripts/
│   │   ├── download_contacts.py   🐍 Google Sheets → CSV
│   │   ├── send_emails.py         🐍 SMTP bulk sender
│   │   └── watch_folder.py        🐍 Folder → UiForm uploader
│   └── templates/
│       ├── template_en.txt        📧 English email template
│       └── template_fr.txt        📧 French email template
└── email-automation/              ✅ THE ACTUAL APP
    ├── package.json
    ├── src/
    ├── supabase/
    ├── scripts/
    ├── middleware.ts
    └── [full Next.js 16 app]
```

---

## 2. Detailed File Analysis

### `backend/scripts/` (3 Python scripts)

| File | Purpose | Dependencies | Status |
|------|---------|-------------|--------|
| `download_contacts.py` | Downloads contacts from Google Sheets, cleans & filters into CSV | pandas, requests, python-dotenv | **Legacy** - superseded by `/api/contacts/upload` (CSV import in Next.js app) |
| `send_emails.py` | Sends personalized bulk emails via SMTP with FR/EN templates | pandas, python-dotenv, smtplib | **Legacy** - superseded by `/api/emails/send` (Nodemailer in Next.js app) |
| `watch_folder.py` | Monitors folder for PNGs, uploads to UiForm API | requests, python-dotenv | **Legacy** - unrelated to CRM core, UiForm-specific |

**Verdict**: All 3 scripts are **fully superseded** by the Next.js app. The email-automation app has:
- CSV import via UI (`/contacts/import`)
- SMTP email sending via Nodemailer (`/api/emails/send`)
- Template system with `{{variable}}` syntax
- No equivalent of `watch_folder.py` (UiForm integration) — but this appears unrelated to CRM

### `backend/templates/` (2 email templates)

| File | Content | Status |
|------|---------|--------|
| `template_en.txt` | HTML template with `[FIRST_NAME]` and `[COMPANY]` placeholders | **Legacy** - Next.js app uses DB-stored templates with `{{variable}}` syntax |
| `template_fr.txt` | French version of same template | **Legacy** - same as above |

**Verdict**: Templates are superseded by the database-driven template system in the Next.js app.

### Root-level files

| File | Size | Purpose | Keep? |
|------|------|---------|-------|
| `README.md` | 5KB | Project overview, references both solutions | **Update** - should only document the Next.js app |
| `AUDIT.md` | 31KB | Comprehensive technical audit | **Archive or remove** - will be replaced by this report |
| `requirements.txt` | 0.7KB | Python deps (pandas, requests, gspread, openai, streamlit...) | **Remove** - no Python code will remain |
| `.gitignore` | 0.3KB | Covers both Python and Next.js | **Keep** - Python patterns are harmless |
| `.mcp.json` | 0.15KB | Supabase MCP server config | **Keep** |

### `requirements.txt` contents
```
pandas, python-dotenv, requests, gspread, oauth2client,
openai>=1.0.0, streamlit, smtplib, email, osascript, watchdog
```
**Note**: Many listed packages (gspread, openai, streamlit, watchdog) aren't even used by the backend scripts. This is a kitchen-sink requirements file.

---

## 3. Cross-reference Check

| Question | Answer |
|----------|--------|
| Does `email-automation/` import from `../backend/`? | **NO** - completely self-contained |
| Does `backend/` reference `email-automation/`? | **NO** - independent legacy code |
| Are there shared environment variables? | Partially - both use SMTP vars, but from different `.env` files |
| Is there a root `package.json`? | **NO** |
| Can you `npm run dev` from root? | **NO** - only from `email-automation/` |
| Is Python needed for the current app? | **NO** - pure TypeScript/Next.js |

---

## 4. The email-automation/ App (Summary)

**Tech Stack**: Next.js 16, React 19, TypeScript, Supabase, Tailwind CSS, shadcn/ui, Nodemailer

**Database tables**: contacts, templates, campaigns, emails_sent, user_settings, team_members, contact_timeline, sequences, sequence_steps, sequence_enrollments, comments

**Key Features**:
- Full CRM with contact management, status tracking, assignment
- Email template system with variable substitution
- Multi-step email sequences with automation
- SMTP/IMAP configuration per user
- Dashboard with team & personal stats
- CSV import/export
- Row Level Security on all tables
- Supabase Edge Functions for async processing

**External Services**: Supabase (DB + Auth), Vercel (hosting), User-configured SMTP/IMAP

---

## 5. Recommendation: Option A - Flatten to Single App

### Why Option A (not monorepo)?

1. **`backend/` is 100% legacy** — every feature has been rebuilt in Next.js
2. **Zero cross-references** — the two directories don't interact
3. **No shared code** — nothing to extract into packages
4. **Single deployment target** — Vercel for Next.js + Supabase
5. **Monorepo adds complexity** for zero benefit here

### Proposed Structure

```
orianna-crm/
├── .git/
├── .gitignore
├── .mcp.json
├── README.md                    # Updated
├── MIGRATION.md                 # New - documents what changed
├── package.json                 # Moved from email-automation/
├── package-lock.json            # Moved from email-automation/
├── next.config.ts               # Moved from email-automation/
├── middleware.ts                 # Moved from email-automation/
├── tsconfig.json                # Moved from email-automation/
├── tailwind.config.ts           # Moved (if exists)
├── postcss.config.mjs           # Moved from email-automation/
├── components.json              # Moved from email-automation/
├── vercel.json                  # Moved from email-automation/
├── .env.local                   # Moved from email-automation/
├── src/                         # Moved from email-automation/src/
│   ├── app/
│   ├── components/
│   ├── lib/
│   ├── types/
│   └── hooks/
├── public/                      # Moved from email-automation/public/
├── supabase/                    # Moved from email-automation/supabase/
│   ├── migrations/
│   └── functions/
├── scripts/                     # Merged scripts
│   ├── seed-users.ts            # From email-automation/scripts/
│   ├── import_past_campaign.py  # From email-automation/scripts/
│   └── legacy/                  # Preserved from backend/ (optional)
│       ├── download_contacts.py
│       ├── send_emails.py
│       ├── watch_folder.py
│       ├── template_en.txt
│       └── template_fr.txt
└── docs/                        # Optional: archived docs
    └── AUDIT_2025.md            # Archived original audit
```

### What this achieves
- `npm install` and `npm run dev` work from root
- Standard Next.js project structure (any developer can jump in)
- Legacy code preserved in `scripts/legacy/` (can be deleted later)
- Clean git history (moves, not deletes)

---

## 6. Files to Delete/Move (Pending Approval)

### DELETE (truly unused)
| File | Reason |
|------|--------|
| `requirements.txt` | Python deps no longer needed; half aren't even used |
| `AUDIT.md` | Superseded by this report + will archive if desired |

### MOVE (from `email-automation/` to root)
| Source | Destination |
|--------|-------------|
| `email-automation/package.json` | `./package.json` |
| `email-automation/package-lock.json` | `./package-lock.json` |
| `email-automation/next.config.ts` | `./next.config.ts` |
| `email-automation/middleware.ts` | `./middleware.ts` |
| `email-automation/tsconfig.json` | `./tsconfig.json` |
| `email-automation/postcss.config.mjs` | `./postcss.config.mjs` |
| `email-automation/components.json` | `./components.json` |
| `email-automation/vercel.json` | `./vercel.json` |
| `email-automation/.env.local` | `./.env.local` |
| `email-automation/src/` | `./src/` |
| `email-automation/public/` | `./public/` |
| `email-automation/supabase/` | `./supabase/` |
| `email-automation/scripts/` | `./scripts/` |

### MOVE (from `backend/` to `scripts/legacy/`)
| Source | Destination |
|--------|-------------|
| `backend/scripts/*.py` | `scripts/legacy/` |
| `backend/templates/*.txt` | `scripts/legacy/` |

### THEN DELETE (empty directories)
| Directory | Reason |
|-----------|--------|
| `email-automation/` | All contents moved to root |
| `backend/` | All contents moved to scripts/legacy/ |

---

## 7. Migration Plan (Step-by-Step)

### Phase 1: Backup
```bash
cd /Users/victorsoto/DocumentsLocal/work/
tar -czf orianna-crm-backup-$(date +%Y%m%d-%H%M%S).tar.gz orianna-crm/
```

### Phase 2: Move email-automation/ to root
1. Move all config files (package.json, tsconfig.json, etc.) to root
2. Move `src/`, `public/`, `supabase/` to root
3. Move `scripts/` to root
4. Update any path references in config files (if needed)

### Phase 3: Preserve legacy code
1. Create `scripts/legacy/`
2. Move backend scripts and templates there
3. Delete empty `backend/` directory

### Phase 4: Clean up root
1. Delete `requirements.txt`
2. Archive or delete `AUDIT.md`
3. Update `README.md`

### Phase 5: Verify
```bash
npm install
npm run dev       # Should start on localhost:3000
npm run build     # Should compile successfully
npm run lint      # Should pass
```

### Phase 6: Document
1. Create `MIGRATION.md` with changelog
2. Update `README.md` for new structure

---

## 8. Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Vercel build breaks | `vercel.json` may need root directory update; check Vercel project settings |
| Import paths break | All use `@/*` alias which maps to `./src/*` — this won't change |
| Git history loss | Using `git mv` preserves history |
| `.env.local` exposure | Already in `.gitignore` |
| Supabase migrations path | `supabase/` stays at same relative position to project root |

**Lowest risk item**: Import paths — the `@/*` → `./src/*` alias means zero code changes needed.

**Highest risk item**: Vercel deployment — may need to update the root directory setting in Vercel dashboard from `email-automation` to `.` (root).
