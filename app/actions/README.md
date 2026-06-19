# Server Actions

## Summary

This folder contains server-side mutations used by forms and interactive workflows. These files change data, enforce permissions, validate input, and revalidate affected pages after changes.

## Files

| File | What it does |
|---|---|
| `analysis.ts` | Runs AI-assisted tagging and theme grouping for analysis workflows. |
| `auth.ts` | Handles sign in, sign out, signup, password reset, and password change actions. |
| `entries.ts` | Creates and deletes participant entries and enforces entry submission rules. |
| `reminders.ts` | Updates reminder settings and sends test/reminder emails. |
| `studies.ts` | Creates, updates, duplicates, archives, deletes, and joins studies. |
| `team.ts` | Invites admins and removes admin access. |

## Permission Rule

Admin actions must explicitly check for admin access before reading or changing admin-only data. Participant actions must only allow the signed-in participant to affect their own records.
