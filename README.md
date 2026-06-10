# Diary Study App

A reusable web platform for running diary studies. Researchers create studies with custom questions; participants log in daily to submit entries.

## Features

- **Multi-study** — create as many studies as you need, reuse the platform across projects
- **Question types** — free text, rating scales, multiple choice, yes/no, event date/time, screenshot upload, content blocks
- **Roles** — admin (researcher) and participant, each with their own view
- **Daily entries** — one entry per participant per study per day, enforced server-side
- **Admin dashboard** — manage studies, add/remove participants, browse all entries
- **CSV export** — download all responses for any study as a CSV

## Setup

### 1. Prerequisites

- Node.js 20+ (installed via nvm in this project)
- A PostgreSQL database (see options below)

### 2. Configure environment

Edit `.env`:

```bash
DATABASE_URL="postgresql://user:password@host:5432/diary_study"

# Generate a secret: openssl rand -base64 32
SESSION_SECRET="your-secret-here"

# Only needed if you want screenshot uploads (Vercel Blob)
BLOB_READ_WRITE_TOKEN="your-blob-token"

# Only needed if you want email reminders
RESEND_API_KEY="your-resend-api-key"
EMAIL_FROM="diARI <research@yourdomain.com>"
NEXT_PUBLIC_APP_URL="https://your-deployed-app.com"
```

**Free PostgreSQL options:**
- [Neon](https://neon.tech) — generous free tier, works great on Vercel
- [Supabase](https://supabase.com) — free tier with extras
- Local: `brew install postgresql` or Docker

### 3. Run database migrations

```bash
npm run db:push   # apply schema (fast, no migration history)
# or
npm run db:migrate  # generate migration files (recommended for production)
```

### 4. Create your admin account

```bash
npm run create-admin your@email.com yourpassword "Your Name"
```

### 5. Start the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — you'll be redirected to the admin dashboard.

## Deploy to Vercel

1. Push this repo to GitHub
2. Import it in [vercel.com](https://vercel.com)
3. Add environment variables in the Vercel dashboard:
   - `DATABASE_URL` — your Neon/Supabase connection string
   - `SESSION_SECRET` — `openssl rand -base64 32`
   - `BLOB_READ_WRITE_TOKEN` — from Vercel Blob (Storage tab)
4. Deploy — migrations run automatically if you add `npm run db:push` as a build step

## Running a study

1. Log in as admin → **New study**
2. Add questions (all types supported)
3. Ask participants to **Sign up** at your app URL
4. In the study page, add each participant by their email
5. Participants see "Submit today's entry" on their dashboard each day
6. View or export results from the study admin page

## Before launching with real participants

- Use HTTPS in production.
- Generate a strong `SESSION_SECRET` and never reuse the development placeholder.
- Verify your email sending domain before relying on reminders.
- Set `NEXT_PUBLIC_APP_URL` to the deployed app URL so reminder links point to the right place.
- Confirm consent text, contact email, active parts, and preview flow before inviting participants.
- Export a test CSV and confirm it contains the columns you need.
- Keep database backups enabled in your hosting provider.

## Smoke checks

Run a fast production sanity check after a deploy:

```bash
SMOKE_BASE_URL="https://diary-study-app.vercel.app" npm run smoke
```

To also verify a specific invite link:

```bash
SMOKE_BASE_URL="https://diary-study-app.vercel.app" \
SMOKE_INVITE_URL="https://diary-study-app.vercel.app/join/your-token" \
npm run smoke
```

The smoke check confirms public auth pages load, protected pages redirect to login, the reminder endpoint is protected, and the optional invite link renders.

## Screenshot uploads

Screenshot uploads require `BLOB_READ_WRITE_TOKEN` from [Vercel Blob](https://vercel.com/docs/storage/vercel-blob). Without it, the upload API will fail. If you don't need screenshot questions, simply don't add screenshot-type questions to your studies.
