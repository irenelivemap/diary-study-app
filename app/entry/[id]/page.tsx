import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { getSession } from '@/app/lib/session'
import { prisma } from '@/app/lib/db'
import { sanitizeHtml } from '@/app/lib/sanitize-html'
import { ButtonLink } from '@/app/components/ui'

function formatAnswerValue(value: string, type: string) {
  if (type !== 'MULTIPLE_CHOICE') return value
  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed)) return parsed.map(String).join(', ')
  } catch {}
  return value
}

function isJourneyStage(part: { flow?: string | null }) {
  return part.flow === 'JOURNEY_STAGE'
}

function localDate(timeZone?: string | null) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timeZone || undefined,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

export default async function EntryPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) redirect('/login')

  const { id } = await params
  const entry = await prisma.entry.findUnique({
    where: { id },
    include: {
      part: { select: { id: true, name: true, flow: true } },
      study: {
        select: {
          id: true,
          name: true,
          journeyName: true,
          participantEntryAccess: true,
          isArchived: true,
          status: true,
          parts: {
            where: { isActive: true },
            orderBy: { order: 'asc' },
            select: { id: true, name: true, flow: true },
          },
        },
      },
      user: { select: { name: true, email: true } },
      answers: {
        include: {
          question: { select: { id: true, text: true, type: true, order: true } },
        },
      },
      journey: { include: { entries: { select: { partId: true } } } },
    },
  })

  if (!entry) notFound()
  if (session.role !== 'ADMIN' && entry.userId !== session.userId) redirect('/dashboard')
  if (session.role !== 'ADMIN' && (entry.study.isArchived || entry.study.status === 'ARCHIVED')) redirect('/dashboard')

  const sorted = [...entry.answers].sort((a, b) => a.question.order - b.question.order)
  const isOwnEntry = entry.userId === session.userId
  const isPastEntry = entry.date !== localDate(entry.timezone)
  if (isOwnEntry && isPastEntry && entry.study.participantEntryAccess === 'HIDE_PAST_ENTRIES') {
    redirect('/dashboard')
  }
  const backHref = `/admin/studies/${entry.studyId}`
  const journeyParts = entry.study.parts.filter(isJourneyStage)
  const journeyCompletedPartIds = new Set(entry.journey?.entries.map((journeyEntry) => journeyEntry.partId) ?? [])
  const nextJourneyPart = entry.journeyId
    ? journeyParts.find((part) => !journeyCompletedPartIds.has(part.id))
    : null
  const isJourneyEntry = !!entry.journeyId && isJourneyStage(entry.part)

  return (
    <div className="min-h-screen bg-[var(--bg-page)]">
      <header className="bg-white/90 backdrop-blur-md border-b border-[var(--border)] sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {isOwnEntry ? (
              <Link href="/dashboard" className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-white px-2.5 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-sunken)] hover:text-[var(--text)]">
                <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 13L5 8l5-5" /></svg>
                Dashboard
              </Link>
            ) : (
              <Link href={backHref} aria-label="Back" className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-white px-2.5 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-sunken)]">
                <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 13L5 8l5-5" /></svg>
                Back
              </Link>
            )}
            <div className="min-w-0 border-l border-[var(--border-subtle)] pl-3">
              <p className="truncate text-sm font-semibold text-slate-900">{entry.study.name}</p>
              <p className="text-xs text-slate-500">{entry.date}{session.role === 'ADMIN' && ` · ${entry.user.name}`}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <span className="text-xs text-slate-500">Submitted</span>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-3">
        {isOwnEntry && (
          <div className="rounded-2xl border border-emerald-100 bg-white shadow-sm">
            <div className="border-b border-emerald-50 px-5 py-5">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-700">
                  OK
                </div>
                <div className="min-w-0">
                  <p className="text-base font-bold text-slate-950">Entry submitted</p>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600">
                    Your answers were saved. You can review them below.
                  </p>
                </div>
              </div>
            </div>

            <div className="px-5 py-5">
              {isJourneyEntry && nextJourneyPart ? (
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">Next available: {nextJourneyPart.name}</p>
                    <p className="mt-1 text-sm leading-relaxed text-slate-600">
                      Return to your dashboard and answer the next stage when that moment applies.
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                    <ButtonLink href="/dashboard" size="md" className="w-full sm:w-auto">
                      Back to dashboard
                    </ButtonLink>
                    <ButtonLink
                      href={`/entry/new?studyId=${entry.studyId}&partId=${nextJourneyPart.id}&journeyId=${entry.journeyId}`}
                      tone="secondary"
                      size="md"
                      className="w-full sm:w-auto"
                    >
                      Answer next
                    </ButtonLink>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {isJourneyEntry ? `${entry.study.journeyName || 'Journey'} complete` : 'You are done for now'}
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-slate-600">
                      {isJourneyEntry
                        ? 'All stages are submitted.'
                        : 'Go back to your dashboard when you are ready.'}
                    </p>
                  </div>
                  <ButtonLink href="/dashboard" tone="secondary" size="md" className="shrink-0">
                    Back to dashboard
                  </ButtonLink>
                </div>
              )}
            </div>
          </div>
        )}
        {sorted.map((answer) => (
          <div key={answer.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <p className="text-sm font-medium text-slate-500 mb-2" dangerouslySetInnerHTML={{ __html: sanitizeHtml(answer.question.text) }} />
            {answer.question.type === 'SCREENSHOT' ? (
              answer.value
                ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={answer.value} alt="Screenshot" className="rounded-xl max-h-64 object-contain border border-slate-100" />
                  )
                : <p className="text-sm text-slate-500">No screenshot provided</p>
            ) : (
              <p className="text-slate-800 text-sm leading-relaxed">
                {formatAnswerValue(answer.value, answer.question.type) || <span className="text-slate-300">-</span>}
              </p>
            )}
          </div>
        ))}
      </main>
    </div>
  )
}
