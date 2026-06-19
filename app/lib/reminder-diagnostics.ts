/**
 * Builds diagnostic information for reminder configuration and delivery readiness.
 */
export type ReminderDiagnosticLog = {
  status: string
  sentAt: Date | string
}

export type ReminderDiagnostic = {
  tone: 'neutral' | 'ok' | 'warning' | 'critical'
  label: string
  detail: string
  recentSent: number
  recentFailed: number
  lastAttemptAt: string | null
}

const RECENT_WINDOW_DAYS = 7
const STALE_WINDOW_DAYS = 7

function toDate(value: Date | string) {
  return value instanceof Date ? value : new Date(value)
}

function daysBetween(later: Date, earlier: Date) {
  return (later.getTime() - earlier.getTime()) / (1000 * 60 * 60 * 24)
}

export function buildReminderDiagnostic(
  enabled: boolean,
  logs: ReminderDiagnosticLog[],
  now = new Date()
): ReminderDiagnostic {
  const parsedLogs = logs
    .map((log) => ({ ...log, sentAt: toDate(log.sentAt) }))
    .filter((log) => !Number.isNaN(log.sentAt.getTime()))
    .sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime())
  const lastAttemptAt = parsedLogs[0]?.sentAt ?? null
  const recentLogs = parsedLogs.filter((log) => daysBetween(now, log.sentAt) <= RECENT_WINDOW_DAYS)
  const recentSent = recentLogs.filter((log) => log.status === 'SENT').length
  const recentFailed = recentLogs.filter((log) => log.status !== 'SENT').length
  const lastAttemptValue = lastAttemptAt?.toISOString() ?? null

  if (!enabled) {
    return {
      tone: 'neutral',
      label: 'Reminders are off',
      detail: 'Turn them on in Setup when you want diARI to send automatic prompts.',
      recentSent,
      recentFailed,
      lastAttemptAt: lastAttemptValue,
    }
  }

  if (parsedLogs.length === 0) {
    return {
      tone: 'warning',
      label: 'No reminder attempts recorded yet',
      detail: 'After the next scheduled or manual run, sent and failed attempts will appear here.',
      recentSent,
      recentFailed,
      lastAttemptAt: lastAttemptValue,
    }
  }

  if (recentFailed > 0 && recentSent === 0) {
    return {
      tone: 'critical',
      label: 'Recent reminder attempts failed',
      detail: 'Check the sender domain, Resend API key, and the participant email addresses before relying on automatic reminders.',
      recentSent,
      recentFailed,
      lastAttemptAt: lastAttemptValue,
    }
  }

  if (recentFailed > 0) {
    return {
      tone: 'warning',
      label: 'Some reminders failed recently',
      detail: 'Most reminders may still be working, but review the failed rows below.',
      recentSent,
      recentFailed,
      lastAttemptAt: lastAttemptValue,
    }
  }

  if (lastAttemptAt && daysBetween(now, lastAttemptAt) > STALE_WINDOW_DAYS) {
    return {
      tone: 'warning',
      label: 'No recent reminder activity',
      detail: 'If this study is still running, confirm the Vercel cron job is active and the schedule matches your fieldwork.',
      recentSent,
      recentFailed,
      lastAttemptAt: lastAttemptValue,
    }
  }

  return {
    tone: 'ok',
    label: 'Recent reminders look healthy',
    detail: 'Reminder sends have been recorded without recent failures.',
    recentSent,
    recentFailed,
    lastAttemptAt: lastAttemptValue,
  }
}
