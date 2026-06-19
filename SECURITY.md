# Security Notes

## Summary

This document lists the security expectations for the app: required secrets, production email/upload settings, AI data-handling cautions, dependency audit notes, and known hardening gaps.

## Secrets

Do not commit `.env` files or production secrets. Use `.env.example` as the safe template.

Production must define:

- `DATABASE_URL`
- `SESSION_SECRET`
- `NEXT_PUBLIC_APP_URL`

Recommended for production:

- `CRON_SECRET`
- `RESEND_API_KEY`
- `EMAIL_FROM`
- `BLOB_READ_WRITE_TOKEN`
- `ANTHROPIC_API_KEY` if AI analysis is approved

## AI-assisted analysis

The tag lab can send participant free-text answers and tag labels to an AI provider for tagging and theme grouping.

Default behavior:

- `AI_PROVIDER` unset or `anthropic`: uses Anthropic and requires `ANTHROPIC_API_KEY`.
- `AI_PROVIDER=ollama`: uses a local OpenAI-compatible Ollama endpoint.

Before using AI features with real participant data, confirm that consent language, company privacy policy and vendor/data-processing rules allow this.

## Dependency audit

Run:

```bash
npm audit
```

At the time of this handoff preparation, `npm audit` reports zero vulnerabilities.

The project uses npm `overrides` to force patched transitive versions for dependencies currently pinned by upstream packages:

- `@hono/node-server@1.19.14`, used through Prisma tooling.
- `postcss@8.5.15`, used through Next/Tailwind tooling.

Keep these overrides until Prisma and Next ship compatible dependency updates that no longer need them. Re-check after framework upgrades.

Also run:

```bash
npm outdated
```

Patch-level updates for Next, React, Vercel Blob, Resend, Playwright and related packages should be handled in a dedicated dependency update PR with `npm run build` and QA checks.

## Known hardening gaps

- Screenshot uploads can contain sensitive participant information. Study consent/instructions should explicitly tell participants what not to upload.

## Login protection

Sign-in attempts are throttled with a database-backed limiter, keyed by hashed email address and hashed client IP address. Five failed attempts in a 15-minute window trigger a 15-minute block. Successful sign-in clears the matching email limiter record while keeping IP-level protection intact.

## Rich text sanitization

Study setup supports limited rich-text formatting for question text and answer options. Saved and rendered HTML is sanitized with the maintained `sanitize-html` package. The allowed formatting is intentionally narrow: basic inline formatting, lists, line breaks, safe links and restricted color/font-size styles.
