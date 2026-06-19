# Shared App Logic

## Summary

This folder contains shared domain logic, data loaders, validation helpers, email/reminder code, session handling, upload cleanup, and analysis/data preparation. Code here is used by routes, server actions, API handlers, and components.

## Main Areas

| Area | Files |
|---|---|
| Database and sessions | `db.ts`, `database-url.ts`, `session.ts`, `login-rate-limit.ts` |
| Study lifecycle and entry rules | `study-lifecycle.ts`, `entry-state.ts`, `participant-actions.ts`, `validation.ts` |
| Data loading | `participant-dashboard-data.ts`, `study-shell-data.ts`, `study-overview-data.ts`, `study-participants-data.ts`, `study-data-table-data.ts`, `study-analysis-data.ts`, `tag-lab-data.ts` |
| Analysis/data shaping | `answer-dataset.ts`, `choice-options.ts`, `phase-colors.ts`, `demographics.ts` |
| Email and reminders | `email.ts`, `invitations.ts`, `password-reset.ts`, `participant-removal.ts`, `reminders.ts`, `reminder-links.ts`, `reminder-diagnostics.ts` |
| Safety helpers | `sanitize-html.ts`, `upload-cleanup.ts`, `invitation-access.ts` |

## Review Rule

This folder is where cross-screen behavior should usually live. If the same logic appears in multiple routes or components, prefer moving it here instead of duplicating it.
