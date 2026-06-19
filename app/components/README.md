# Components

## Summary

This folder contains reusable UI components for participant flows, researcher/admin screens, forms, charts, navigation, study setup, data exploration, analysis, and team access.

## Main Component Groups

| Area | What to look for |
|---|---|
| Study setup | `StudyForm.tsx`, rich text editing, question controls, drag-and-drop setup interactions. |
| Participant entry | `EntryForm.tsx`, `PreviewForm.tsx`, `RatingInput.tsx`, date/time and upload inputs. |
| Analysis and data | `AnalysisDashboard.tsx`, `DataExplorer.tsx`, `WordCloudChart.tsx`, tag-lab components. |
| Admin operations | participant invite/removal forms, reminders, study status, study actions, team access. |
| Shared UI | `ui.tsx`, navigation, copy buttons, select menus, logo, tabs. |

## Design Rule

Use the shared components and visual tokens before adding one-off styles. Interaction patterns should follow `DESIGN.md`, especially for destructive actions, dropdowns, selection, and drag-and-drop.
