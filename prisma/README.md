# Prisma

## Summary

This folder defines the database schema and checked-in migrations for the app. It is the source of truth for tables such as users, studies, participants, entries, answers, invitations, reminders, tags, and password reset tokens.

## Files And Folders

| Path | What it does |
|---|---|
| `schema.prisma` | Prisma schema used to generate the client and define the application data model. |
| `migrations/` | Ordered SQL migrations that should be deployed with `npx prisma migrate deploy`. |

## Production Rule

Use checked-in migrations for production. Do not use `prisma db push` against production because it bypasses migration history.
