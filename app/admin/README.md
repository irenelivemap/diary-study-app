# Admin Routes

## Summary

This folder contains researcher/admin routes for managing studies, reviewing participants and entries, analysing responses, configuring studies, previewing participant forms, and managing team access.

## Main Areas

| Route area | What it does |
|---|---|
| `page.tsx` | Main admin study list. |
| `studies/[id]/` | Study overview, participants, data, analysis, setup/edit, and preview routes. |
| `team/` | Admin/team access route. |
| `settings/` | Admin settings route. |

## Access Rule

Every admin route must explicitly require an admin session before rendering admin data. The access audit script checks this expectation.
