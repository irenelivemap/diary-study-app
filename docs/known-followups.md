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

### In-App Password Change

Status: Addressed

Users can sign in, use password recovery, and change their password from the signed-in profile page.

Why it matters: new admin or researcher accounts may start with a temporary password. They need a clear way to replace it without asking a technical person to reset it or using the forgot-password flow unnecessarily.

Resolution:

- `/profile` includes a password section for signed-in users.
- The user must enter their current password before choosing a new one.
- The app rejects short passwords, mismatched confirmation, incorrect current passwords, and reusing the same password.
- Existing password reset tokens are cleared after a successful change.
- The password recovery flow remains available for users who are locked out.

### Team Access Management

Status: Partially addressed

Admin users can now be invited from the admin profile/settings page, under Team access. The app creates or promotes the invited user as an admin, generates a password setup link through the existing reset-password flow, and shows a copyable setup link as a fallback if email delivery is not reliable. The command-line `npm run create-admin` script remains available for emergencies or first-time setup.

Why it matters: sharing one login is risky because access cannot be revoked per person and it is harder to know who did what. A reviewer may also expect a researcher/admin product to have a visible way to invite team members.

Current limits:

- The first version supports admins only.
- There is not yet a separate `Researcher` role with narrower permissions.
- Admin access can be removed for other admins, but users are demoted to participant rather than deleted.
- The app prevents removing your own admin access and prevents removing the last admin.

Suggested next fix:

- Decide the exact difference between `Admin` and `Researcher`.
- Add a narrower `Researcher` role only after permissions are defined.

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

### Remaining Cleanup Summary

Status: Open

This is the short current list after the June 19 cleanup pass.

Must do before real rollout:

- Verify the Resend email sending domain so Gmail invitations and reminders are reliable.
- Protect `main` in GitHub so required checks pass before changes land.
- Review database indexes after importing production-like data with `npm run review:indexes`.

Worth doing next:

- Extract the individual participant detail page data loading into a dedicated server-side module.
- Add browser coverage for pointer drag/drop in the tag lab.
- Add browser coverage for AI grouping review, including apply and cancel states.
- Decide whether the app needs a narrower `Researcher` role, or whether simple admin access is enough for now.

Can wait:

- Decide whether signed commits are expected by the company.
- Consider on-demand free-text drill-down loading only if very large studies make the Analysis page heavy.
- Decide whether daily reminders are enough, or whether Vercel Pro/external scheduling is needed.

### Technical Cleanup Priority List

Status: Mostly addressed

Use this as the recommended order for cleanup work. The goal is not to rewrite the app; it is to make the most-used researcher and participant flows easier to maintain, easier to test, and less likely to slow down as real study data grows.

Current summary: seven items are addressed for the current product scale, and one remains a production-data review task.

1. Create dedicated data-loading modules for study pages.

   Why it matters: several researcher pages still build their own Prisma queries directly inside page files. That makes pages harder to review and makes it easy for one tab to accidentally fetch more data than it needs. A deeper module for overview, participants, analysis and data loading would give each page a small interface and keep query details in one place.

   Current status: addressed for the current study pages. The shared study shell, Overview, Participants, Analysis, Analysis tag lab and Data pages now load through dedicated server-side modules.

2. Move large Analysis and Data filtering to the server.

   Why it matters: the browser still receives a lot of answer data for larger studies. This is fine for current demo-scale data, but real studies may have many participants, entries and answers. Server-side filtering, pagination and summaries would keep the interface faster and reduce memory use in the browser.

   Current status: addressed for current scale. Data table filtering, search and pagination run on the server. Analysis filters run through the server, and per-question chart summaries are prepared server-side so the browser no longer needs raw answer arrays for every chart. Free-text answer detail is still sent where the interface needs word clouds, theme distribution, CSV export and tagging links.

3. Define a shared study-shell module and keep tab pages thin.

   Why it matters: the study navigation was improved with a shared layout, but the pattern should be made explicit so future pages do not recreate their own navigation, session checks or loading behavior. This protects the smoother tab-switching interaction.

   Current status: addressed. Study pages now share one layout, and `npm run qa:study-shell` checks that tab pages do not reintroduce duplicate shells or blocky route-level loading placeholders.

4. Add integration tests for participant invite, join and entry submission.

   Why it matters: these are the most important real-world flows. A small number of tests that exercise the full path would catch broken invite links, account/session issues, and entries that save but do not appear in researcher views.

   Current status: addressed for current flows. Browser QA covers invite signup/join, participant entry submission and the saved answer appearing in the researcher Data view.

5. Add integration tests for researcher analysis/tagging behavior.

   Why it matters: the tag lab and analysis views are central to the product and have changed quickly. Tests should cover creating tags, grouping themes, applying AI-generated tags, deleting selected tags, and confirming that the analysis overview shows theme-level summaries.

   Current status: partially addressed. Browser QA now checks that theme-level summaries appear in Analysis without exposing raw child tag labels. It also covers tag-lab keyboard reorder, selected tag deletion, and selected theme deletion that keeps child tags ungrouped. More tag-lab interaction coverage is still useful for pointer drag/drop and AI grouping review flows.

6. Extract the individual participant detail page data loader.

   Why it matters: the participant detail route still owns a larger Prisma query and display-shaping logic directly inside the page file. Extracting it into a dedicated module would match the cleaned-up pattern used by Overview, Participants, Data, Analysis and the Analysis tag lab.

   Current status: open. This is useful, but lower risk than the list, Analysis, Data and tag-lab paths already cleaned up.

7. Split remaining large client modules when they become hard to change.

   Why it matters: `AnalysisDashboard`, `DataExplorer` and `StudyForm` still contain many responsibilities. They do not need a cosmetic split, but when touching them next, extract deeper modules around real concepts: chart rendering, dataset filtering, export preparation, setup editing and validation.

   Current status: addressed as far as is useful now. Server-side data preparation for Analysis and Data has moved out of the page files. The large client modules should be split only when the next change needs a clearer internal seam, rather than splitting them cosmetically.

8. Standardize loading and pending states across researcher pages.

   Why it matters: the app should feel calm when moving between tabs or submitting forms. Loading states should be small and local, not full-page flashes or placeholder blocks unless there is genuinely no existing context to keep on screen.

   Current status: addressed for study tabs. The operating guide now records the stable-shell/no-blocky-skeleton principle.

9. Review database indexes after real data exists.

   Why it matters: current indexes were added based on expected access patterns. Once there is real production-like data, check the slowest queries and add or adjust indexes based on evidence rather than guessing.

   Current status: workflow added. Run `npm run review:indexes` against a production-like database to inspect query plans for common researcher data paths.

Verification added or updated:

- `npm run qa:study-shell` checks that study tabs keep the shared navigation shell and do not reintroduce page-level skeleton flashes.
- `npm run qa:scaling` checks that Data, Analysis, Participants and participant dashboard pages keep their data loading behind dedicated modules, that Analysis keeps server-prepared question summaries, and that Prisma scripts use the shared database URL resolver.
- Browser QA includes invite signup/join, participant entry submission, researcher Data visibility, theme-level Analysis summaries, and core tag-lab selection/reorder/delete behavior.
- `npm run review:indexes` gives a repeatable way to inspect common researcher query plans after importing production-like data.

### Researcher Views at Larger Study Sizes

Status: Addressed for current scale

The Data tab now applies table filters, search and pagination on the server, so the browser receives only the current page of entry rows. The Analysis tab now applies its main row filters on the server and receives server-calculated top summary metrics plus server-prepared per-question chart summaries. Detailed answer rows remain available for free-text analysis because the current UI needs them for word clouds, theme distribution, CSV export and tagging links. `npm run qa:scaling` keeps the current seams in place.

Why it matters: the current approach is much safer for small and medium studies, and the Data table is ready for larger response lists. Very large studies may still need deeper drill-down endpoints for free-text examples, but standard charts no longer depend on shipping every answer value to the browser.

Suggested fix:

- After real study data exists, review whether free-text word clouds and exports should load answer detail on demand instead of with the initial Analysis page.
- Keep detailed answer rows available only where the UI needs examples, tagging, export or drill-down interactions.

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
