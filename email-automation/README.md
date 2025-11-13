# Email Automation Platform

A complete email automation platform for outbound cold emailing with campaign management, template system, and tracking.

## Tech Stack

- **Framework**: Next.js 14 (App Router) + TypeScript
- **Database**: Supabase (PostgreSQL + Auth)
- **UI**: Tailwind CSS + shadcn/ui components
- **Email Sending**: Nodemailer (SMTP)
- **Deployment**: Vercel

## Features

### MVP Features
- ✅ Authentication with @polytechnique.edu domain restriction
- ✅ SMTP/IMAP configuration with encrypted password storage
- ✅ CSV contact import with validation
- ✅ Pre-seeded email templates (Notary, Real Estate, Hotel)
- ✅ Campaign creation with client-side sequential sending
- ✅ Dashboard with statistics and recent sends
- ✅ Email deduplication
- ✅ Daily send limits
- ✅ Email signature support

### Post-MVP Features (TODO)
- ⏳ Automatic follow-ups (J+7, J+15)
- ⏳ IMAP response detection
- ⏳ A/B testing templates
- ⏳ Advanced analytics with charts
- ⏳ Template CRUD operations

## Setup Instructions

### 1. Clone and Install Dependencies

```bash
cd email-automation
npm install
```

### 2. Set Up Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to **Settings** > **API** and copy:
   - Project URL
   - `anon` public key
   - `service_role` secret key
3. Go to **SQL Editor** and run the schema from `supabase-schema.sql`
4. Enable email authentication in **Authentication** > **Providers** > **Email**

### 3. Configure Environment Variables

Create a `.env.local` file in the project root:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Encryption Key for SMTP/IMAP passwords
# Generate with: openssl rand -base64 32
ENCRYPTION_KEY=your_random_32_char_string
```

To generate a secure encryption key:
```bash
openssl rand -base64 32
```

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the application.

### 5. First-Time Setup

1. **Sign Up**: Go to `/signup` and create an account with an `@polytechnique.edu` email
2. **Configure SMTP**: Go to `/settings` and configure your SMTP settings
   - Host: `webmail.polytechnique.fr` (or `smtp.gmail.com` for Gmail)
   - Port: `587` (or `465` for SSL)
   - Username: Your email address
   - Password: Your email password or app-specific password
   - Test the connection before saving
3. **Import Contacts**: Go to `/upload` and upload a CSV file with contacts
4. **Create Campaign**: Go to `/campaigns/new` to create and send your first campaign

## Project Structure

```
email-automation/
├── src/
│   ├── app/
│   │   ├── api/                    # API routes
│   │   │   ├── campaigns/          # Campaign management
│   │   │   ├── contacts/           # Contact upload & search
│   │   │   ├── dashboard/          # Dashboard stats
│   │   │   ├── emails/             # Email sending
│   │   │   ├── settings/           # User settings & SMTP test
│   │   │   └── templates/          # Template fetching
│   │   ├── campaigns/
│   │   │   └── new/                # Campaign creation page
│   │   ├── dashboard/              # Dashboard page
│   │   ├── login/                  # Login page
│   │   ├── settings/               # Settings page
│   │   ├── signup/                 # Signup page
│   │   ├── templates/              # Templates page
│   │   ├── upload/                 # CSV upload page
│   │   ├── layout.tsx              # Root layout
│   │   └── page.tsx                # Home page (redirects)
│   ├── components/
│   │   ├── ui/                     # shadcn/ui components
│   │   └── Sidebar.tsx             # Navigation sidebar
│   ├── lib/
│   │   ├── auth.ts                 # Auth helpers
│   │   ├── email-sender.ts         # Nodemailer logic
│   │   ├── encryption.ts           # Password encryption
│   │   ├── supabase.ts             # Supabase client
│   │   ├── template-renderer.ts    # Handlebars rendering
│   │   └── utils.ts                # Utility functions
│   └── types/
│       └── database.ts             # TypeScript types
├── supabase-schema.sql             # Database schema
├── package.json
├── tailwind.config.ts
└── tsconfig.json
```

## Database Schema

The platform uses the following Supabase tables:

- **contacts**: Stores imported contacts with industry classification
- **templates**: Pre-seeded email templates
- **campaigns**: Campaign metadata and status
- **emails_sent**: Tracking of sent emails with deduplication
- **user_settings**: User SMTP/IMAP configuration (passwords encrypted)

Row Level Security (RLS) is enabled to ensure users can only access their own data.

## CSV Format

When uploading contacts, your CSV should have these columns:

**Required:**
- `email` - Contact email address
- `first_name` or `firstName` - Contact first name

**Optional:**
- `last_name` or `lastName`
- `company_name` or `companyName`
- `company_domain` or `companyDomain`
- `job_title` or `jobTitle`
- `linkedin_url` or `linkedinUrl`

All other columns will be stored in the `raw_data` JSON field.

Example CSV:
```csv
email,first_name,last_name,company_name,job_title
jean.dupont@example.com,Jean,Dupont,Example Corp,CEO
marie.martin@example.com,Marie,Martin,Test Inc,Manager
```

## Email Sending Strategy

The platform uses **client-side sequential sending** to work within Vercel's 10-second function timeout:

1. User configures a campaign with contacts and template
2. Client-side JavaScript loops through contacts
3. Each email is sent via API call with 8-second delay between emails
4. Progress is shown in real-time
5. User must stay on the page during sending
6. Deduplication prevents sending duplicate emails

## Security Features

- **Email Domain Restriction**: Only `@polytechnique.edu` emails can sign up
- **Password Encryption**: SMTP passwords are encrypted with AES before storage
- **Row Level Security**: Database policies ensure users only see their own data
- **Rate Limiting**: Daily send limits configurable per user
- **Deduplication**: Prevents sending same template to same contact twice

## Deployment to Vercel

1. Push your code to GitHub
2. Import project in Vercel
3. Add environment variables in Vercel dashboard
4. Deploy

Your app will be available at `your-project.vercel.app`

## Environment Variables for Vercel

Make sure to add these in Vercel Dashboard > Project > Settings > Environment Variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ENCRYPTION_KEY`

## Troubleshooting

### SMTP Connection Errors

- Verify your SMTP host and port are correct
- Check if your email provider requires an app-specific password (Gmail, Outlook)
- Ensure port 587 (STARTTLS) or 465 (SSL) is not blocked by firewall
- Test connection in Settings page before sending campaigns

### CSV Upload Issues

- Ensure your CSV has `email` and `first_name` columns
- Check for valid email formats
- Remove any special characters that might break CSV parsing

### Database Connection Issues

- Verify your Supabase URL and keys in `.env.local`
- Check if RLS policies are properly configured
- Ensure you've run the `supabase-schema.sql` script

## Support

For issues or questions, please check:
- Supabase documentation: https://supabase.com/docs
- Next.js documentation: https://nextjs.org/docs
- shadcn/ui documentation: https://ui.shadcn.com

## License

This project is for educational purposes.
