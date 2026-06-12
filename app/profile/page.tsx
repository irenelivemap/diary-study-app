import { redirect } from 'next/navigation'
import NavBar from '@/app/components/NavBar'
import ProfileForm from '@/app/components/ProfileForm'
import { ButtonLink } from '@/app/components/ui'
import { prisma } from '@/app/lib/db'
import { getSession } from '@/app/lib/session'

function safeReturnTo(value: string | undefined) {
  if (!value) return null
  if (!value.startsWith('/') || value.startsWith('//')) return null
  if (/^\/?https?:/i.test(value)) return null
  if (value.startsWith('/profile')) return null
  return value
}

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; returnTo?: string }>
}) {
  const session = await getSession()
  if (!session) redirect('/login')
  const { from, returnTo } = await searchParams
  const backHref = safeReturnTo(returnTo) ?? (from === 'dashboard' ? '/dashboard' : session.role === 'ADMIN' ? '/admin' : '/dashboard')
  const profileMode = backHref.startsWith('/dashboard') || from === 'dashboard' ? 'PARTICIPANT' : session.role
  const homeHref = profileMode === 'PARTICIPANT' ? '/dashboard' : '/admin'
  const backLabel = profileMode === 'PARTICIPANT' ? 'Back to dashboard' : 'Back to admin'

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { name: true, firstName: true, lastName: true, email: true, role: true, demographics: true },
  })
  if (!user) redirect('/login')

  return (
    <div className="min-h-screen bg-[var(--bg-page)]">
      <NavBar
        name={session.name}
        role={profileMode}
        homeHref={homeHref}
        profileHref={`/profile?${new URLSearchParams({
          from: profileMode === 'PARTICIPANT' ? 'dashboard' : 'admin',
          returnTo: backHref,
        }).toString()}`}
        canSwitchModes={session.role === 'ADMIN'}
      />
      <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-4">
          <ButtonLink href={backHref} tone="secondary" size="sm">
            {backLabel}
          </ButtonLink>
        </div>
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
