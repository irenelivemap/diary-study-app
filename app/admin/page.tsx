import { redirect } from 'next/navigation'
import { getSession } from '@/app/lib/session'
import { prisma } from '@/app/lib/db'
import NavBar from '@/app/components/NavBar'
import StudyRow from '@/app/components/StudyRow'
import { ButtonLink } from '@/app/components/ui'

export default async function AdminPage() {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') redirect('/login')

  const studies = await prisma.study.findMany({
    where: { isArchived: false },
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { participants: true, entries: true } } },
  })

  return (
    <div className="min-h-screen bg-[#F7F8FC]">
      <NavBar
        name={session.name}
        role="ADMIN"
        actions={
          <ButtonLink href="/admin/studies/new" size="sm">
            + New study
          </ButtonLink>
        }
      />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="flex items-end justify-between gap-4 mb-5">
          <div>
            <h1 className="text-2xl font-bold text-slate-950">Your studies</h1>
            <p className="text-sm text-slate-500 mt-1">{studies.length} stud{studies.length === 1 ? 'y' : 'ies'}</p>
          </div>
        </div>

        {studies.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-16 text-center">
            <h3 className="font-semibold text-slate-800 mb-1">No studies yet</h3>
            <p className="text-slate-500 text-sm mb-4">Create your first study to get started.</p>
            <ButtonLink href="/admin/studies/new">
              Create study
            </ButtonLink>
          </div>
        ) : (
          <div className="space-y-3">
            {studies.map((study) => (
              <StudyRow key={study.id} study={study} />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
