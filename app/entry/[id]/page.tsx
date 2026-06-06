import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { getSession } from '@/app/lib/session'
import { prisma } from '@/app/lib/db'
import { sanitizeHtml } from '@/app/lib/sanitize-html'

function formatAnswerValue(value: string, type: string) {
  if (type !== 'MULTIPLE_CHOICE') return value
  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed)) return parsed.map(String).join(', ')
  } catch {}
  return value
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
  const backHref = session.role === 'ADMIN' ? `/admin/studies/${entry.studyId}` : '/dashboard'

  return (
    <div className="min-h-screen bg-[#F7F8FC]">
      <header className="bg-white border-b border-slate-100 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href={backHref} className="text-slate-400 hover:text-slate-600 transition-colors text-sm">←</Link>
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
        {session.role !== 'ADMIN' && (
          <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm leading-relaxed text-slate-600 shadow-sm">
            Submitted entries are read-only. Contact the researcher if something needs to be corrected.
          </div>
        )}
        {sorted.map((answer) => (
          <div key={answer.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <p className="text-sm font-medium text-slate-500 mb-2" dangerouslySetInnerHTML={{ __html: sanitizeHtml(answer.question.text) }} />
            {answer.question.type === 'SCREENSHOT' ? (
              answer.value
                ? <img src={answer.value} alt="Screenshot" className="rounded-xl max-h-64 object-contain border border-slate-100" />
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
