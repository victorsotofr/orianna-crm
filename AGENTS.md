# Orianna CRM

B2B prospecting CRM with AI-powered contact scoring, personalization, and prospecting. Multi-tenant, bilingual (FR/EN).

## Tech Stack

- **Framework**: Next.js 16 (App Router, Turbopack), React 19, TypeScript
- **Database**: Supabase (PostgreSQL + Auth + RLS + Edge Functions)
- **AI**: Codex Sonnet 4.5 via Vercel AI SDK (`ai` + `@ai-sdk/anthropic`)
- **Web Research**: Linkup API (`linkup-sdk`) for agentic web search
- **Enrichment**: FullEnrich API for verified emails & phone numbers
- **UI**: Tailwind CSS, shadcn/ui, Radix UI, TipTap rich text editor
- **Email**: Nodemailer (SMTP send), IMAPFlow (reply detection)
- **Security**: AES-256 encrypted credentials, Row Level Security

## Key Architecture

### Authentication & Multi-Tenancy

Every data table has a `workspace_id` column. RLS scopes all queries via `user_workspace_ids()`.

- `src/lib/supabase-server.ts` — Cookie-based auth client (SSR), use `createServerClient()`
- `src/lib/supabase.ts` — `getServiceSupabase()` for admin/service role operations (bypasses RLS)
- `src/lib/workspace.ts` — `getWorkspaceContext(supabase, userId, wsId)` resolves and validates workspace access
- `src/lib/workspace-context.tsx` — `WorkspaceProvider` + `useWorkspace()` hook (client-side)
- `src/lib/api.ts` — `apiFetch()` wrapper that injects `X-Workspace-Id` header from localStorage

### API Route Pattern

All workspace-scoped API routes follow this pattern:

```typescript
const { supabase, error } = await createServerClient();
const { data: { user } } = await supabase.auth.getUser();
const wsId = request.headers.get('x-workspace-id');
const ctx = await getWorkspaceContext(supabase, user.id, wsId);
if (!ctx) return NextResponse.json({ error: 'No workspace' }, { status: 403 });
// Use ctx.workspaceId for all queries and inserts
```

Service-level routes (webhooks, edge functions) use `x-service-key` header checked against `SUPABASE_SERVICE_ROLE_KEY`.

**Exception**: `user_settings` (SMTP/IMAP config, daily send limit) is per-user, NOT per-workspace. Settings/feedback/auth routes use plain `fetch()`, not `apiFetch()`.

### Client Components

- Always use `apiFetch()` instead of `fetch()` for workspace-scoped endpoints
- Use `useTranslation()` hook for all user-facing strings
- Page layout uses `.page-container` + `.page-content` CSS classes from `globals.css`

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/ai-defaults.ts` | Default prompts for personalization, scoring, Linkup queries, prospecting |
| `src/lib/ai-personalization.ts` | Two-pass AI personalization (Linkup research → Codex generation) |
| `src/lib/ai-scoring.ts` | AI lead scoring engine (Linkup research → Codex 4-axis scoring) |
| `src/lib/linkup.ts` | Linkup API: `searchCompany()`, `searchContact()`, `searchProspecting()` |
| `src/lib/email-sender.ts` | Nodemailer SMTP sending (uses `server-only`, encrypted passwords) |
| `src/lib/encryption.ts` | AES encrypt/decrypt for API keys and SMTP passwords |
| `src/lib/template-renderer.ts` | `{{ variable }}` replacement engine for email templates |
| `src/lib/i18n/en.ts`, `fr.ts` | All UI strings — both files must stay in sync |

## Database

### Core Tables

- `workspaces` — id, name, slug, created_by, API keys (encrypted), AI prompts
- `workspace_members` — workspace_id + user_id (unique), email, display_name, role
- `workspace_invitations` — token-based invites with expiry
- `contacts` — all contact data, `workspace_id` + `assigned_to`, AI score/personalization fields
- `templates` — email templates with HTML content
- `campaigns` — campaign metadata
- `emails_sent` — send records with status (`pending`/`sent`/`failed`), tracking
- `email_stats` — open/reply tracking events
- `contact_timeline` — activity log per contact
- `user_settings` — per-user SMTP/IMAP config (NOT workspace-scoped)

### Constraints

- `contacts_workspace_email_unique` — unique on `(workspace_id, lower(email))`, NULL emails allowed
- `emails_sent_status_check` — status must be `pending`, `sent`, or `failed`

## Conventions

- UI is primarily French, with FR/EN toggle. Both i18n files must always have matching keys.
- Never use `Tabs` component in dialogs — use sidebar navigation pattern instead (see Settings page AI Prompts dialog).
- When a component's state causes re-render lag on a large page, extract it into a separate component (see `AiSearchDialog` in contacts page).
- FullEnrich-verified emails always overwrite unverified ones (emails without `email_verified_status`).
- Imported/prospected contacts get `status: 'new'` and `assigned_to` set to the importing user.
- AI prompts stored as NULL in DB mean "use default from `ai-defaults.ts`". Empty string on save → NULL in DB.

## Commands

```bash
npm run dev       # Dev server (Turbopack)
npm run build     # Production build
npx tsc --noEmit  # Type check (run before committing)
```
