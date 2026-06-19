# Tag Lab Components

## Summary

This folder contains the smaller components and hooks that make up the analysis tag lab. The tag lab lets researchers create tags, group them into themes, reorder tags, apply AI grouping, and review tagged answers.

## Structure

| File or group | What it does |
|---|---|
| `TagLab.tsx` | Main tag lab composition point. |
| `TagLabTypes.ts` | Shared tag lab types. |
| `TagLabActions.tsx` | Shared action controls and destructive confirmations. |
| `TagLabAnswers.tsx` | Answer list and answer filtering/tagging UI. |
| `TagLabThemeSection.tsx` | Theme rows and theme-level interactions. |
| `TagLabStandaloneTags.tsx` | Tags that are not currently inside a theme. |
| `TagLabAddControls.tsx` | Manual add controls for themes and tags. |
| `TagLabAiReviewPanel.tsx` | Review panel for AI-generated tag/theme suggestions. |
| `tagLabDrag.ts`, `useTagLabDnd.ts` | Drag-and-drop helpers following the shared drag principles in `DESIGN.md`. |
| `useTagLabState.ts`, `useTagLabFilters.ts`, `useTagLabMutations.ts`, `useTagLabSelection.ts` | State, filtering, mutation, and selection hooks. |

## Architecture Rule

Keep this folder modular. The QA architecture check exists to stop the tag lab from becoming one large, hard-to-review file again.
