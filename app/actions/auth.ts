'use server'
/**
 * Server actions for sign in, signup, sign out, password reset, and password change flows.
 */
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { Prisma } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { prisma } from '@/app/lib/db'
import { createSession, deleteSession, getSession } from '@/app/lib/session'
import { isValidEmail, normalizeEmail } from '@/app/lib/validation'
import { demographicsFromFormData } from '@/app/lib/demographics'
import { acceptsParticipantEntries } from '@/app/lib/study-lifecycle'
import { REMOVED_INVITE_PREFIX, isRemovedInviteToken } from '@/app/lib/invitation-access'
import {
  PASSWORD_RESET_TOKEN_TTL_MS,
  createPasswordResetToken,
  passwordResetTokenHash,
  passwordResetUrl,
  sendPasswordResetEmail,
} from '@/app/lib/password-reset'
import {
  checkLoginRateLimit,
  clearLoginRateLimit,
  loginRateLimitKeys,
  recordFailedLogin,
} from '@/app/lib/login-rate-limit'

function splitName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { firstName: null, lastName: null }
  if (parts.length === 1) return { firstName: parts[0], lastName: null }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
}

function profileName(firstName: string, lastName: string, fallback: string) {
  const fullName = [firstName, lastName].map((part) => part.trim()).filter(Boolean).join(' ')
  return fullName || fallback.trim()
}

function safeRedirectPath(value: FormDataEntryValue | null) {
  const path = String(value ?? '').trim()
  if (!path || !path.startsWith('/') || path.startsWith('//')) return null
  return path.slice(0, 500)
}

export async function login(prevState: { error?: string } | null, formData: FormData) {
  const email = normalizeEmail(formData.get('email'))
  const password = String(formData.get('password') ?? '')
  const nextPath = safeRedirectPath(formData.get('next'))

  if (!email || !password) {
    return { error: 'Email and password are required.' }
  }
  if (!isValidEmail(email)) {
    return { error: 'Enter a valid email address.' }
  }

  const rateLimitKeys = await loginRateLimitKeys(email)
  const rateLimit = await checkLoginRateLimit(rateLimitKeys)
  if (!rateLimit.allowed) {
    const minutes = Math.ceil(rateLimit.retryAfterSeconds / 60)
    return { error: `Too many sign-in attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.` }
  }

  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) {
    await recordFailedLogin(rateLimitKeys)
    return { error: 'Invalid email or password.' }
  }

  const valid = await bcrypt.compare(password, user.password)
  if (!valid) {
    await recordFailedLogin(rateLimitKeys)
    return { error: 'Invalid email or password.' }
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  })

  await clearLoginRateLimit(rateLimitKeys.slice(0, 1))
  await createSession({ userId: user.id, role: user.role, name: user.name, email: user.email })

  redirect(nextPath ?? (user.role === 'ADMIN' ? '/admin' : '/dashboard'))
}

export async function requestPasswordReset(
  prevState: { error?: string; success?: boolean } | null,
  formData: FormData
) {
  const email = normalizeEmail(formData.get('email'))
  if (!email || !isValidEmail(email)) return { error: 'Enter a valid email address.' }

  const user = await prisma.user.findUnique({ where: { email } })
  if (user) {
    const token = createPasswordResetToken()
    const tokenHash = passwordResetTokenHash(token)
    await prisma.$transaction([
      prisma.passwordResetToken.deleteMany({
        where: {
          userId: user.id,
          usedAt: null,
        },
      }),
      prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt: new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS),
        },
      }),
    ])

    await sendPasswordResetEmail({
      to: user.email,
      name: user.name,
      resetUrl: passwordResetUrl(token),
    })
  }

  return { success: true }
}

export async function resetPassword(
  prevState: { error?: string } | null,
  formData: FormData
) {
  const token = String(formData.get('token') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  const confirmPassword = String(formData.get('confirmPassword') ?? '')

  if (!token) return { error: 'This reset link is missing its token.' }
  if (password.length < 8) return { error: 'Password must be at least 8 characters.' }
  if (password !== confirmPassword) return { error: 'Passwords do not match.' }

  const resetToken = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: passwordResetTokenHash(token) },
    include: { user: { select: { id: true, email: true } } },
  })

  if (!resetToken || resetToken.usedAt || resetToken.expiresAt <= new Date()) {
    return { error: 'This reset link has expired. Request a new password reset link.' }
  }

  const hashed = await bcrypt.hash(password, 12)
  await prisma.$transaction([
    prisma.user.update({
      where: { id: resetToken.userId },
      data: { password: hashed },
    }),
    prisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { usedAt: new Date() },
    }),
    prisma.passwordResetToken.deleteMany({
      where: {
        userId: resetToken.userId,
        id: { not: resetToken.id },
      },
    }),
  ])

  await clearLoginRateLimit(await loginRateLimitKeys(resetToken.user.email))
  redirect('/login?reset=success')
}

export async function changePassword(
  prevState: { error?: string; success?: boolean } | null,
  formData: FormData
) {
  const session = await getSession()
  if (!session) redirect('/login')

  const currentPassword = String(formData.get('currentPassword') ?? '')
  const password = String(formData.get('password') ?? '')
  const confirmPassword = String(formData.get('confirmPassword') ?? '')

  if (!currentPassword || !password || !confirmPassword) {
    return { error: 'Current password, new password, and confirmation are required.' }
  }
  if (password.length < 8) return { error: 'Password must be at least 8 characters.' }
  if (password !== confirmPassword) return { error: 'Passwords do not match.' }
  if (currentPassword === password) return { error: 'Choose a new password that is different from your current password.' }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, email: true, password: true },
  })
  if (!user) redirect('/login')

  const valid = await bcrypt.compare(currentPassword, user.password)
  if (!valid) return { error: 'Current password is incorrect.' }

  const hashed = await bcrypt.hash(password, 12)
  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { password: hashed },
    }),
    prisma.passwordResetToken.deleteMany({
      where: { userId: user.id },
    }),
  ])

  await clearLoginRateLimit(await loginRateLimitKeys(user.email))
  return { success: true }
}

export async function signup(prevState: { error?: string } | null, formData: FormData) {
  const email = normalizeEmail(formData.get('email'))
  const password = String(formData.get('password') ?? '')
  const name = String(formData.get('name') ?? '').trim()
  const inviteToken = String(formData.get('inviteToken') ?? '').trim()
  const externalParticipantId = String(formData.get('externalParticipantId') ?? '').trim().slice(0, 120) || null

  if (!email || !password || !name) {
    return { error: 'All fields are required.' }
  }
  if (!isValidEmail(email)) {
    return { error: 'Enter a valid email address.' }
  }
  if (password.length < 8) {
    return { error: 'Password must be at least 8 characters.' }
  }

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) return { error: 'An account with this email already exists.' }

  const hashed = await bcrypt.hash(password, 12)
  const { firstName, lastName } = splitName(name)
  const user = await prisma.user.create({
    data: { email, password: hashed, name, firstName, lastName, role: 'PARTICIPANT', lastLoginAt: new Date() },
  })

  const invitations = await prisma.studyInvitation.findMany({
    where: {
      email,
      acceptedAt: null,
      token: { not: { startsWith: REMOVED_INVITE_PREFIX } },
      study: { isArchived: false, status: { in: ['PREPARATION', 'ACTIVE'] } },
    },
    select: { id: true, studyId: true, externalParticipantId: true },
  })
  for (const invitation of invitations) {
    await prisma.studyParticipant.upsert({
      where: { studyId_userId: { studyId: invitation.studyId, userId: user.id } },
      update: invitation.externalParticipantId ? { externalParticipantId: invitation.externalParticipantId } : {},
      create: { studyId: invitation.studyId, userId: user.id, externalParticipantId: invitation.externalParticipantId },
    })
    await prisma.studyInvitation.update({
      where: { id: invitation.id },
      data: { acceptedAt: new Date() },
    })
  }

  if (inviteToken) {
    const invitation = await prisma.studyInvitation.findUnique({
      where: { token: inviteToken },
      include: { study: { select: { id: true, status: true, isActive: true, isArchived: true } } },
    })
    const study = invitation?.study ?? await prisma.study.findUnique({
      where: { inviteToken },
      select: { id: true, status: true, isActive: true, isArchived: true },
    })
    if (study && acceptsParticipantEntries(study) && (!invitation || (!isRemovedInviteToken(invitation.token) && invitation.email.toLowerCase() === email))) {
      await prisma.studyParticipant.upsert({
        where: { studyId_userId: { studyId: study.id, userId: user.id } },
        update: externalParticipantId || invitation?.externalParticipantId
          ? { externalParticipantId: externalParticipantId ?? invitation?.externalParticipantId ?? null }
          : {},
        create: {
          studyId: study.id,
          userId: user.id,
          externalParticipantId: externalParticipantId ?? invitation?.externalParticipantId ?? null,
        },
      })
      if (invitation) {
        await prisma.studyInvitation.update({
          where: { id: invitation.id },
          data: { acceptedAt: new Date() },
        })
      }
    }
  }

  await createSession({ userId: user.id, role: user.role, name: user.name, email: user.email })
  redirect('/dashboard')
}

export async function logout() {
  await deleteSession()
  redirect('/login')
}

export async function updateProfile(prevState: { error?: string; success?: boolean } | null, formData: FormData) {
  const session = await getSession()
  if (!session) redirect('/login')

  const firstName = String(formData.get('firstName') ?? '').trim().slice(0, 80)
  const lastName = String(formData.get('lastName') ?? '').trim().slice(0, 120)
  const displayName = profileName(firstName, lastName, String(formData.get('name') ?? session.name))
  const demographics = demographicsFromFormData(formData)

  if (!displayName) return { error: 'Add at least a first name or display name.' }

  const updated = await prisma.user.update({
    where: { id: session.userId },
    data: {
      firstName: firstName || null,
      lastName: lastName || null,
      name: displayName.slice(0, 160),
      demographics: demographics ?? Prisma.JsonNull,
    },
    select: { id: true, role: true, name: true, email: true },
  })

  await createSession({ userId: updated.id, role: updated.role, name: updated.name, email: updated.email })
  revalidatePath('/profile')
  revalidatePath('/admin')
  revalidatePath('/dashboard')
  return { success: true }
}
