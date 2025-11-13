# Email Automation Platform

A complete, production-ready email automation platform for outbound cold emailing with campaign management, template system, and tracking.

## 🚀 What's Inside

This repository contains two email automation solutions:

### 1. **Email Automation Platform** (NEW) - `/email-automation/`

A full-stack Next.js application with modern UI and complete feature set:

- ✅ **Authentication**: Sign up/login with @polytechnique.edu domain restriction
- ✅ **SMTP Configuration**: Encrypted password storage, test connection
- ✅ **CSV Import**: Drag & drop upload with validation and duplicate detection
- ✅ **Email Templates**: Pre-seeded templates for Notary, Real Estate, and Hotel industries
- ✅ **Campaign Management**: Create and send campaigns with real-time progress tracking
- ✅ **Dashboard**: Statistics, recent sends, search functionality
- ✅ **Deduplication**: Prevents sending duplicate emails
- ✅ **Daily Limits**: Configurable send limits to avoid spam flags

**Tech Stack**: Next.js 14, TypeScript, Supabase, Tailwind CSS, shadcn/ui, Nodemailer

**Get Started**: See [`email-automation/README.md`](./email-automation/README.md) for full documentation

**Quick Setup**: See [`email-automation/SETUP.md`](./email-automation/SETUP.md) for 15-minute setup guide

### 2. **Light Outreach Assistant** (Original) - `/backend/`

A lightweight Python-based assistant with three scripts:
- `watch_folder.py` - Monitor folder for screenshots
- `download_contacts.py` - Download contacts from Google Sheets
- `send_emails.py` - Send emails via SMTP

This was my original personal outbound flow automation using uiform.com for extraction and Google Sheets as a database.

**Note**: This is the legacy version. The new Email Automation Platform above is recommended for production use.

---

## 📦 Quick Start (Email Automation Platform)

```bash
# Navigate to the platform
cd email-automation

# Install dependencies
npm install

# Create .env.local and add your Supabase keys
# (See SETUP.md for details)

# Start development server
npm run dev
```

Visit http://localhost:3000 and start automating! 🎉

---

## 📚 Documentation

- **[Email Automation Platform README](./email-automation/README.md)** - Complete documentation
- **[Quick Setup Guide](./email-automation/SETUP.md)** - Get started in 15 minutes
- **[Deployment Guide](./email-automation/DEPLOYMENT.md)** - Deploy to Vercel
- **[Quick Reference](./email-automation/QUICK_REFERENCE.md)** - Cheat sheet
- **[Project Summary](./email-automation/PROJECT_SUMMARY.md)** - Full feature breakdown

---

## 🎯 Use Cases

- **Cold Email Campaigns**: Send personalized emails to prospects
- **Industry-Specific Outreach**: Pre-built templates for notaries, real estate, hotels
- **Lead Nurturing**: Track sent emails and manage contacts
- **Team Collaboration**: Multiple users with their own SMTP configs

---

## 🔐 Security Features

- Email domain restriction (@polytechnique.edu)
- AES encrypted SMTP password storage
- Row Level Security (RLS) in Supabase
- Daily send limits to prevent spam
- Environment variable protection

---

## 🌟 Features Highlight

### Modern UI
Clean, responsive interface built with Tailwind CSS and shadcn/ui components

### Real-Time Progress
Watch your campaign progress live with detailed statistics

### Smart Deduplication
Never send the same email twice to the same contact

### Template System
Pre-built, customizable templates with variable support

### Dashboard Analytics
Track your sends, success rates, and campaign performance

---

## 📊 Architecture

```
email-automation/
├── src/app/              # Next.js pages and API routes
├── src/components/       # React components
├── src/lib/              # Utilities (email, encryption, templates)
├── supabase-schema.sql   # Database schema
└── Documentation files
```

---

## 🚀 Deployment

Deploy to Vercel in minutes:

1. Push to GitHub
2. Import project in Vercel
3. Add environment variables
4. Deploy!

See [DEPLOYMENT.md](./email-automation/DEPLOYMENT.md) for detailed instructions.

---

## 🤝 Contributing

This project was built for École Polytechnique email automation needs. Feel free to fork and customize for your own use case!

---

## 📝 License

This project is for educational and personal use.

---

## 🙏 Background

**Original Goal**: Automate and industrialize personal outbound flow using custom tools instead of rigid CRMs.

**Evolution**: Started with a light Python assistant using uiform.com and Google Sheets, evolved into a full-featured Next.js platform with modern UI and comprehensive features.

**Why Build This**: Commercial CRM tools lacked the flexibility needed for our specific workflow, especially when using student email addresses (Zimbra) for outbound. With custom code, we achieved perfect integration with our process.

---

**Ready to automate your email campaigns?** → Start with [`email-automation/SETUP.md`](./email-automation/SETUP.md)
