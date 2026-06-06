import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
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

export default async function JourneyPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) redirect('/login')

  const { id } = await params
  const journey = await prisma.journey.findUnique({
    where: { id },
    include: {
      study: {
        include: {
          parts: {
            where: { isActive: true, flow: 'JOURNEY_STAGE' },
            orderBy: { order: 'asc' },
            select: { id: true, name: true, order: true },
          },
        },
      },
      user: { select: { id: true, name: true } },
      entries: {
        orderBy: { submittedAt: 'asc' },
        include: {
          part: { select: { id: true, name: true, order: true } },
          answers: {
            include: { question: true },
          },
        },
      },
    },
  })

  if (!journey) notFound()
  if (session.role !== 'ADMIN' && journey.userId !== session.userId) redirect('/dashboard')
  if (
    session.role !== 'ADMIN' &&
    journey.study.participantEntryAccess === 'HIDE_PAST_ENTRIES'
  ) {
    redirect('/dashboard')
  }

  const isOwnJourney = journey.userId === session.userId
  const backHref = isOwnJourney ? '/dashboard' : `/admin/studies/${journey.studyId}/participants/${journey.userId}`
  const entriesByPart = new Map(journey.entries.map((entry) => [entry.partId, entry]))
  const completedCount = journey.study.parts.filter((part) => entriesByPart.has(part.id)).length

  return (
    <div className="min-h-screen bg-[#F7F8FC]">
      <header className="sticky top-0 z-10 border-b border-slate-100 bg-white">
        <div className="mx-auto flex h-14 max-w-2xl items-center justify-between px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link href={backHref} aria-label="Back" className="text-sm text-slate-400 transition-colors hover:text-slate-600">
              Back
            </Link>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">{journey.label ?? journey.study.journeyName ?? journey.study.name}</p>
              <p className="text-xs text-slate-400">
                {completedCount}/{journey.study.parts.length} stages submitted
              </p>
            </div>
          </div>
          {journey.completedAt && (
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
              Completed
            </span>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-4 px-4 py-6 sm:px-6 sm:py-8">
        <div className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-emerald-700">{journey.study.name}</p>
          <h1 className="mt-1 text-xl font-bold text-slate-950">{journey.label ?? journey.study.journeyName ?? 'Journey'}</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Read-only summary of what was submitted.
          </p>
          <ButtonLink href={backHref} tone="secondary" size="md" className="mt-4 w-full sm:w-auto">
            Back
          </ButtonLink>
        </div>

        {journey.study.parts.map((part) => {
          const entry = entriesByPart.get(part.id)
          return (
            <section key={part.id} className={`rounded-2xl border p-5 shadow-sm ${
              entry ? 'border-emerald-100 bg-white' : 'border-slate-100 bg-slate-50'
            }`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  {entry && (
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                        Submitted
                      </span>
                      <span className="text-xs font-medium text-slate-500">
                        {entry.submittedAt.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                      </span>
                    </div>
                  )}
                  <p className="text-base font-bold text-slate-950">{part.name}</p>
                  {!entry && <p className="mt-1 text-sm text-slate-500">No entry submitted</p>}
                </div>
              </div>

              {entry ? (
                <div className="mt-4 space-y-3">
                  {entry.answers
                    .slice()
                    .sort((a, b) => a.question.order - b.question.order)
                    .map((answer) => (
                      <div key={answer.id} className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                        <p className="text-sm font-medium text-slate-600" dangerouslySetInnerHTML={{ __html: sanitizeHtml(answer.question.text) }} />
                        {answer.question.type === 'SCREENSHOT' ? (
                          answer.value ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={answer.value} alt="Uploaded answer" className="mt-3 max-h-64 rounded-xl border border-slate-100 object-contain" />
                          ) : (
                            <p className="mt-2 text-sm text-slate-400">No screenshot provided</p>
                          )
                        ) : (
                          <p className="mt-2 text-sm leading-relaxed text-slate-900">
                            {formatAnswerValue(answer.value, answer.question.type) || <span className="text-slate-300">-</span>}
                          </p>
                        )}
                      </div>
                    ))}
                </div>
              ) : (
                <p className="mt-4 text-sm leading-relaxed text-slate-500">
                  This stage was not submitted.
                </p>
              )}
            </section>
          )
        })}
      </main>
    </div>
  )
}
