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
      study: true,
      user: { select: { name: true, email: true } },
      answers: { include: { question: true } },
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
          <div className="rounded-2xl border border-emerald-100 bg-white px-5 py-5 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-base font-bold text-slate-950">Entry submitted</p>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">
                  Your answers were saved. This entry is read-only now.
                </p>
              </div>
              <ButtonLink href="/dashboard" tone="secondary" size="md" className="shrink-0">
                Back to dashboard
              </ButtonLink>
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
