# API Routes

## Summary

This folder contains server route handlers used by background jobs, uploads, and provider diagnostics. These endpoints are not general public APIs; each one should be protected according to its purpose.

## Routes

| Route | What it does |
|---|---|
| `reminders/run` | Protected endpoint for cron or manual reminder processing. |
| `upload` | Authenticated upload endpoint for participant screenshot/image answers. |
| `test-anthropic` | Diagnostic endpoint for checking AI provider connectivity in development/admin contexts. |

## Security Rule

API routes must validate authentication or secrets before performing work. Upload routes must also check that the user is allowed to upload for the target study/part/question.
