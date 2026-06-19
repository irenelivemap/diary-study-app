# Prisma Migrations

## Summary

This folder contains the database change history for diARI. Each dated folder is one migration: a set of SQL instructions that updates the database structure so it matches the app code.

## Why This Folder Exists

The app stores studies, participants, entries, answers, tags, reminders, invitations, users, and password reset data in PostgreSQL. When the app needs a new table, column, index, or relationship, Prisma records that change here.

`schema.prisma` describes what the database should look like now. The migration folders describe how to safely get an existing database to that shape.

## How It Is Used

For production or a shared database, run:

```bash
npx prisma migrate deploy
```

That command applies any migration folders that have not been applied yet.

## Important Rule

Do not edit old migration SQL files after they have been applied to a database. Prisma tracks migrations, and changing old files can cause deployment or checksum problems.

For future database changes, create a new migration instead of changing a previous one.
