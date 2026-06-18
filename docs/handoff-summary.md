# Handoff Summary

Last updated: 2026-06-18

## What This App Does

This is a diary study platform for research teams. Researchers create studies, invite participants, collect diary entries, review results in data/analysis views, tag free-text answers, group tags into themes, and export results.

The app has two main user roles:

- Admin/researcher: creates and manages studies, participants, data, analysis, exports and reminders.
- Participant: joins studies, submits entries, reviews submitted entries and manages their profile.

## Current Branch

Handoff branch:

`main`

The earlier `ui-polish` and `dependency-hardening` branches have been merged into `main`. The stale remote branches were removed after the merge.

## Main Improvements In This Branch

- Fixed dependency audit issues.
- Added login rate limiting backed by a new Prisma `LoginRateLimit` table.
- Replaced the previous HTML sanitizer dependency with maintained `sanitize-html`.
- Split the large tag analysis workspace into focused tag-lab modules and hooks.
- Added a tag-lab architecture QA check so the tag lab does not quietly collapse back into one large file.
- Updated browser QA expectations to match the current UI.
- Made the Vercel cron schedule compatible with Vercel Hobby.

## Required Deployment Step

This branch includes a database migration:

`20260618201500_add_login_rate_limits`

Before using the deployed app, run:

```bash
npx prisma migrate deploy
```

Without this migration, login can fail because the `LoginRateLimit` table will not exist.

## Vercel Cron Note

`vercel.json` currently runs `/api/reminders/run` once per day:

`0 9 * * *`

This is intentional because Vercel Hobby rejects cron jobs that run more than once daily. If the company needs near-real-time reminders, use Vercel Pro and change the schedule back to a more frequent cadence such as:

`*/15 * * * *`

Alternatively, keep Vercel Hobby and trigger `/api/reminders/run` from an external scheduler.

## Verification Completed

Local verification passed on this branch:

- `npm run typecheck`
- `npm run build`
- `npm run qa:reminders`
- Full local production-style QA previously passed with:

```bash
QA_BASE_URL=http://localhost:3001 npm run qa
```

This full QA run included environment checks, access rules, reminder checks, dataset checks, documentation checks, tag-lab architecture checks, smoke checks, authenticated participant/admin flow and Playwright browser checks.

## Current GitHub/Vercel Status

The current `main` branch has a green Vercel deployment status.

During handoff preparation, the previous red GitHub status was from Vercel and said:

`Deployment failed.`

The failure link redirected to Vercel Cron Jobs usage/pricing documentation. The likely cause was the previous cron expression:

`*/15 * * * *`

That expression is not allowed on Vercel Hobby. The app now uses the Hobby-compatible daily cron schedule.

## Recommended Next Steps

1. Confirm the deployment environment is using the intended production database and environment variables.
2. Run `npx prisma migrate deploy` after future schema changes.
3. Confirm the reminder cadence matches the team expectation: daily on Vercel Hobby, or more frequent with Vercel Pro/external scheduling.

## Known Follow-Up Items

Known non-blocking issues and future decisions are tracked in [`Known Follow-Ups`](./known-followups.md).
