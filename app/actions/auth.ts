'use server'
import { redirect } from 'next/navigation'
import bcrypt from 'bcryptjs'
import { prisma } from '@/app/lib/db'
import { createSession, deleteSession } from '@/app/lib/session'

export async function login(prevState: { error?: string } | null, formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  if (!email || !password) {
    return { error: 'Email and password are required.' }
  }

  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) return { error: 'Invalid email or password.' }

  const valid = await bcrypt.compare(password, user.password)
  if (!valid) return { error: 'Invalid email or password.' }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  })

  await createSession({ userId: user.id, role: user.role, name: user.name, email: user.email })

  redirect(user.role === 'ADMIN' ? '/admin' : '/dashboard')
}

export async function signup(prevState: { error?: string } | null, formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const name = formData.get('name') as string

  if (!email || !password || !name) {
    return { error: 'All fields are required.' }
  }

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) return { error: 'An account with this email already exists.' }

  const hashed = await bcrypt.hash(password, 12)
  const user = await prisma.user.create({
    data: { email, password: hashed, name, role: 'PARTICIPANT', lastLoginAt: new Date() },
  })

  const invitations = await prisma.studyInvitation.findMany({
    where: { email: email.toLowerCase(), acceptedAt: null, study: { isArchived: false } },
    select: { id: true, studyId: true },
  })
  for (const invitation of invitations) {
    await prisma.studyParticipant.upsert({
      where: { studyId_userId: { studyId: invitation.studyId, userId: user.id } },
      update: {},
      create: { studyId: invitation.studyId, userId: user.id },
    })
    await prisma.studyInvitation.update({
      where: { id: invitation.id },
      data: { acceptedAt: new Date() },
    })
  }

  await createSession({ userId: user.id, role: user.role, name: user.name, email: user.email })
  redirect('/dashboard')
}

export async function logout() {
  await deleteSession()
  redirect('/login')
}
