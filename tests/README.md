# Tests

## Summary

This folder contains browser-based regression tests for the main participant and researcher workflows. The tests run with Playwright and are included in `npm run qa`.

## Structure

| Folder | What it contains |
|---|---|
| `e2e/` | End-to-end browser tests for invites, auth, participant entries, conditions, admin setup, team access, data, analysis, and tag lab interactions. |

## How To Run

Use the full QA command for normal verification:

```bash
npm run qa
```

For browser tests only:

```bash
npm run qa:browser
```
