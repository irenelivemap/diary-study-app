import { redirect } from 'next/navigation'
import NavBar from '@/app/components/NavBar'
import ProfileForm from '@/app/components/ProfileForm'
import { prisma } from '@/app/lib/db'
import { getSession } from '@/app/lib/session'

export default async function ProfilePage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { name: true, firstName: true, lastName: true, email: true, role: true },
  })
  if (!user) redirect('/login')

  return (
    <div className="min-h-screen bg-[#F7F8FC]">
      <NavBar name={session.name} role={session.role} />
      <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
        <ProfileForm
          name={user.name}
          firstName={user.firstName}
          lastName={user.lastName}
          email={user.email}
        />
      </main>
    </div>
  )
}
