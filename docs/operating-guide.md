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

CSV exports are anonymized by default. Participant names/emails are replaced with stable participant IDs such as `P001`, and demographic profile fields are excluded. Turn anonymization off only when you explicitly need direct identifiers, demographics, or operational fields for work like incentive reconciliation or participant follow-up.

## Data And Analysis Reference

Use `Data` when you need the row-level spreadsheet view. Use `Analysis` when you need question-level summaries and plots.

### Data tab

Each row represents one submitted entry. Standard entries and journey-stage entries both appear here; journey entries include the journey label when available so related stages can be connected.

Core fields:

- `Entry ID`: internal row identifier.
- `Data type`: `Fieldwork` or `Pilot`.
- `Participant`: anonymized participant ID by default in CSV exports.
- `Email`: excluded while `Anonymize download` is on.
- `Journey`: the journey label or ID for journey-based studies.
- `Part`: the study part or stage.
- `Date`: participant-local entry date.
- `Submitted time`: actual submission timestamp.
- `Timezone`: participant timezone used for dates and reminders.
- `Quality flags`: automatic flags such as very short text or retrospective event time.
- `Study version`: setup version at the time of export, so question edits can be interpreted carefully.

Export behavior:

- `Anonymize download` is on by default.
- Column checkboxes choose what goes into CSV; the table stays visible even when a column is not selected.
- Free-text questions export both the answer and a `{question} tags` column.
- Identifiable exports may include names, email and optional profile/demographic fields. Use them only for operational needs.
- `Fieldwork data only` excludes pilot rows. Include pilot data only for pilot review or methodological checks.

Deletion behavior:

- Deleting one entry removes that row from Data, Analysis, participant counts and exports.
- Screenshot/upload answers attached to the deleted entry are removed from Blob storage when storage is configured.

### Analysis tab

The top cards summarize the filtered analysis set:

- `Entries analyzed`: entries after filters and pilot-data selection.
- `Participants represented`: distinct participants represented in those entries.
- `Answer completion`: answered expected answers divided by eligible expected answers.
- `Missing answers`: eligible answers without a value. Answers hidden by conditions are shown separately and are not treated as ordinary missing answers.

Filters apply to all plots and cards:

- Part
- Participant
- Question type
- Date range
- Fieldwork / pilot data

### Question plots

General rules:

- Plots use percentages as the main visual unit so studies with different numbers of entries can be compared more easily.
- Hover interactions show counts where available.
- Use the pencil control to change plot title/subtitle and y-axis settings for presentation/export.
- Use the download control to export PNG, SVG or CSV when available.
- Screenshot questions are not plotted; they are reviewed as files.

Rating scales:

- Show average, median and middle 50% when numeric scale data supports it.
- Interpret averages carefully on ordinal scales. Median, spread and distribution shape are often more important than the mean.
- Long scales are binned when needed so labels and extremes remain readable.

Single choice, multiple choice and yes/no:

- Show percentage distribution across selected options.
- Top options are highlighted consistently.
- Multiple choice percentages may add to more than 100% because participants can select more than one option.
- Useful metrics include top option, gap to runner-up and options used.

Free text:

- Starts as a list of answers.
- Create tags per question before tagging answers.
- Tags are manual, can overlap and can have colors.
- Tag percentages may add to more than 100% because one answer can have multiple tags.
- Filter by tag to review tagged subsets.
- Tags are included in CSV exports.

Date/time:

- Summaries group submitted event times into readable distributions.
- Participants can use `Now` in the entry form when the event is happening at submission time.

Journey continuity:

- `Journeys started`: number of journey instances represented in the filtered data.
- `All stages submitted`: journeys with all expected stages captured.
- `Avg. stages per journey`: average stage coverage per journey.
- `Stage coverage`: how often each stage is captured across journeys.
- Use this to check continuity, not just volume. A study can have many entries but weak continuity if stages are not connected within the same journey.

### Recommended analysis workflow

1. Start with `Fieldwork data only`.
2. Check `Answer completion`, `Missing answers` and `Data quality notes`.
3. Review participant progress if missingness looks concentrated.
4. Inspect each question plot for distribution shape and outliers.
5. For free text, define tags per question, tag a first pass, then review tag summaries.
6. For journey studies, review `Journey continuity` before interpreting stage-to-stage relationships.
7. Export plots only after checking titles, subtitles and axis settings.
8. Export anonymized CSV for analysis by default.
9. Export identifiable CSV only for a specific operational reason.

## Destructive Actions

Use the least destructive action that solves the problem:

- Close: stop participant submissions but keep the study in Current studies and keep read-only participant visibility available when enabled.
- Archive: move to Past studies, hide it from participant dashboards and keep all data.
- Delete permanently: remove the study and all responses. Requires explicit confirmation.
- Remove participant: blocks future participation. Choose whether to keep or delete their existing data.
- Delete entry: removes one submitted entry from data, analysis, participant counts and exports.
- Uploaded answer files attached to deleted entries are also removed from Blob storage when storage is configured.

## Retention And Deletion Policy

Default principle: keep research data until the researcher intentionally removes it, and make every destructive action explicit.

| Action | Participant access after action | Data kept | Data removed |
| --- | --- | --- | --- |
| Close study | Participants cannot submit new entries. Read-only submitted entries may remain visible if the study setting allows it. | Study setup, participants, entries, answers, journeys, tags, analysis, exports, reminder logs and uploads. | Nothing. |
| Archive study | Study disappears from participant dashboards and direct participant links no longer open it. | Study setup, participants, entries, answers, journeys, tags, analysis, exports, reminder logs and uploads. | Nothing. |
| Delete study permanently | Nobody can access the study. | Nothing for that study. | Study, parts, questions, participants in that study, invitations, entries, answers, journeys, free-text tags, reminder logs and uploaded answer files. |
| Remove participant and keep data | Participant cannot rejoin or continue that study. | Their existing entries remain in analysis, data tables and exports. | Their study participation record is removed and their invite token is invalidated. |
| Remove participant and delete data | Participant cannot rejoin or continue that study. | Their user account remains for other studies. | Their participation, entries, answers, journeys and uploaded answer files for that study. |
| Delete one entry | Participant keeps access to the study if still enrolled. | Other entries and participant record. | That entry, its answers, tags on those answers, and uploaded answer files attached to that entry. |

Operational guidance:

- Prefer `Closed` when fieldwork is over but you still need the study in active operational context.
- Prefer `Archived` when the study is finished and should move out of day-to-day lists.
- Prefer participant removal with data kept when someone should stop participating but their previous data is still part of the sample.
- Use participant removal with data deletion only when their data should be excluded or removed for consent/privacy reasons.
- Use permanent study deletion only when you are sure the entire study and its records should be erased.
- Keep anonymized exports as the default; identifiable exports should be used only for operational needs like incentives, support or participant follow-up.

## Before Calling A Study Finished

1. Study has correct lifecycle status.
2. Invite link works without Vercel login.
3. Email invite works for at least one external inbox.
4. Invite signup/sign-in keeps the participant attached to the study.
5. Reminder test reaches the right destination.
6. Participant can submit on mobile.
7. Researcher can view Data and Analysis.
8. CSV export includes expected answers, tags, timestamps and data type.
9. Upload questions work if used.
10. Archive/close/delete behavior is understood.
11. Production QA workflow passes in GitHub Actions.
