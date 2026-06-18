# diARI — Product Design Brief

## What it is

diARI is a diary study platform with two distinct audiences:

- **Researchers (admin)** — UXR professionals who design studies, recruit participants, monitor submissions, and analyse data. They work on desktop, value density, and need operational clarity.
- **Participants** — People completing diary entries, often on mobile, mid-task or in-the-moment. They need to focus, respond quickly, and feel like the app trusts them.

---

## Tone

**Calm. Clear. Research-grade.**

The app should feel like a well-designed research instrument — not a consumer wellness app, not a generic SaaS dashboard. Think: Linear meets a good research journal. Quiet confidence, not decoration.

- No marketing language
- No gamification or celebration noise
- No clutter, no tooltips explaining obvious things
- Errors are honest, not apologetic

---

## Participant UI principles

These screens are the product's most important. A participant opens a study link from a reminder SMS at 9pm on their phone.

1. **Mobile-first, thumb-friendly.** Tap targets ≥ 44px. Choice options are full-width cards, not small radio buttons.
2. **One thing at a time.** One question card per scroll viewport when possible. Don't overwhelm.
3. **No tiny gray text.** Minimum 15px for body, 13px for metadata. Contrast ≥ 4.5:1 always.
4. **Warm, not clinical.** Background is off-white (`#F8F7F5`), not cold blue-gray. Borders are warm (`#E6E3DD`).
5. **Progress is visible.** Multi-page forms show a progress bar and page count. Participants should never feel lost.
6. **Draft-safe.** Answers auto-save to localStorage. Participants can close and return.

---

## Researcher UI principles

Admin screens are dense by necessity — studies, participants, entries, exports.

1. **Density without clutter.** Tables and lists use tight spacing but keep readable contrast.
2. **Status is always clear.** Study status (Draft / Active / Closed / Archived) is always visible and actionable.
3. **Destructive actions are guarded.** Delete/archive require confirmation. No accidental data loss.
4. **Analysis views stay readable.** Charts and data tables prioritise legibility over aesthetics.

---

## Design tokens

| Token | Value | Notes |
|---|---|---|
| Background | `#F8F7F5` | Warm off-white, not cold |
| Surface | `#FFFFFF` | Cards and modals |
| Border | `#E6E3DD` | Warm, not slate |
| Foreground | `#0F172A` | Near-black |
| Accent | `#4F46E5` | Indigo-600 |
| Accent hover | `#4338CA` | Indigo-700 |
| Font (UI) | Inter | via next/font/google |
| Font (editorial) | Lora | Serif italic for display moments |

---

## What to avoid

- Tiny helper text in `slate-400` that's hard to read on mobile
- Native radio/checkbox inputs — use styled card options
- Cold blue-gray backgrounds (`#F7F8FC` family)
- Shadow-heavy cards that feel like floaty material design
- Animations longer than 200ms on interactive elements
- Decorative elements that don't carry information

---

## Key screens

| Screen | Audience | Notes |
|---|---|---|
| `/dashboard` | Participant | First thing they see. Greeting + study cards with clear next action. |
| `/entry/new` | Participant | The core UX. One form, one focus. Mobile priority. |
| `/join/[token]` | Participant | First impression. Minimal, welcoming. |
| `/admin` | Researcher | Study list. Density is fine. |
| `/admin/studies/[id]` | Researcher | Study hub: overview, participants, data, analysis tabs. |
| `/admin/studies/[id]/analysis` | Researcher | Data visualisation. Clarity > decoration. |
