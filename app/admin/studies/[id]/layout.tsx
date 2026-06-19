import { notFound, redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { getSession } from '@/app/lib/session'
import { prisma } from '@/app/lib/db'
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
  const study = await prisma.study.findUnique({
    where: { id },
    select: { name: true, isActive: true, status: true },
  })
  if (!study) notFound()

  return (
    <div className="min-h-screen bg-[var(--bg-page)]">
      <NavBar name={session.name} role="ADMIN" canSwitchModes />
      <StudyTabs studyId={id} studyName={study.name} isActive={study.isActive} status={study.status} />
      {children}
    </div>
  )
}
