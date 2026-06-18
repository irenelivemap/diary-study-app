# Known Follow-Ups

Last reviewed: 2026-06-19

Use this as the lightweight parking lot for issues that are not blocking current use, but should not be forgotten. Review it monthly, before handoff conversations, and after any production QA failure.

## Must Decide Before Real Participant Rollout

### Email Sending Domain

Status: Open

The app can create participant invitations and queue email through Resend, but reliable Gmail delivery requires a verified sending domain in Resend.

Why it matters: without a verified sender domain, invite and reminder emails may be delayed, rejected, or sent to spam. The app now shows a participant-specific invite link after sending an invitation, so links can be copied and sent manually as a temporary fallback.

Current temporary approach:

- Copy the participant-specific invite link after adding a participant.
- Send it manually from a normal trusted email account.

Long-term fix:

- Verify a sending domain or subdomain in Resend, such as `mail.yourdomain.com`.
- Set Vercel `EMAIL_FROM` to a sender on that verified domain, for example `diARI <research@mail.yourdomain.com>`.
- Send a test invitation to Gmail and confirm Resend logs show delivery.

## Operational Follow-Ups

### Reminder Cadence

Status: Open

The Vercel Hobby cron schedule currently runs reminder processing once per day because Hobby projects do not support more frequent cron schedules.

Why it matters: once-per-day reminders may be fine for some diary studies, but journey or in-the-moment studies may need more timely reminders.

Decision needed:

- Keep daily reminders on Vercel Hobby.
- Upgrade Vercel to support more frequent cron.
- Use an external scheduler to call `/api/reminders/run`.

### GitHub Branch Protection

Status: Open

`main` can currently be pushed directly.

Why it matters: branch protection helps prevent accidental direct pushes or merges without passing checks.

Suggested fix:

- Protect `main`.
- Require at least the Vercel deployment check, CI checks, or production QA before merge.

### Signed Commits

Status: Optional

Commits are currently unsigned.

Why it matters: signed commits prove that commits came from a verified key. This is not usually urgent for early prototypes, but some technical reviewers prefer it.

Suggested fix:

- Decide whether signed commits are expected by the company.
- If yes, configure GitHub commit signing for the maintainer account.

## Technical Cleanup

### Postgres SSL Mode Warning

Status: Open

QA logs currently show a warning from the Postgres connection string parser about future SSL behavior:

`sslmode=prefer`, `require`, and `verify-ca` are currently treated like `verify-full`, but this behavior will change in a future major version.

Why it matters: this is not breaking QA now, but it is noisy and could become a real configuration issue after dependency upgrades.

Suggested fix:

- Update the database connection string to explicitly use the intended SSL mode.
- Prefer `sslmode=verify-full` if that matches the current desired behavior.

## Review Checklist

When reviewing this file:

1. Remove items that are fully resolved.
2. Add new issues discovered during QA, production use, or reviewer feedback.
3. Update `Last reviewed`.
4. Keep each item written in plain English: what it is, why it matters, and what to do next.
