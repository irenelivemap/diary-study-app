import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { getSession } from '@/app/lib/session'
import { prisma } from '@/app/lib/db'
import PreviewForm from '@/app/components/PreviewForm'
import NavBar from '@/app/components/NavBar'
import StudyTabs from '@/app/components/StudyTabs'
import { phaseBadgeClass } from '@/app/lib/phase-colors'

export default async function PreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ partId?: string }>
}) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') redirect('/login')

  const { id } = await params
  const { partId } = await searchParams

  const study = await prisma.study.findUnique({
    where: { id },
    include: { parts: { orderBy: { order: 'asc' }, include: { questions: { orderBy: [{ page: 'asc' }, { order: 'asc' }] } } } },
  })
  if (!study) notFound()

  const part = partId ? study.parts.find((p) => p.id === partId) : study.parts[0]
  if (!part) notFound()

  const partIndex = study.parts.findIndex((p) => p.id === part.id)
  const today = new Date().toISOString().split('T')[0]

  return (
    <div className="min-h-screen bg-[#F7F8FC]">
      <NavBar name={session.name} role="ADMIN" canSwitchModes />
      <StudyTabs studyId={id} active="preview" studyName={study.name} isActive={study.isActive} status={study.status} />

      <div className="bg-amber-50 border-b border-amber-100">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-3">
          <p className="text-sm text-amber-800">
            <span className="font-semibold">Preview mode.</span> Responses will not be saved. All parts are visible here; sequential locks only apply to participants.
          </p>
        </div>
      </div>

      {/* Part selector */}
      {study.parts.length > 1 && (
        <div className="bg-white border-b border-slate-100">
          <div className="max-w-2xl mx-auto px-4 sm:px-6 py-2 flex gap-2 overflow-x-auto">
            {study.parts.map((p, pi) => (
              <Link key={p.id} href={`/admin/studies/${id}/preview?partId=${p.id}`}
                className={`flex shrink-0 items-center gap-1.5 rounded-lg py-1.5 pr-3 text-xs font-medium transition-colors ${p.id === part.id ? 'bg-slate-100 pl-0 text-slate-800' : 'pl-0 text-slate-500 hover:bg-slate-50'}`}>
                <span className={`text-[9px] font-bold text-white px-1 py-0.5 rounded ${phaseBadgeClass(pi)}`}>PT {pi + 1}</span>
                {p.name}
              </Link>
            ))}
          </div>
        </div>
      )}

      <header className="bg-white border-b border-slate-100">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 h-14 flex items-center">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-bold text-white px-1.5 py-0.5 rounded-md ${phaseBadgeClass(partIndex)}`}>
              PT {partIndex + 1}
            </span>
            <div>
              <p className="text-xs text-slate-400">{today}</p>
              <p className="text-sm font-semibold text-slate-900">{part.name}</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-4">
        {part.instructions && (
          <div className="bg-indigo-50 border border-indigo-100 rounded-2xl px-5 py-4">
            <p className="text-xs font-semibold text-indigo-500 uppercase tracking-wide mb-1">Instructions</p>
            <p className="text-sm text-indigo-800 leading-relaxed">{part.instructions}</p>
          </div>
        )}
        <PreviewForm key={part.id} study={{ id: study.id, name: part.name, questions: part.questions }} />
      </main>
    </div>
  )
}
