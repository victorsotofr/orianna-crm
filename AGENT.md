# isimple GTM Context For Orianna CRM

Orianna CRM is being used as the outbound GTM engine for isimple. The target users are real estate agents, syndic teams, and property managers in France who need a simple, visual, AI-native way to automate admin-heavy property workflows.

## Mission

- Create and operate a dedicated workspace/org named `isimple`.
- Keep the existing Orianna organization and all current contacts intact.
- Use SMTP as the primary outreach channel and IMAP for reply tracking.
- Find, qualify, enrich, personalize, and enroll about 20 new relevant contacts per day.
- Run follow-ups automatically through campaign sequences.
- Surface questions, approvals, alerts, and daily summaries through Telegram.
- Prefer OpenAI models through the current `OPENAI_API_KEY`; keep Anthropic as a fallback where existing code still needs it.

## Ideal Daily Workflow

1. Daily cron runs GTM prospecting for the isimple workspace.
2. Linkup researches French property-management ICP contacts.
3. AI extracts structured people, dedupes workspace contacts, scores fit, and creates a personalization line.
4. Eligible contacts are enrolled into the active SMTP sequence when GTM autopilot is enabled.
5. Existing sequence processing sends the first email and automatic follow-ups.
6. IMAP sync detects replies, bounces, meetings, and opt-outs.
7. Telegram reports what happened and asks Victor questions only when the agent needs human judgment.

## Product Bar

- Lean, visual, and operational: avoid marketing pages when an actionable dashboard is better.
- AI-native by default: the CRM should recommend actions, not just store records.
- Scalable and production-grade: workspace isolation, idempotent jobs, observability, service-key protected crons, and clear failure states.
- Compliance-aware B2B outreach: professional relevance, truthful sender identity, suppression/opt-out handling, low daily volume, and auditable source context.
- SEO/GEO/API/MCP optimized: public machine-readable surfaces should expose what Orianna does without exposing private CRM data.

## Near-Term Features To Prioritize

- GTM Autopilot dashboard with daily import/enrollment/send stats.
- Telegram commands for `/gtm`, `/run_gtm`, `/pause_gtm`, `/resume_gtm`, and `/limit`.
- OpenAPI, `llms.txt`, `llms-full.txt`, `robots.txt`, `sitemap.xml`, and `.well-known` AI/MCP manifests.
- Dedicated isimple ICP defaults for French property managers, syndic firms, administrateurs de biens, and real estate agency networks.
- Strong suppression checks: never contact bounced, replied, opted-out, or do-not-contact records.
