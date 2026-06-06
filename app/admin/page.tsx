import { redirect } from 'next/navigation'
import { getSession } from '@/app/lib/session'
import { prisma } from '@/app/lib/db'
import ArchivedStudyRow from '@/app/components/ArchivedStudyRow'
import NavBar from '@/app/components/NavBar'
import StudyRow from '@/app/components/StudyRow'
import { ButtonLink } from '@/app/components/ui'

export default async function AdminPage() {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') redirect('/login')

  const [currentStudies, pastStudies] = await Promise.all([
    prisma.study.findMany({
      where: { isArchived: false },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { participants: true, entries: true } } },
    }),
    prisma.study.findMany({
      where: { isArchived: true },
      orderBy: { updatedAt: 'desc' },
      include: { _count: { select: { participants: true, entries: true } } },
    }),
  ])

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
            <p className="text-sm text-slate-500 mt-1">
              {currentStudies.length} current · {pastStudies.length} past
            </p>
          </div>
        </div>

        {currentStudies.length === 0 && pastStudies.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-16 text-center">
            <h3 className="font-semibold text-slate-800 mb-1">No studies yet</h3>
            <p className="text-slate-500 text-sm mb-4">Create your first study to get started.</p>
            <ButtonLink href="/admin/studies/new">
              Create study
            </ButtonLink>
          </div>
        ) : (
          <div className="space-y-8">
            <section>
              <div className="mb-3 flex items-baseline gap-2">
                <h2 className="text-lg font-bold text-slate-950">Current studies</h2>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-sm font-medium text-slate-600">{currentStudies.length}</span>
              </div>
              {currentStudies.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center">
                  <p className="text-sm font-medium text-slate-700">No current studies.</p>
                  <p className="mt-1 text-sm text-slate-500">Restore a past study or create a new one.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {currentStudies.map((study) => (
                    <StudyRow key={study.id} study={study} />
                  ))}
                </div>
              )}
            </section>

            {pastStudies.length > 0 && (
              <section>
                <div className="mb-3 flex items-baseline gap-2">
                  <h2 className="text-lg font-bold text-slate-950">Past studies</h2>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-sm font-medium text-slate-600">{pastStudies.length}</span>
                </div>
                <div className="space-y-3">
                  {pastStudies.map((study) => (
                    <ArchivedStudyRow key={study.id} study={study} />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
