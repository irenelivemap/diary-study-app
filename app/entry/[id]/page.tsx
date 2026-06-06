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
      part: true,
      study: {
        include: {
          parts: { where: { isActive: true }, orderBy: { order: 'asc' } },
        },
      },
      user: { select: { name: true, email: true } },
      answers: { include: { question: true } },
      journey: { include: { entries: { select: { partId: true } } } },
    },
  })

  if (!entry) notFound()
  if (session.role !== 'ADMIN' && entry.userId !== session.userId) redirect('/dashboard')

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
    <div className="min-h-screen bg-[#F7F8FC]">
      <header className="bg-white border-b border-slate-100 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {!isOwnEntry && (
              <Link href={backHref} aria-label="Back to study" className="text-slate-400 hover:text-slate-600 transition-colors text-sm">←</Link>
            )}
            <div>
              <p className="text-sm font-semibold text-slate-900">{entry.study.name}</p>
              <p className="text-xs text-slate-400">{entry.date}{session.role === 'ADMIN' && ` · ${entry.user.name}`}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 bg-emerald-400 rounded-full" />
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
                <div className="rounded-2xl bg-indigo-50 px-4 py-4">
                  <p className="text-sm font-semibold text-indigo-700">Recommended next</p>
                  <h2 className="mt-1 text-lg font-bold text-slate-950">{nextJourneyPart.name}</h2>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">
                    Continue this {entry.study.journeyName || 'journey'} when this moment applies.
                  </p>
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    <ButtonLink
                      href={`/entry/new?studyId=${entry.studyId}&partId=${nextJourneyPart.id}&journeyId=${entry.journeyId}`}
                      size="md"
                      className="w-full sm:w-auto"
                    >
                      Continue to {nextJourneyPart.name}
                    </ButtonLink>
                    <ButtonLink href="/dashboard" tone="secondary" size="md" className="w-full sm:w-auto">
                      Dashboard
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
                        ? 'All stages for this visit are submitted.'
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
                : <p className="text-sm text-slate-400">No screenshot provided</p>
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
