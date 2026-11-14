# Architecture and AI behavior

[← Orianna CRM](../README.md)

## Stack and architecture

| Area | Implementation |
|---|---|
| Application | Next.js 16 App Router, React 19, TypeScript |
| UI | Tailwind CSS, Radix UI, TipTap |
| Data and identity | Supabase PostgreSQL, Auth, row-level security |
| AI | LangGraph outreach agents; Vercel AI SDK for task-specific OpenAI / Anthropic integrations |
| Research and enrichment | Linkup, FullEnrich |
| Email | Nodemailer for SMTP; IMAPFlow for mailbox synchronization |
| Background work | Supabase Edge Functions and configured cron jobs |
| Hosting | Vercel, with Supabase services |

Workspace membership and `workspace_id` scope shared CRM data. SMTP/IMAP settings are per user. Sensitive stored credentials are encrypted using the server-side `ENCRYPTION_KEY`; the Supabase service-role key must also remain server-side.

### AI behavior

The shared provider helper selects OpenAI when `OPENAI_API_KEY` is configured, otherwise Anthropic. Model overrides are listed in [`.env.example`](../.env.example); this is configuration-based selection, not automatic failover on every provider error.

For contact scoring and personalization, Linkup supplies external research when configured. Without successful Linkup research, the OpenAI path uses existing CRM context; the Anthropic path can use its web-search tool. The application does not always perform a fresh web search. The outreach-agent runtime uses LangGraph and a separate LangChain provider helper supporting OpenAI, Anthropic, Mistral, and Google. `AGENT_MODEL_PROVIDER` selects its default provider; task-specific `AGENT_*_MODEL` values can select models, including provider-prefixed overrides such as `mistral:<model>`. These settings are separate from the task-specific Vercel AI SDK helpers.
