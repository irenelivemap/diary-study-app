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

Copy the example file and edit `.env`:

```bash
cp .env.example .env
```

Minimum local values:

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

For local development:

```bash
npm run db:migrate
```

For production deployments, run checked-in migrations:

```bash
npx prisma migrate deploy
```

Do not use `prisma db push` against production. It bypasses migration history and makes schema changes harder to review or roll back.

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
   - `NEXT_PUBLIC_APP_URL` — your stable production URL
   - `CRON_SECRET` — `openssl rand -base64 32`, used to protect reminder cron calls
   - `BLOB_READ_WRITE_TOKEN` — from Vercel Blob (Storage tab)
   - `RESEND_API_KEY` and `EMAIL_FROM` — required for invitation/reminder emails
   - `ANTHROPIC_API_KEY` — required for AI tagging/grouping when `AI_PROVIDER=anthropic`
4. Deploy.
5. Run database migrations with `npx prisma migrate deploy` as part of the deployment process or immediately after deploy.

## Running a study

1. Log in as admin → **New study**
2. Add questions (all types supported)
3. Ask participants to **Sign up** at your app URL
4. In the study page, add each participant by their email
5. Participants see "Submit today's entry" on their dashboard each day
6. View or export results from the study admin page

## Before launching with real participants

- Follow the full operating checklist in [`docs/operating-guide.md`](docs/operating-guide.md).
- Use HTTPS in production.
- Generate a strong `SESSION_SECRET` and never reuse the development placeholder.
- Generate a separate strong `CRON_SECRET` for reminder automation.
- Verify your email sending domain before relying on reminders.
- Set `NEXT_PUBLIC_APP_URL` to the deployed app URL so reminder links point to the right place.
- Decide whether AI-assisted analysis is approved for participant data before enabling `ANTHROPIC_API_KEY`.
- Confirm consent text, contact email, active parts, and preview flow before inviting participants.
- Export a test CSV and confirm it contains the columns you need.
- Keep database backups enabled in your hosting provider.

## AI-assisted analysis and participant data

The analysis tag lab can use AI to suggest answer tags and group tags into themes. By default this uses Anthropic when `AI_PROVIDER` is unset or set to `anthropic`.

That means free-text participant answers and existing tag labels may be sent to Anthropic during AI tagging/grouping. Confirm this is acceptable under your company privacy, consent and data-processing rules before using the feature with real participant data.

For local experimentation, developers can set `AI_PROVIDER=ollama` to use a local OpenAI-compatible Ollama endpoint instead.

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

For the full QA pass, seed stable QA fixtures and run the public, participant, and admin checks:

```bash
QA_BASE_URL="https://diary-study-app.vercel.app" npm run qa
```

This creates two clearly named QA studies, a participant account, and checks the public auth pages, participant dashboard, profile return path, simple and journey entries, researcher pages, data table, analysis page, and CSV export. Use a database and app URL that point to the same environment.

If you need to debug a specific layer, run the pieces separately:

```bash
npm run qa:env
npm run qa:actions
npm run qa:dataset
npm run qa:seed
QA_BASE_URL="https://diary-study-app.vercel.app" npm run smoke
QA_BASE_URL="https://diary-study-app.vercel.app" npm run qa:flow
```

To run the real browser check, which signs in as the QA participant and submits a simple entry through the UI:

```bash
QA_BASE_URL="https://diary-study-app.vercel.app" npm run qa:browser
```

If this is the first time running browser QA on a machine, install the Chromium browser once:

```bash
npx playwright install chromium
```

## GitHub Actions

Two workflows keep the app safer:

- `CI` runs automatically on pushes and pull requests. It checks environment basics, participant action rules, answer dataset rules, TypeScript, and production build.
- `Production QA` is manual. Open GitHub Actions, choose `Production QA`, keep the production URL, and run it after Vercel deploys.

The manual production QA workflow needs these GitHub repository secrets:

- `DATABASE_URL`
- `SESSION_SECRET`

Use the same values that are configured in Vercel so the QA fixtures are created in the production database being tested.

## Screenshot uploads

Screenshot uploads require `BLOB_READ_WRITE_TOKEN` from [Vercel Blob](https://vercel.com/docs/storage/vercel-blob). Without it, the upload API will fail. If you don't need screenshot questions, simply don't add screenshot-type questions to your studies.
