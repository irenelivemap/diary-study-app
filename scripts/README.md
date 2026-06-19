# Scripts

## Summary

This folder contains command-line scripts for local setup, QA, production smoke checks, data seeding, reminder processing, and architecture guardrails. Most scripts are run through `npm run ...` commands from `package.json`.

## How To Use This Folder

Start with `npm run qa` for the full local quality check. Use the individual scripts below when you need to diagnose one part of the system.

## QA Orchestration

| Script | What it checks or does |
|---|---|
| `qa.ts` | Runs the full diARI QA sequence against the configured app URL. |
| `qa-seed.ts` | Creates deterministic QA studies, users, invites, and entries used by browser and flow tests. |
| `qa-flow.ts` | Exercises authenticated participant and admin flows through HTTP requests. |
| `smoke.ts` | Checks that public, protected, and upload routes behave correctly on a target deployment. |
| `env-check.ts` | Verifies required and recommended environment variables. |

## Access And Security Checks

| Script | What it checks or does |
|---|---|
| `access-audit.ts` | Audits admin pages for explicit admin access checks. |
| `access-rules-check.ts` | Checks route and role access rules. |
| `participant-actions-check.ts` | Ensures participant-facing actions do not expose admin-only behavior. |
| `invite-flow-check.ts` | Checks participant invitation safety and fallback behavior. |
| `retention-policy-check.ts` | Guards deletion, archive, and data-retention expectations. |
| `upload-cleanup-check.ts` | Checks that uploaded files are cleaned up when related data is removed. |

## Reminder And Email Checks

| Script | What it checks or does |
|---|---|
| `reminder-links-check.ts` | Checks reminder link generation. |
| `reminder-delivery-check.ts` | Checks reminder selection and delivery rules. |
| `reminder-diagnostics-check.ts` | Checks reminder diagnostic output. |
| `send-reminders.ts` | Manually runs reminder sending from the command line. |

## Data, Analysis, And Architecture Checks

| Script | What it checks or does |
|---|---|
| `answer-dataset-check.ts` | Guards the answer dataset shape used by Data and Analysis. |
| `analysis-docs-check.ts` | Ensures analysis/data behavior remains documented. |
| `tag-lab-architecture-check.ts` | Prevents the tag lab from collapsing back into one large component. |
| `setup-drag-architecture-check.ts` | Guards the setup-tab drag-and-drop implementation principles. |
| `study-shell-architecture-check.ts` | Checks shared study shell/page structure. |
| `scaling-architecture-check.ts` | Guards query and pagination patterns added for larger studies. |
| `index-review.ts` | Reviews database index coverage for important query paths. |

## Setup And Seed Scripts

| Script | What it checks or does |
|---|---|
| `create-admin.ts` | Creates an initial admin user from the command line. |
| `seed-demo.ts` | Seeds a basic demo study. |
| `seed-mock-data.ts` | Seeds mock data for local exploration. |
| `seed-badi-journey-demo.ts` | Seeds the Badi visit journey demo. |
| `seed-mobility-demo.ts` | Seeds the mobility-themed demo. |
| `seed-support-journey-demo.ts` | Seeds the support journey demo. |
