/**
 * Project file for layout.
 */
import { notFound, redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { getSession } from '@/app/lib/session'
import { loadStudyShellData } from '@/app/lib/study-shell-data'
import NavBar from '@/app/components/NavBar'
import StudyTabs from '@/app/components/StudyTabs'

export default async function StudyLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ id: string }>
}) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') redirect('/login')

  const { id } = await params
  const study = await loadStudyShellData(id)
  if (!study) notFound()

  return (
    <div className="min-h-screen bg-[var(--bg-page)]">
      <NavBar name={session.name} role="ADMIN" canSwitchModes />
      <StudyTabs studyId={id} studyName={study.name} isActive={study.isActive} status={study.status} />
      {children}
    </div>
  )
}
