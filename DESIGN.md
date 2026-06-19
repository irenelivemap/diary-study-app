# diARI — Design System

## Summary

This document is the visual and interaction reference for diARI. It defines the design tokens, component rules, drag-and-drop behavior, and UI principles that future design and engineering work should follow.

> This document is the authoritative reference for the visual system. All tokens are defined in `app/globals.css`. Components in `app/components/ui.tsx` implement the base set. See `PRODUCT.md` for design intent and audience brief.

---

## 1. Design Tokens

Tokens are CSS custom properties defined in `:root`. **Never use a raw hex value or Tailwind literal where a token exists.** This makes global changes a one-line edit.

### Backgrounds

| Token | Value | Usage |
|---|---|---|
| `--bg-page` | `#F8F7F5` | Page canvas — warm off-white |
| `--bg-surface` | `#FFFFFF` | Cards, panels, modals |
| `--bg-sunken` | `#F4F2EF` | Inputs, inset zones, code blocks |
| `--bg-overlay` | `rgba(15,23,42,0.45)` | Modal scrims |

### Borders

| Token | Value | Usage |
|---|---|---|
| `--border` | `#E6E3DD` | Default card/section border |
| `--border-subtle` | `#EDEAE5` | Dividers between items in a list |
| `--border-strong` | `#DDD9D2` | Input borders, interactive elements |
| `--border-focus` | `#818CF8` | Focus ring on inputs |

### Text

| Token | Value | Usage |
|---|---|---|
| `--text` | `#0F172A` | Primary body copy |
| `--text-secondary` | `#475569` | Supporting body, descriptions |
| `--text-tertiary` | `#64748B` | Metadata, captions |
| `--text-muted` | `#94A3B8` | Placeholder text, disabled |
| `--text-on-accent` | `#FFFFFF` | Text on filled primary surfaces |
| `--text-link` | `#4F46E5` | Links and interactive text |

> **Rule:** Do not use `text-slate-400` or lighter for text that carries information a participant must read. `--text-tertiary` is the floor for any label that matters.

### Brand / Primary action

| Token | Value | Usage |
|---|---|---|
| `--accent` | `#4F46E5` | Primary buttons, focus rings, active state |
| `--accent-hover` | `#4338CA` | Hover state for primary elements |
| `--accent-active` | `#3730A3` | Pressed state |
| `--accent-subtle` | `#EEF2FF` | Tinted backgrounds (indigo-50) |
| `--accent-muted` | `#C7D2FE` | Borders on tinted zones (indigo-200) |
| `--accent-ring` | `rgba(79,70,229,0.25)` | Focus ring glow |

### Semantic colors

Each semantic state has three tokens: `bg`, `border`, `text`.

| State | bg | border | text | dot |
|---|---|---|---|---|
| **Success** | `#ECFDF5` | `#A7F3D0` | `#065F46` | `#10B981` |
| **Warning** | `#FFFBEB` | `#FDE68A` | `#92400E` | `#F59E0B` |
| **Danger** | `#FEF2F2` | `#FECACA` | `#991B1B` | `#EF4444` |
| **Info** | `#EEF2FF` | `#C7D2FE` | `#3730A3` | — |

Usage pattern for a semantic banner:
```tsx
<div style={{ background: 'var(--success-bg)', border: '1px solid var(--success-border)', color: 'var(--success-text)' }}>
  All entries submitted.
</div>
```

### Phase colors (8-color rotation)

Used in study parts and journey stages to visually distinguish phases. Defined in `app/lib/phase-colors.ts`. The rotation cycles through: **blue → violet → teal → amber → rose → cyan → slate → purple**.

Each phase entry has three variants:
- `solid` — filled pill badge (white text, used on dark bg)
- `soft` — tinted badge (used inline in lists)
- `border` — border for framed elements

---

## 2. Typography

### Fonts

| Role | Font | Variable |
|---|---|---|
| UI / body | **Inter** | `--font-sans` |
| Display / editorial | **Lora** | `--font-serif` |
| Code | SFMono / Consolas | `--font-mono` |

Both loaded via `next/font/google` in `app/layout.tsx`. CSS variables are injected on `<html>`.

### Size scale

| Token | Value | Tailwind | Min use-case |
|---|---|---|---|
| `--text-2xs` | 11px | `.text-2xs` | Only for ornamental labels (eyebrows) |
| `--text-xs` | 13px | `text-xs` | Fine print, `<caption>`, metadata |
| `--text-sm` | 15px | `text-sm` | Body, labels, table rows |
| `--text-base` | 16px | `text-base` | Default body, question text |
| `--text-lg` | 18px | `text-lg` | Card headings |
| `--text-xl` | 20px | `text-xl` | Section headings |
| `--text-2xl` | 24px | `text-2xl` | Page headings |
| `--text-3xl` | 30px | `text-3xl` | Hero / dashboard greeting |

**Rule:** Never use `text-xs` for text a participant must act on. Metadata (dates, counts, phase labels) may use it. Question text, instructions, and status messages must be `text-sm` (15px) minimum.

### Weights

| Name | Value | Use |
|---|---|---|
| Medium | 500 | Body copy with slight emphasis |
| Semibold | 600 | Labels, button text, card titles |
| Bold | 700 | Page headings, stat values |

### Line heights

| Token | Value | Use |
|---|---|---|
| `--leading-tight` | 1.25 | Display headings, large numerics |
| `--leading-snug` | 1.375 | Card headings (1–2 lines) |
| `--leading-normal` | 1.5 | Default body |
| `--leading-relaxed` | 1.625 | Paragraph text, instructions |

### Semantic classes

| Class | Description |
|---|---|
| `.eyebrow` | ALL-CAPS section label above a card or heading. 11px, tracked, `--text-tertiary` |
| `.eyebrow-wide` | Looser eyebrow for spacious layouts |
| `.fine` | Secondary prose — captions, helper text. 13px, `--text-tertiary` |
| `.editorial` | Lora serif display text for brand moments |
| `.stat-value` | Large metric number. Bold, tabular-nums, tight tracking |
| `.stat-caption` | Label below a stat. 12px muted |
| `.tabular` | Apply `font-variant-numeric: tabular-nums` to any element with numbers that must align |

---

## 3. Spacing

Base unit: **4px**. Use multiples.

| Scale | px | Tailwind | Use |
|---|---|---|---|
| 1 | 4 | `p-1`, `gap-1` | Icon padding, micro gaps |
| 2 | 8 | `p-2`, `gap-2` | Tight inline gaps |
| 3 | 12 | `p-3`, `gap-3` | Default gap between items |
| 4 | 16 | `p-4`, `gap-4` | Section internal padding |
| 5 | 20 | `p-5` | Card default padding |
| 6 | 24 | `p-6` | Card padding on wider screens |
| 8 | 32 | `py-8` | Page vertical rhythm |
| 12 | 48 | `p-12` | Empty state padding |

**Card padding convention:** `p-5` default, `sm:p-6` at wider breakpoints.  
**Page max-width:** `max-w-2xl` for participant screens, `max-w-6xl` for admin.  
**Page horizontal padding:** `px-4 sm:px-6`.

---

## 4. Radius

| Token | Value | Use |
|---|---|---|
| `--radius-sm` | 6px | Tiny chips, dot indicators |
| `--radius-md` | 8px | Small badges, phase labels |
| `--radius-lg` | 12px | Buttons `size="sm"`, small inputs |
| `--radius-xl` | 14px | Buttons `size="md/lg"`, text inputs |
| `--radius-2xl` | 16px | Cards, panels, form sections |
| `--radius-3xl` | 20px | Large cards, modals |
| `--radius-full` | 9999px | Pills, avatars, status dots |

In Tailwind: `rounded-lg` = 8px, `rounded-xl` = 12px, `rounded-2xl` = 16px, `rounded-full` = full. Our `--radius-xl` (14px) is slightly between Tailwind's `rounded-xl` and `rounded-2xl`.

---

## 5. Shadows

| Token | Use |
|---|---|
| `--shadow-sm` | Minimal card lift — default for most cards |
| `--shadow-md` | Interactive cards, hovered states |
| `--shadow-lg` | Dropdown menus, floating panels |
| `--shadow-xl` | Modals, dialogs |

In practice most cards use Tailwind's `shadow-sm` or the explicit `shadow-[0_1px_3px_rgba(0,0,0,0.07),0_1px_2px_rgba(0,0,0,0.04)]`. Avoid `shadow-lg` and above on static content.

---

## 6. Components

### Buttons

Defined in `app/components/ui.tsx`. Use `<Button>`, `<ButtonLink>`, `<IconButton>`.

| Tone | When to use |
|---|---|
| `primary` | One primary action per view. CTA, submit, confirm |
| `secondary` | Alternative action alongside a primary |
| `ghost` | Tertiary navigation, inline tools (nav links, back button) |
| `danger` | Destructive actions — always secondary to confirm |
| `trash` | Icon-only delete — always with confirmation |

| Size | Height | Use |
|---|---|---|
| `sm` | 36px | Inside tables, inline alongside text |
| `md` (default) | 40px | Most cases |
| `lg` | 48px | Primary CTA, full-width form actions |

**Rule:** One `primary` button per screen section. If two actions are equally important, use `primary` + `secondary`. Never two `primary` buttons side-by-side.

### Inputs

Text: `<TextInput>` from `ui.tsx`. Style: warm `--bg-sunken` background → white on focus, `--border-strong` border → `--border-focus` on focus, indigo ring `ring-indigo-400/30`.

Textarea: same pattern with `resize-y` and `min-rows-4`.

Choice inputs (radio / checkbox): **styled card rows** — full-width tappable, indigo highlight on selection. Never use native browser inputs visible to participants.

### Cards

`<Card>` from `ui.tsx`. Base: `bg-white rounded-2xl border border-[var(--border)] shadow-[var(--shadow-md)]`.

Variants used in-app:
- **Default card** — white surface, `--shadow-md`
- **Tinted card** — `bg-indigo-50/50` or semantic bg for contextual zones
- **Inset zone** — `bg-[var(--bg-sunken)] rounded-xl` inside a card
- **Dashed empty state** — `border-dashed border-[var(--border-strong)]`

### Badges / tags

`<Badge>` from `ui.tsx`. Five semantic tones: `neutral | info | success | warning | danger`.

`<Chip>` — ALL-CAPS label with color tone, used for study mode indicators.

Status dots: `h-2.5 w-2.5 rounded-full` with an explicit status variable, for example `style={{ backgroundColor: 'var(--success-dot)' }}`.

### Select menus / dropdowns

`<SelectMenu>` in `app/components/SelectMenu.tsx`. Use `--border-strong` border, `--bg-surface` background, `--shadow-lg` on open.

### Drag and drop

Use this pattern for researcher-facing drag systems, especially sortable lists, nested lists and analysis organization tools.

Principle: drag should feel precise and calm. The interface should show what is being moved, where it will land, and what changed after drop without adding permanent icon noise.

Required behavior:

- Use a dedicated drag handle, not the whole row, when the row also has selection, editing, expansion or navigation controls.
- Keep the handle subtle at rest. Reveal it on row hover/focus, and keep the grabbed handle visible for the dragged item while dragging.
- While dragging one item, hide competing drag handles on other rows.
- Show a clear insertion indicator before/after rows. Use a strong accent line for exact ordering; do not rely only on row hover tint.
- When dropping into a container, highlight the target container and use concise language such as `Move to {name}` only during drag.
- After a successful drop, briefly highlight the moved row in its new location so the user can visually follow the change.
- The visible motion should resolve to the new location. Avoid interactions where the row appears to snap back before the saved order appears.
- Support keyboard reordering for list items, for example `Alt+ArrowUp` and `Alt+ArrowDown`, and expose `aria-keyshortcuts`.
- Persist order immediately when the user drops; show a compact success/error notice only when useful.
- If multiple selected items can move together, drag them as a block and make the overlay label say what is moving, such as `3 selected tags`.

Visual hierarchy:

- Parent containers should look like containers; child rows should be visually quieter. Avoid card-within-card-within-card effects.
- Use one expansion pattern per object type. If tags expand through an answer-count control, all tag rows should use that same control.
- Do not add repeated row-level destructive icons to dense draggable lists. Use selection plus a nearby bulk delete action, with confirmation placed in the same section as the triggering control.

---

## 7. Status states

| State | Colour family | When |
|---|---|---|
| Active / open | Emerald (success) | Study accepting entries, goal reached, submitted |
| Pending / awaiting | Indigo (info) | Action ready, recommended stage |
| Warning | Amber | Overdue, needs attention, near deadline |
| Closed / ended | Slate neutral | Study closed, part locked, no action |
| Danger / error | Red | Destructive, validation failure, removed |
| Draft | Slate 50% opacity | Unpublished / preparation mode |

Study status label mapping:

| DB status | Label | Badge tone |
|---|---|---|
| `PREPARATION` | Preparation | neutral |
| `ACTIVE` | Active | success |
| `PAUSED` | Paused | warning |
| `CLOSED` | Closed | neutral |
| `ARCHIVED` | Archived | neutral |

---

## 8. Tables (admin screens)

- Font: `text-sm` (`--text-sm` = 15px) minimum. Never `text-xs` for data cells.
- Numbers: apply `.tabular` class for alignment.
- Row height: min 44px for comfortable click targets.
- Zebra stripe: `odd:bg-[var(--bg-sunken)]` or `divide-y divide-[var(--border-subtle)]`.
- Empty state: centered illustration + message inside the table's bounding box.
- Overflow: `overflow-x-auto` wrapper on the table container for mobile.

---

## 9. Charts / analysis plots

- Background: `--bg-surface` (white)
- Axes / grid lines: `--border-subtle` (#EDEAE5)
- Axis labels: `--text-muted` (13px)
- Data labels: `--text-secondary` (15px)
- Primary series color: `--accent` (#4F46E5)
- Secondary series: cycle through phase colors (blue, teal, amber, rose…)
- Avoid red for data unless it signifies a semantic error state (red is reserved for danger).
- No chart title inside the chart — use a heading above the chart component instead.
- Tooltips: `--bg-surface`, `--shadow-lg`, `--border`, 13px text.

---

## 10. Do / Don't quick reference

| Do | Don't |
|---|---|
| Use `--text-tertiary` as the floor for informational text | Use `text-slate-400` or lighter for any text a user must read |
| Use full-width card rows for choice inputs on mobile | Use native `<input type="radio">` or `<input type="checkbox">` visible to participants |
| One `primary` button per section | Stack two `primary` buttons side-by-side |
| Apply `.tabular` to any numeric column | Mix proportional and tabular numbers in a table |
| Use `--border-strong` for input borders | Use `--border` on inputs (too subtle at rest) |
| Wrap tables in `overflow-x-auto` | Let tables break layout on narrow screens |
| Keep `text-sm` (15px) for all body copy | Drop to `text-xs` for important status messages |
| Use `--shadow-md` on cards | Use `shadow-lg` or above on static cards |
| Use semantic token for status (e.g. `--success-bg`) | Use raw hex or Tailwind color for semantic state |
