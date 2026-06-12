import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/app/lib/session'
import { createStudy } from '@/app/actions/studies'
import StudyForm from '@/app/components/StudyForm'
import NavBar from '@/app/components/NavBar'

export default async function NewStudyPage() {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') redirect('/login')

  return (
    <div className="min-h-screen bg-[var(--bg-page)]">
      <NavBar name={session.name} role="ADMIN" canSwitchModes />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="mb-6">
          <Link href="/admin" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-white px-2.5 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-sunken)] hover:text-[var(--text)] mb-4">
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 13L5 8l5-5" /></svg>
            All studies
          </Link>
          <h1 className="text-2xl font-bold text-slate-900">New study</h1>
          <p className="text-slate-500 text-sm mt-1">Design your diary study and add questions.</p>
        </div>
        <StudyForm action={createStudy} submitLabel="Create study" />
      </main>
    </div>
  )
}
