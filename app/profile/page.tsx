import { redirect } from 'next/navigation'
import NavBar from '@/app/components/NavBar'
import ProfileForm from '@/app/components/ProfileForm'
import { prisma } from '@/app/lib/db'
import { getSession } from '@/app/lib/session'

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>
}) {
  const session = await getSession()
  if (!session) redirect('/login')
  const { from } = await searchParams
  const profileMode = from === 'dashboard' ? 'PARTICIPANT' : session.role
  const homeHref = from === 'dashboard' ? '/dashboard' : session.role === 'ADMIN' ? '/admin' : '/dashboard'

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { name: true, firstName: true, lastName: true, email: true, role: true, demographics: true },
  })
  if (!user) redirect('/login')

  return (
    <div className="min-h-screen bg-[#F7F8FC]">
      <NavBar
        name={session.name}
        role={profileMode}
        homeHref={homeHref}
        profileHref={`/profile?from=${from === 'dashboard' ? 'dashboard' : 'admin'}`}
        canSwitchModes={session.role === 'ADMIN'}
      />
      <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
        <ProfileForm
          firstName={user.firstName}
          lastName={user.lastName}
          email={user.email}
          demographics={user.demographics && typeof user.demographics === 'object' ? user.demographics as Record<string, unknown> : null}
        />
      </main>
    </div>
  )
}
