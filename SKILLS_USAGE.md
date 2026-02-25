# Skills Usage Guide

Custom Claude Code skills for Orianna CRM, saved in `~/.claude/skills/orianna-crm/`.

## Skills Overview

| Skill | File | Purpose |
|-------|------|---------|
| Project Audit | `project-audit.md` | Analyze and clean up project structure |
| Next.js + Supabase | `nextjs-supabase-setup.md` | Build features with Next.js App Router + Supabase |
| Email Automation | `email-automation-workflow.md` | Email sequences, campaigns, templates, tracking |
| Monorepo Management | `monorepo-management.md` | Workspace setup, shared packages, build orchestration |
| CRM Development | `crm-development.md` | Contact management, pipelines, activity logging |

## Trigger Prompts

### Project Audit
```
"Analyze this project structure"
"Audit this codebase"
"Find unused files"
"Clean up this project"
"What can I delete safely?"
```

### Next.js + Supabase Setup
```
"Set up a new Supabase table"
"Create a new API route"
"Add a new feature with Supabase"
"Set up authentication"
"Generate Supabase types"
"Add a new page with database access"
```

### Email Automation Workflow
```
"Create an email sequence feature"
"Add email template system"
"Build campaign management"
"Set up email tracking"
"Integrate SMTP/IMAP"
"Add reply detection"
"Implement daily send limits"
```

### Monorepo Management
```
"Add a new package to the monorepo"
"Set up workspaces"
"Share code between apps"
"Configure shared dependencies"
"Set up Turborepo"
```

### CRM Development
```
"Design a lead scoring system"
"Build a contact pipeline"
"Add activity tracking"
"Create a sales funnel"
"Set up team assignments"
"Build reporting/analytics"
"Add CSV import for contacts"
```

## How Skills Work

These skills are reference documents in `~/.claude/skills/orianna-crm/`. When you ask Claude Code a question matching the trigger patterns above, reference the relevant skill or ask Claude to "use the [skill-name] skill" for best results.

Each skill contains:
- **When to use**: Trigger patterns
- **Key practices**: Best practices and principles
- **Common patterns**: Code examples and file structures
- **Gotchas**: Anti-patterns to avoid
- **Related skills**: Complementary skills for cross-cutting concerns

## Skill Relationships

```
project-audit ──→ monorepo-management (if multi-package)
                ↘ nextjs-supabase-setup (for structure validation)

nextjs-supabase-setup ──→ email-automation-workflow (email features)
                        ↘ crm-development (CRM features)

crm-development ←──→ email-automation-workflow (contacts ↔ emails)
```
