---
name: orianna-supabase-safety
description: Safely inspect and modify the Orianna CRM Supabase database, with project-ref checks, migration discipline, workspace isolation checks, and outbound automation safety verification.
---

# Orianna Supabase Safety

Use this skill before applying migrations, running SQL, or debugging database state for Orianna CRM.

## Project Ref

- App production project ref: `dregduozycgxwytkubrh`.
- Do not trust a Supabase MCP connection until its project ref is verified.
- A previously observed MCP connection pointed at `zxhkwtubebzjpewmvlnt`, which is not the app database.

## Migration Discipline

- Prefer committed migrations in `supabase/migrations`.
- Use Supabase MCP only when it targets the correct project.
- If using the CLI, verify the linked project before applying SQL.
- Never run destructive workspace/contact operations unless the user explicitly asks.

## Outbound Data Checks

- Each workspace is a separate outbound project/org.
- Contacts must remain in their original workspace.
- Outbound-sourced contacts currently have `source = 'gtm_autopilot'`.
- Review fields are `gtm_review_status`, `gtm_send_approved_at`, and `gtm_send_approved_by`.
- Sequence queueing lives in `campaign_enrollments`.

## Safety Queries To Prefer

- Count contacts by workspace before and after GTM changes.
- Verify workspace members before enabling automation.
- Check pending/approved/rejected outbound counts before processing sequences.
- Confirm no generic inbox or missing-email outbound contact is approved and queued.
