# App Folder

## Summary

This folder contains the Next.js application: routes, server actions, reusable UI components, API endpoints, and shared domain logic. It is the main source area for product behavior.

## Main Areas

| Folder | What it contains |
|---|---|
| `actions/` | Server actions that mutate data, such as authentication, studies, entries, reminders, analysis, and team access. |
| `admin/` | Researcher/admin routes for study management, participants, data, analysis, setup, preview, and team/settings views. |
| `api/` | API route handlers for reminders, uploads, and provider test endpoints. |
| `components/` | Reusable client and server UI components. |
| `dashboard/` | Participant dashboard route. |
| `entry/` | Participant entry creation and read-only submitted-entry routes. |
| `join/` | Participant invitation and join flow routes. |
| `journey/` | Journey detail route. |
| `lib/` | Shared business logic, data loaders, validation, session, email, reminders, and study analysis helpers. |
| `login/`, `signup/`, `forgot-password/`, `reset-password/`, `profile/` | Account and profile routes. |

## Notes For Reviewers

This app uses the Next.js App Router. Pages and layouts live in route folders, while most shared product logic is intentionally kept in `app/lib` and `app/actions` so routes stay easier to read.
