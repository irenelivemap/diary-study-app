/**
 * Checks the diagnostic output used to understand reminder configuration and delivery issues.
 */
import assert from 'node:assert/strict'
import { buildReminderDiagnostic } from '../app/lib/reminder-diagnostics'

const now = new Date('2026-06-11T12:00:00.000Z')

const off = buildReminderDiagnostic(false, [], now)
assert.equal(off.tone, 'neutral')
assert.equal(off.label, 'Reminders are off')

const noAttempts = buildReminderDiagnostic(true, [], now)
assert.equal(noAttempts.tone, 'warning')
assert.equal(noAttempts.recentSent, 0)
assert.equal(noAttempts.recentFailed, 0)

const healthy = buildReminderDiagnostic(true, [
  { status: 'SENT', sentAt: '2026-06-11T08:00:00.000Z' },
  { status: 'SENT', sentAt: '2026-06-10T08:00:00.000Z' },
], now)
assert.equal(healthy.tone, 'ok')
assert.equal(healthy.recentSent, 2)
assert.equal(healthy.recentFailed, 0)

const partialFailure = buildReminderDiagnostic(true, [
  { status: 'SENT', sentAt: '2026-06-11T08:00:00.000Z' },
  { status: 'FAILED', sentAt: '2026-06-11T08:05:00.000Z' },
], now)
assert.equal(partialFailure.tone, 'warning')
assert.equal(partialFailure.recentSent, 1)
assert.equal(partialFailure.recentFailed, 1)

const allFailed = buildReminderDiagnostic(true, [
  { status: 'FAILED', sentAt: '2026-06-11T08:00:00.000Z' },
], now)
assert.equal(allFailed.tone, 'critical')
assert.equal(allFailed.recentSent, 0)
assert.equal(allFailed.recentFailed, 1)

const stale = buildReminderDiagnostic(true, [
  { status: 'SENT', sentAt: '2026-05-30T08:00:00.000Z' },
], now)
assert.equal(stale.tone, 'warning')
assert.equal(stale.recentSent, 0)
assert.equal(stale.recentFailed, 0)

console.log('Reminder diagnostic checks passed.')
