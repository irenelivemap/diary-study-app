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

### Technical Cleanup Priority List

Status: Mostly addressed

Use this as the recommended order for cleanup work. The goal is not to rewrite the app; it is to make the most-used researcher and participant flows easier to maintain, easier to test, and less likely to slow down as real study data grows.

Current summary: six items are addressed for the current product scale, one item is partially addressed, and one remains a production-data review task.

1. Create dedicated data-loading modules for study pages.

   Why it matters: several researcher pages still build their own Prisma queries directly inside page files. That makes pages harder to review and makes it easy for one tab to accidentally fetch more data than it needs. A deeper module for overview, participants, analysis and data loading would give each page a small interface and keep query details in one place.

   Current status: addressed for the current study pages. The shared study shell, Overview, Analysis and Data pages now load through dedicated server-side modules.

2. Move large Analysis and Data filtering to the server.

   Why it matters: the browser still receives a lot of answer data for larger studies. This is fine for current demo-scale data, but real studies may have many participants, entries and answers. Server-side filtering, pagination and summaries would keep the interface faster and reduce memory use in the browser.

   Current status: partially addressed. Analysis and Data now have dedicated data-loading modules, which gives this work a cleaner seam, and `npm run qa:scaling` checks that these pages keep using those modules. The actual large-study filtering and pagination still needs product decisions about URL filters, export behavior and chart summaries.

3. Define a shared study-shell module and keep tab pages thin.

   Why it matters: the study navigation was improved with a shared layout, but the pattern should be made explicit so future pages do not recreate their own navigation, session checks or loading behavior. This protects the smoother tab-switching interaction.

   Current status: addressed. Study pages now share one layout, and `npm run qa:study-shell` checks that tab pages do not reintroduce duplicate shells or blocky route-level loading placeholders.

4. Add integration tests for participant invite, join and entry submission.

   Why it matters: these are the most important real-world flows. A small number of tests that exercise the full path would catch broken invite links, account/session issues, and entries that save but do not appear in researcher views.

   Current status: addressed for current flows. Browser QA covers invite signup/join, participant entry submission and the saved answer appearing in the researcher Data view.

5. Add integration tests for researcher analysis/tagging behavior.

   Why it matters: the tag lab and analysis views are central to the product and have changed quickly. Tests should cover creating tags, grouping themes, applying AI-generated tags, deleting selected tags, and confirming that the analysis overview shows theme-level summaries.

   Current status: partially addressed. Browser QA now checks that theme-level summaries appear in Analysis without exposing raw child tag labels. More tag-lab interaction coverage is still useful, especially for drag/drop, selected delete, and AI grouping review flows.

6. Split remaining large client modules when they become hard to change.

   Why it matters: `AnalysisDashboard`, `DataExplorer` and `StudyForm` still contain many responsibilities. They do not need a cosmetic split, but when touching them next, extract deeper modules around real concepts: chart rendering, dataset filtering, export preparation, setup editing and validation.

   Current status: addressed as far as is useful now. Server-side data preparation for Analysis and Data has moved out of the page files. The large client modules should be split only when the next change needs a clearer internal seam, rather than splitting them cosmetically.

7. Standardize loading and pending states across researcher pages.

   Why it matters: the app should feel calm when moving between tabs or submitting forms. Loading states should be small and local, not full-page flashes or placeholder blocks unless there is genuinely no existing context to keep on screen.

   Current status: addressed for study tabs. The operating guide now records the stable-shell/no-blocky-skeleton principle.

8. Review database indexes after real data exists.

   Why it matters: current indexes were added based on expected access patterns. Once there is real production-like data, check the slowest queries and add or adjust indexes based on evidence rather than guessing.

   Current status: workflow added. Run `npm run review:indexes` against a production-like database to inspect query plans for common researcher data paths.

Verification added or updated:

- `npm run qa:study-shell` checks that study tabs keep the shared navigation shell and do not reintroduce page-level skeleton flashes.
- `npm run qa:scaling` checks that Data, Analysis and participant dashboard pages keep their data loading behind dedicated modules, and that Prisma scripts use the shared database URL resolver.
- Browser QA includes invite signup/join, participant entry submission, researcher Data visibility, and theme-level Analysis summaries.
- `npm run review:indexes` gives a repeatable way to inspect common researcher query plans after importing production-like data.

### Researcher Views at Larger Study Sizes

Status: Partially addressed

The Data tab now applies table filters, search and pagination on the server, so the browser receives only the current page of entry rows. Analysis fetches entry data through a dedicated, narrower direct query, but still builds most summaries in the browser. `npm run qa:scaling` keeps the current seams in place.

Why it matters: the current approach is much safer for small and medium studies, and the Data table is ready for larger response lists. Very large studies can still send a lot of answer data to the browser on the Analysis tab.

Suggested fix:

- Move Analysis filtering and summary generation further to the server.
- Keep summary charts lightweight by fetching only the rows needed for the selected Analysis filters.

### Participant Dashboard Query Size

Status: Addressed for current scale

The participant dashboard now selects only the fields needed to decide what the participant can answer next and to show small entry/journey summaries. Its query is isolated in `loadParticipantDashboardData`, so the page no longer imports Prisma directly.

Why it matters: this keeps the dashboard fast without changing what the participant sees. A deeper split may still be useful if participants join many studies or create a high volume of journey entries.

Suggested fix:

- Monitor dashboard load time once real study data exists.
- If needed, split dashboard data into a small initial query plus follow-up counts.

### Entry Submit Revalidation Scope

Status: Addressed for current scale

After a participant submits an entry, the app now refreshes the study admin subtree with a single invalidation instead of listing every researcher page one by one.

Why it matters: this keeps researcher pages fresh while reducing submit-action bookkeeping.

Suggested fix:

- If submit latency becomes an issue at production scale, replace path revalidation with narrower cache tags or targeted refreshes.

### Postgres SSL Mode Warning

Status: Addressed

QA logs were showing a warning from the Postgres connection string parser about future SSL behavior:

`sslmode=prefer`, `require`, and `verify-ca` are currently treated like `verify-full`, but this behavior will change in a future major version.

Why it matters: this was not breaking QA, but it was noisy and could become a real configuration issue after dependency upgrades.

Resolution:

- `.env.example` now uses `sslmode=verify-full`.
- The app, QA scripts, seed scripts and browser tests use one shared `resolveDatabaseUrl()` helper so a Neon-style `sslmode=require` value is normalized before Prisma/pg parses it.

## Review Checklist

When reviewing this file:

1. Remove items that are fully resolved.
2. Add new issues discovered during QA, production use, or reviewer feedback.
3. Update `Last reviewed`.
4. Keep each item written in plain English: what it is, why it matters, and what to do next.
