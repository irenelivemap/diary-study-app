# diARI Operating Guide

This guide is the repeatable checklist for running diARI with real participants.

## Study Lifecycle

Use the lifecycle status deliberately:

- `In preparation`: build the study and pilot it. Entries created here are pilot data.
- `Active`: real fieldwork. Participants can join and submit entries. Automatic reminders can run.
- `Closed`: fieldwork is stopped. Data, analysis and exports remain available. Participants can no longer submit; they may still see read-only past entries if that study setting is enabled.
- `Archived`: the study moves to Past studies. Data is kept, participant activity stays stopped, and participant dashboards/direct participant links no longer show the study.

Pilot data is excluded from participant progress, analysis, data tables, exports and reminders by default. Turn on the pilot-data toggle only when you intentionally want to inspect pilot rows.

## Before Real Participants

Run these checks before sharing study links broadly:

1. Confirm the study status is `In preparation`.
2. Use Preview to check every page, condition, required question and upload question.
3. Add yourself as a participant and complete a pilot entry.
4. Check Analysis and Data with pilot data included.
5. Confirm the Data tab export contains the expected columns.
6. Check the participant dashboard on mobile width.
7. Send a test reminder to yourself.
8. Confirm invite email opens the correct join/dashboard flow.
9. Move the study to `Active` only after pilot checks pass.

## Local QA

Run fast local checks after code changes:

```bash
npm run qa:env
npm run qa:access
npm run qa:access-audit
npm run qa:actions
npm run qa:reminders
npm run qa:reminder-delivery
npm run qa:dataset
npm run typecheck
npm run build
```

Run broader QA when checking production behavior:

```bash
SMOKE_BASE_URL="https://diary-study-app.vercel.app" npm run smoke
```

If you have a valid invite link:

```bash
SMOKE_BASE_URL="https://diary-study-app.vercel.app" \
SMOKE_INVITE_URL="https://diary-study-app.vercel.app/join/VALID_TOKEN" \
npm run smoke
```

## Production Environment

Required:

- `DATABASE_URL`: Neon/Postgres connection string.
- `SESSION_SECRET`: long random secret, at least 32 characters.
- `NEXT_PUBLIC_APP_URL`: canonical production URL, for example `https://diary-study-app.vercel.app`.

Recommended for real fieldwork:

- `RESEND_API_KEY`: sends invitations, reminders and removal emails.
- `EMAIL_FROM`: verified Resend sender.
- `CRON_SECRET`: protects `/api/reminders/run`.
- `BLOB_READ_WRITE_TOKEN`: enables image/screenshot uploads.

Screenshot and image uploads are participant data. Only ask for screenshots when the study protocol really needs them, and tell participants not to upload passwords, payment information, private messages, customer data, or confidential work material.
Participant entry uploads are stored as private Blob files and served through authenticated diARI routes. Researchers can view them in admin screens; participants can view their own submitted files.

Check locally:

```bash
npm run qa:env
```

For stricter production checking:

```bash
CHECK_PRODUCTION_ENV=true npm run qa:env
```

## Database Migrations

After deploying code that includes a new Prisma migration, run:

```bash
npx prisma migrate deploy
```

Use `migrate deploy` for production. Do not use `db push` on production.

## Inviting Participants

Preferred flow:

1. Add participant email in the Participants tab.
2. Send the invitation email.
3. Participant opens the invite link.
4. Participant signs up or logs in.
5. diARI adds them to the study automatically.

If Gmail delivery is unreliable while using Resend test/onboarding domains, use a verified sender/domain before relying on Gmail participants.

## Reminders

Automatic reminders:

- Only run for `Active` studies.
- Use each participant's timezone.
- Open the participant dashboard for journey or multi-part studies so participants can choose the right stage.
- Can deep-link directly to the entry form only when there is a single clear part to answer.
- Exclude pilot entries when deciding whether someone is due.

Manual test:

- Use `Send test to me` to send a reminder immediately, independent of the scheduled reminder time.
- Use recent reminder activity in the Overview tab to check recipient, part, date, status, and errors.

Production cron endpoint:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://diary-study-app.vercel.app/api/reminders/run
```

## Data Review

Use this order:

1. Participants tab: check recruitment/progress.
2. Data tab: inspect individual rows, filters, pilot/fieldwork data, exports.
3. Analysis tab: inspect question-level distributions and free-text tags.
4. Participant detail: inspect one participant's entries if something looks odd.

Keep `Fieldwork data only` as the default view unless you are specifically reviewing pilots.

CSV exports are anonymized by default. Participant names/emails are replaced with stable participant IDs such as `P001`. Turn anonymization off only when you explicitly need direct identifiers for operations like incentive reconciliation or participant follow-up.

## Destructive Actions

Use the least destructive action that solves the problem:

- Close: stop participant submissions but keep the study in Current studies and keep read-only participant visibility available when enabled.
- Archive: move to Past studies, hide it from participant dashboards and keep all data.
- Delete permanently: remove the study and all responses. Requires explicit confirmation.
- Remove participant: blocks future participation. Choose whether to keep or delete their existing data.
- Delete entry: removes one submitted entry from data, analysis, participant counts and exports.
- Uploaded answer files attached to deleted entries are also removed from Blob storage when storage is configured.

## Before Calling A Study Finished

1. Study has correct lifecycle status.
2. Invite link works without Vercel login.
3. Email invite works for at least one external inbox.
4. Reminder test reaches the right destination.
5. Participant can submit on mobile.
6. Researcher can view Data and Analysis.
7. CSV export includes expected answers, tags, timestamps and data type.
8. Upload questions work if used.
9. Archive/close/delete behavior is understood.
10. Production QA workflow passes in GitHub Actions.
