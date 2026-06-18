# Security Notes

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

At the time of this handoff preparation, `npm audit fix` has applied the safe non-forced updates. `npm audit` still reports moderate vulnerabilities in transitive dependencies, specifically Prisma tooling/Hono and Next/PostCSS advisories. npm currently suggests `--force` fixes that would downgrade major framework/tooling versions, so do not apply them blindly. Review them in a dedicated dependency-maintenance PR and either upgrade when compatible patches are available or document the accepted risk when they only affect local tooling.

Also run:

```bash
npm outdated
```

Patch-level updates for Next, React, Vercel Blob, Resend, Playwright and related packages should be handled in a dedicated dependency update PR with `npm run build` and QA checks.

## Known hardening gaps

- Login has no rate limiting. Add provider-level protection or app-level throttling before broad public launch.
- Rich-text HTML is sanitized by local code. Consider replacing it with a maintained sanitizer library before handling high-risk HTML input.
- Screenshot uploads can contain sensitive participant information. Study consent/instructions should explicitly tell participants what not to upload.
