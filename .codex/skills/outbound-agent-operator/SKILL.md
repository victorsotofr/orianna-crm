---
name: outbound-agent-operator
description: Operate and verify workspace-scoped outbound automation in Orianna CRM, including workspace isolation, review queue readiness, safe approvals, Telegram commands, and sequence queueing.
---

# Outbound Agent Operator

Use this skill when asked to inspect, run, debug, or improve outbound automation for any workspace.

## Ground Rules

- Read `AGENT.md` and `AGENTS.md` first.
- Treat each workspace as a separate outbound project/org.
- Do not merge, delete, or overwrite contacts across workspaces.
- isimple is one workspace, not a special app-level page.
- Outreach is safe by default: outbound contacts must be reviewed before sequence sending.

## Verification Flow

1. Confirm the active workspace is the workspace the user intends to operate.
2. Check `/api/gtm/status` for approval mode, daily limit, active sequence, and run status.
3. Check `/api/gtm/review?status=pending` for counts, blockers, previews, and readiness.
4. Only approve prospects with direct professional email, AI personalization, first-email preview, and no suppression flags.
5. Approval should queue contacts into the active sequence; it should not send immediately.
6. Confirm sequence processors still block pending, rejected, bounced, replied, opted-out, and generic-inbox GTM contacts.

## Telegram

- `/gtm` should show ready, blocked, queued, daily target, sequence, and last run for the intended workspace.
- `/gtm_review` should show prospect cards with inline approve/reject/hold/enrich actions.
- Voice commands should route to the same review action helper and confirm batch actions before applying.

## Expected Checks

Run `npx tsc --noEmit` and `npm run build` before committing. If full lint fails, distinguish touched-file issues from existing repo-wide strict-lint debt.
