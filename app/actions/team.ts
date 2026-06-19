'use server'
/**
 * Server actions for inviting admins and removing admin access.
 */

import crypto from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import bcrypt from 'bcryptjs'
import { prisma } from '@/app/lib/db'
import { getSession } from '@/app/lib/session'
import { isValidEmail, normalizeEmail } from '@/app/lib/validation'
import {
  PASSWORD_RESET_TOKEN_TTL_MS,
  createPasswordResetToken,
  passwordResetTokenHash,
  passwordResetUrl,
  sendPasswordResetEmail,
} from '@/app/lib/password-reset'

function fallbackName(email: string) {
  const localPart = email.split('@')[0] ?? 'Admin'
  return localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ') || 'Admin'
}

async function requireAdmin() {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') redirect('/login')
  return session
}

export async function inviteAdmin(
  prevState: { error?: string; success?: boolean; setupUrl?: string; emailSent?: boolean; message?: string } | null,
  formData: FormData
) {
  const session = await requireAdmin()
  const email = normalizeEmail(formData.get('email'))
  const name = String(formData.get('name') ?? '').trim().slice(0, 160)

  if (!email || !isValidEmail(email)) return { error: 'Enter a valid email address.' }
  if (email === session.email.toLowerCase()) return { error: 'You are already an admin.' }

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true, role: true },
  })
  if (existing?.role === 'ADMIN') return { error: `${existing.email} is already an admin.` }

  const displayName = name || existing?.name || fallbackName(email)
  const token = createPasswordResetToken()
  const setupUrl = passwordResetUrl(token)
  const tokenHash = passwordResetTokenHash(token)
  const randomPassword = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12)

  const user = await prisma.$transaction(async (tx) => {
    const adminUser = existing
      ? await tx.user.update({
          where: { id: existing.id },
          data: { role: 'ADMIN', name: displayName },
          select: { id: true, email: true, name: true },
        })
      : await tx.user.create({
          data: {
            email,
            name: displayName,
            password: randomPassword,
            role: 'ADMIN',
          },
          select: { id: true, email: true, name: true },
        })

    await tx.passwordResetToken.deleteMany({
      where: { userId: adminUser.id, usedAt: null },
    })
    await tx.passwordResetToken.create({
      data: {
        userId: adminUser.id,
        tokenHash,
        expiresAt: new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS),
      },
    })
    return adminUser
  })

  const emailResult = await sendPasswordResetEmail({
    to: user.email,
    name: user.name,
    resetUrl: setupUrl,
  })

  revalidatePath('/profile')
  return {
    success: true,
    setupUrl,
    emailSent: emailResult.sent,
    message: emailResult.sent
      ? 'Admin access added and setup email sent.'
      : 'Admin access added. Copy the setup link and send it manually.',
  }
}

export async function removeAdminAccess(
  prevState: { error?: string; success?: boolean } | null,
  formData: FormData
) {
  const session = await requireAdmin()
  const adminId = String(formData.get('adminId') ?? '').trim()

  if (!adminId) return { error: 'Choose an admin to remove.' }
  if (adminId === session.userId) return { error: 'You cannot remove your own admin access.' }

  const [adminCount, target] = await Promise.all([
    prisma.user.count({ where: { role: 'ADMIN' } }),
    prisma.user.findUnique({
      where: { id: adminId },
      select: { id: true, role: true },
    }),
  ])

  if (adminCount <= 1) return { error: 'There must always be at least one admin.' }
  if (!target || target.role !== 'ADMIN') return { error: 'This person is not an admin.' }

  await prisma.user.update({
    where: { id: adminId },
    data: { role: 'PARTICIPANT' },
  })

  revalidatePath('/profile')
  revalidatePath('/admin')
  return { success: true }
}
