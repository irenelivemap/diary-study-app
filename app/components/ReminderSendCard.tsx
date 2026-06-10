'use client'

import { useState, useTransition } from 'react'
import { sendReminderTestEmail, sendStudyRemindersNow } from '@/app/actions/reminders'
import { Button } from '@/app/components/ui'

type ReminderSummary = {
  configured: boolean
  checked: number
  sent: number
  skipped: number
  failed: number
  errors: string[]
  skippedByReason: Record<string, number>
}

type TestSummary = {
  configured: boolean
  sent: boolean
  error: string | null
}

type Props = {
  studyId: string
  enabled: boolean
  reminderTime: string
  embedded?: boolean
  recentLogs: {
    id: string
    status: string
    date: string
    sentAt: string
    error: string | null
  }[]
}

export default function ReminderSendCard({ studyId, enabled, reminderTime, embedded = false, recentLogs }: Props) {
  const [pending, startTransition] = useTransition()
  const [testPending, startTestTransition] = useTransition()
  const [summary, setSummary] = useState<ReminderSummary | null>(null)
  const [testSummary, setTestSummary] = useState<TestSummary | null>(null)
  const failedLogs = recentLogs.filter((log) => log.status !== 'SENT').length

  return (
    <div className={`w-full ${embedded ? '' : 'bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden'}`}>
      <div className={`${embedded ? 'px-5 py-4' : 'px-5 py-4 border-b border-slate-100'} flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3`}>
        {!embedded && (
          <div>
            <h2 className="text-sm font-semibold text-slate-700">Email reminders</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {enabled
                ? `Enabled. Automatic runs send after ${reminderTime || '18:00'} in each participant's timezone.`
                : 'Disabled. Turn this on in Setup when you are ready to send reminders.'}
            </p>
          </div>
        )}
        {embedded && (
          <p className="text-sm leading-relaxed text-slate-600">
            {enabled
              ? `Automatic reminders send after ${reminderTime || '18:00'} in each participant's timezone. Manual send checks the same due-reminder rules.`
              : 'Enable reminders in Setup before sending.'}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={testPending}
            onClick={() => {
              startTestTransition(async () => {
                const result = await sendReminderTestEmail(studyId)
                setTestSummary(result)
              })
            }}
            tone="secondary"
            size="sm"
          >
            {testPending ? 'Sending...' : 'Send test to me'}
          </Button>
          <Button
            type="button"
            disabled={pending || !enabled}
            onClick={() => {
              startTransition(async () => {
                const result = await sendStudyRemindersNow(studyId)
                setSummary(result)
              })
            }}
            tone="secondary"
            size="sm"
          >
            {pending ? 'Sending...' : 'Send due reminders now'}
          </Button>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {summary && (
          <div className={`rounded-xl px-4 py-3 ${summary.configured ? 'bg-slate-50 text-slate-700' : 'bg-amber-50 text-amber-800'}`}>
            <p className="text-sm font-medium">
              {summary.configured
                ? `${summary.checked} checked · ${summary.sent} sent · ${summary.skipped} skipped · ${summary.failed} failed.`
                : 'Email is not configured yet.'}
            </p>
            {!summary.configured && (
              <p className="text-xs mt-1">
                Add `RESEND_API_KEY` and `EMAIL_FROM` to `.env`, then restart the app.
              </p>
            )}
            {summary.errors.length > 0 && (
              <p className="text-xs mt-1">{summary.errors.slice(0, 2).join(' ')}</p>
            )}
            {Object.keys(summary.skippedByReason).length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {Object.entries(summary.skippedByReason).map(([reason, count]) => (
                  <span key={reason} className="rounded-full bg-white px-2 py-1 text-xs text-slate-600">
                    {reason}: {count}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {testSummary && (
          <div className={`rounded-xl px-4 py-3 ${testSummary.sent ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>
            <p className="text-sm font-medium">
              {testSummary.sent ? 'Test reminder sent to your admin email.' : 'Test reminder failed.'}
            </p>
            {testSummary.error && <p className="mt-1 text-xs">{testSummary.error}</p>}
          </div>
        )}

        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recent reminder activity</p>
            {failedLogs > 0 && (
              <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">
                {failedLogs} failed
              </span>
            )}
          </div>
          {recentLogs.length === 0 ? (
            <p className="text-sm text-slate-500">No reminder attempts yet.</p>
          ) : (
            <div className="divide-y divide-slate-100 rounded-xl border border-slate-100 overflow-hidden">
              {recentLogs.map((log) => (
                <div key={log.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 px-3 py-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${log.status === 'SENT' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                    <span className="font-medium text-slate-700">{log.status === 'SENT' ? 'Sent' : 'Failed'}</span>
                    <span className="text-slate-400">for {log.date}</span>
                  </div>
                  <span className="text-xs text-slate-400">
                    {new Date(log.sentAt).toLocaleString()}
                  </span>
                  {log.error && <p className="text-xs text-red-500 sm:col-span-2">{log.error}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
