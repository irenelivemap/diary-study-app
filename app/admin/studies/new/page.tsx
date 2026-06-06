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
    <div className="min-h-screen bg-[#F7F8FC]">
      <NavBar name={session.name} role="ADMIN" />
      <main className="max-w-6xl mx-auto px-4 sm:px-8 py-6 sm:py-8">
        <div className="mb-6">
          <Link href="/admin" className="text-sm text-slate-400 hover:text-indigo-600 transition-colors mb-2 inline-flex items-center gap-1">
            ← All studies
          </Link>
          <h1 className="text-2xl font-bold text-slate-900">New study</h1>
          <p className="text-slate-500 text-sm mt-1">Design your diary study and add questions.</p>
        </div>
        <StudyForm action={createStudy} submitLabel="Create study" />
      </main>
    </div>
  )
}
