# Architecture and AI behavior

[← Orianna CRM](../README.md)

## Stack and architecture

| Area | Implementation |
|---|---|
| Application | Next.js 16 App Router, React 19, TypeScript |
| UI | Tailwind CSS, Radix UI, TipTap |
| Data and identity | Supabase PostgreSQL, Auth, row-level security |
| AI | Vercel AI SDK with OpenAI and Anthropic integrations |
| Research and enrichment | Linkup, FullEnrich |
| Email | Nodemailer for SMTP; IMAPFlow for mailbox synchronization |
| Background work | Supabase Edge Functions and configured cron jobs |
| Hosting | Vercel, with Supabase services |

Workspace membership and `workspace_id` scope shared CRM data. SMTP/IMAP settings are per user. Sensitive stored credentials are encrypted using the server-side `ENCRYPTION_KEY`; the Supabase service-role key must also remain server-side.

### AI behavior

The shared provider helper selects OpenAI when `OPENAI_API_KEY` is configured, otherwise Anthropic. Model overrides are listed in [`.env.example`](../.env.example); this is configuration-based selection, not automatic failover on every provider error.

For contact scoring and personalization, Linkup supplies external research when configured. Without successful Linkup research, the OpenAI path uses existing CRM context; the Anthropic path can use its web-search tool. The application does not always perform a fresh web search. Additional outreach-agent code and provider configuration live alongside these task-specific helpers.

