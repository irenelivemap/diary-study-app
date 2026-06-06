'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { prisma } from '@/app/lib/db'
import { getSession } from '@/app/lib/session'
import { sanitizeHtml } from '@/app/lib/sanitize-html'
import { invitationUrl, sendStudyInvitationEmail } from '@/app/lib/invitations'

async function requireAdmin() {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') redirect('/login')
  return session
}

export type QuestionInput = {
  id?: string
  text: string
  type: 'FREE_TEXT' | 'RATING' | 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'YES_NO' | 'SCREENSHOT' | 'DATE_TIME' | 'CONTENT'
  options?: string[]
  required?: boolean
  min?: number
  max?: number
  page?: number
  scaleType?: string
  showIfQuestionId?: string | null
  showIfValue?: string | null
}

export type PartInput = {
  id?: string
  name: string
  order: number
  instructions?: string
  targetEntries?: number | null
  durationDays?: number | null
  dueDate?: string | null
  unlockRule?: string | null
  unlockAt?: string | null
  isActive?: boolean
  questions: QuestionInput[]
}

function optionalString(formData: FormData, key: string) {
  const value = formData.get(key)
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function checkboxValue(formData: FormData, key: string) {
  return formData.getAll(key).includes('true')
}

function reminderDaysValue(formData: FormData) {
  return formData.getAll('reminderDays').map(String).filter((day) => /^[0-6]$/.test(day))
}

function sanitizedOptions(options: string[] | undefined) {
  return (options || []).map((option) => option === '__OTHER__' ? option : sanitizeHtml(option))
}

function validateParts(parts: PartInput[]) {
  if (parts.length === 0) return 'At least one part is required.'
  for (const part of parts) {
    if (!part.name.trim()) return 'Every part needs a name.'
    if (part.questions.length === 0) return `Part "${part.name}" needs at least one question or content block.`
    for (const question of part.questions) {
      if (!question.text.trim() && question.type !== 'CONTENT') return `One question in "${part.name}" is missing text.`
      if (question.type === 'MULTIPLE_CHOICE') {
        const optionCount = (question.options ?? []).filter((option) => option !== '__OTHER__').length
        const min = question.min ?? (question.required === false ? 0 : 1)
        const max = question.max ?? optionCount
        if (optionCount < 1) return 'Multiple-choice questions need at least one option.'
        if (min < 0 || max < 1 || min > max || max > optionCount) {
          return 'Multiple-choice min/max selections must fit the number of available options.'
        }
      }
      if (question.type === 'SINGLE_CHOICE' && (question.options ?? []).filter((option) => option !== '__OTHER__').length < 1) {
        return 'Single-choice questions need at least one option.'
      }
    }
  }
  return null
}

function buildPartCreate(part: PartInput, studyId: string) {
  return {
    studyId,
    name: part.name,
    order: part.order,
    instructions: part.instructions || null,
    targetEntries: part.targetEntries ?? null,
    durationDays: part.durationDays ?? null,
    dueDate: part.dueDate ? new Date(part.dueDate) : null,
    unlockRule: part.unlockRule || 'AFTER_PREVIOUS_TARGET',
    unlockAt: part.unlockAt ? new Date(part.unlockAt) : null,
    isActive: part.isActive !== false,
    questions: {
      create: part.questions.map((q, i) => ({
        studyId,
        page: q.page ?? 1,
        order: i,
        text: sanitizeHtml(q.text),
        type: q.type,
        scaleType: q.scaleType ?? 'numbers',
        options: sanitizedOptions(q.options),
        required: q.type === 'CONTENT' ? false : q.required !== false,
        min: q.min ?? null,
        max: q.max ?? null,
        showIfQuestionId: q.showIfQuestionId ?? null,
        showIfValue: q.showIfValue ?? null,
      })),
    },
  }
}

export async function createStudy(prevState: unknown, formData: FormData) {
  await requireAdmin()

  const name = formData.get('name') as string
  const description = optionalString(formData, 'description')
  const consentText = optionalString(formData, 'consentText')
  const contactEmail = optionalString(formData, 'contactEmail')
  const reminderNote = optionalString(formData, 'reminderNote')
  const remindersEnabled = checkboxValue(formData, 'remindersEnabled')
  const reminderTime = optionalString(formData, 'reminderTime') ?? '18:00'
  const reminderDays = reminderDaysValue(formData)
  const reminderSubject = optionalString(formData, 'reminderSubject')
  const reminderBody = optionalString(formData, 'reminderBody')
  const sequential = checkboxValue(formData, 'sequential')
  const partsJson = formData.get('parts') as string

  if (!name) return { error: 'Study name is required.' }

  let parts: PartInput[] = []
  try {
    parts = JSON.parse(partsJson || '[]')
  } catch {
    return { error: 'Invalid parts format.' }
  }

  const validationError = validateParts(parts)
  if (validationError) return { error: validationError }

  const final = await prisma.study.create({
    data: { name, description, consentText, contactEmail, reminderNote, remindersEnabled, reminderTime, reminderDays, reminderSubject, reminderBody, sequential },
  })

  for (const part of parts) {
    await prisma.part.create({ data: buildPartCreate(part, final.id) })
  }

  revalidatePath('/admin')
  redirect(`/admin/studies/${final.id}`)
}

export async function updateStudy(studyId: string, prevState: unknown, formData: FormData) {
  await requireAdmin()

  const name = formData.get('name') as string
  const description = optionalString(formData, 'description')
  const consentText = optionalString(formData, 'consentText')
  const contactEmail = optionalString(formData, 'contactEmail')
  const reminderNote = optionalString(formData, 'reminderNote')
  const remindersEnabled = checkboxValue(formData, 'remindersEnabled')
  const reminderTime = optionalString(formData, 'reminderTime') ?? '18:00'
  const reminderDays = reminderDaysValue(formData)
  const reminderSubject = optionalString(formData, 'reminderSubject')
  const reminderBody = optionalString(formData, 'reminderBody')
  const isActive = formData.has('isActive') ? checkboxValue(formData, 'isActive') : undefined
  const sequential = checkboxValue(formData, 'sequential')
  const partsJson = formData.get('parts') as string

  if (!name) return { error: 'Study name is required.' }

  let parts: PartInput[] = []
  try {
    parts = JSON.parse(partsJson || '[]')
  } catch {
    return { error: 'Invalid parts format.' }
  }

  const validationError = validateParts(parts)
  if (validationError) return { error: validationError }

  const existingEntries = await prisma.entry.count({ where: { studyId } })
  const currentParts = await prisma.part.findMany({
    where: { studyId },
    include: {
      _count: { select: { entries: true } },
      questions: { include: { _count: { select: { answers: true } } } },
    },
  })
  const currentPartsById = new Map(currentParts.map((part) => [part.id, part]))
  const incomingPartIds = new Set(parts.flatMap((part) => part.id ? [part.id] : []))

  for (const part of currentParts) {
    if (incomingPartIds.has(part.id)) continue
    if (part._count.entries > 0 || part.questions.some((question) => question._count.answers > 0)) {
      return { error: `Part "${part.name}" already has responses. Archive or deactivate it instead of removing it.` }
    }
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.study.update({
        where: { id: studyId },
        data: {
          name,
          description,
          consentText,
          contactEmail,
          reminderNote,
          remindersEnabled,
          reminderTime,
          reminderDays,
          reminderSubject,
          reminderBody,
          ...(isActive === undefined ? {} : { isActive }),
          sequential,
          ...(existingEntries > 0 ? { version: { increment: 1 } } : {}),
        },
      })

      for (const part of currentParts) {
        if (!incomingPartIds.has(part.id)) {
          await tx.part.delete({ where: { id: part.id } })
        }
      }

      for (const part of parts) {
        const existingPart = part.id ? currentPartsById.get(part.id) : null
        if (!existingPart) {
          await tx.part.create({ data: buildPartCreate(part, studyId) })
          continue
        }

        await tx.part.update({
          where: { id: existingPart.id },
          data: {
            name: part.name,
            order: part.order,
            instructions: part.instructions || null,
            targetEntries: part.targetEntries ?? null,
            durationDays: part.durationDays ?? null,
            dueDate: part.dueDate ? new Date(part.dueDate) : null,
            unlockRule: part.unlockRule || 'AFTER_PREVIOUS_TARGET',
            unlockAt: part.unlockAt ? new Date(part.unlockAt) : null,
            isActive: part.isActive !== false,
          },
        })

        const currentQuestionsById = new Map(existingPart.questions.map((question) => [question.id, question]))
        const incomingQuestionIds = new Set(part.questions.flatMap((question) => question.id ? [question.id] : []))
        for (const question of existingPart.questions) {
          if (incomingQuestionIds.has(question.id)) continue
          if (question._count.answers > 0) {
            throw new Error(`Question "${question.text.replace(/<[^>]+>/g, ' ').trim()}" already has answers. Keep it in the setup or create a new study version.`)
          }
          await tx.question.delete({ where: { id: question.id } })
        }

        for (const [index, question] of part.questions.entries()) {
          const data = {
            studyId,
            partId: existingPart.id,
            page: question.page ?? 1,
            order: index,
            text: sanitizeHtml(question.text),
            type: question.type,
            scaleType: question.scaleType ?? 'numbers',
            options: sanitizedOptions(question.options),
            required: question.type === 'CONTENT' ? false : question.required !== false,
            min: question.min ?? null,
            max: question.max ?? null,
            showIfQuestionId: question.showIfQuestionId ?? null,
            showIfValue: question.showIfValue ?? null,
          }
          if (question.id && currentQuestionsById.has(question.id)) {
            await tx.question.update({ where: { id: question.id }, data })
          } else {
            await tx.question.create({ data })
          }
        }
      }
    })
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Could not update the study.' }
  }

  revalidatePath('/admin')
  revalidatePath(`/admin/studies/${studyId}`)
  redirect(`/admin/studies/${studyId}/edit`)
}

export async function deleteStudy(studyId: string) {
  await requireAdmin()
  await prisma.study.delete({ where: { id: studyId } })
  revalidatePath('/admin')
  redirect('/admin')
}

export async function archiveStudy(studyId: string) {
  await requireAdmin()
  await prisma.study.update({ where: { id: studyId }, data: { isArchived: true, isActive: false } })
  revalidatePath('/admin')
  redirect('/admin')
}

export async function restoreStudy(studyId: string) {
  await requireAdmin()
  await prisma.study.update({ where: { id: studyId }, data: { isArchived: false } })
  revalidatePath('/admin')
}

export async function ensureInviteLink(studyId: string) {
  await requireAdmin()
  const study = await prisma.study.findUnique({ where: { id: studyId }, select: { inviteToken: true } })
  if (study?.inviteToken) return { token: study.inviteToken }
  const token = crypto.randomUUID().replaceAll('-', '')
  await prisma.study.update({ where: { id: studyId }, data: { inviteToken: token } })
  revalidatePath(`/admin/studies/${studyId}`)
  return { token }
}

export async function joinStudyWithInvite(prevState: unknown, formData: FormData) {
  const session = await getSession()
  if (!session) redirect('/login')

  const token = formData.get('token') as string
  const invitation = await prisma.studyInvitation.findUnique({
    where: { token },
    include: { study: true },
  })
  const study = invitation?.study ?? await prisma.study.findUnique({ where: { inviteToken: token } })
  if (!study || study.isArchived) return { error: 'This invite link is not valid.' }
  if (invitation && invitation.email.toLowerCase() !== session.email.toLowerCase()) {
    return { error: `This invitation is for ${invitation.email}. Please sign in with that email.` }
  }

  await prisma.studyParticipant.upsert({
    where: { studyId_userId: { studyId: study.id, userId: session.userId } },
    update: {},
    create: { studyId: study.id, userId: session.userId },
  })
  if (invitation) {
    await prisma.studyInvitation.update({
      where: { id: invitation.id },
      data: { acceptedAt: new Date() },
    })
  }

  revalidatePath('/dashboard')
  redirect('/dashboard')
}

export async function toggleStudyStatus(studyId: string, currentStatus: boolean) {
  await requireAdmin()
  await prisma.study.update({ where: { id: studyId }, data: { isActive: !currentStatus } })
  revalidatePath('/admin')
}

export async function renameStudy(studyId: string, name: string) {
  await requireAdmin()
  if (!name.trim()) return
  await prisma.study.update({ where: { id: studyId }, data: { name: name.trim() } })
  revalidatePath('/admin')
  revalidatePath(`/admin/studies/${studyId}`)
}

export async function acceptConsent(prevState: unknown, formData: FormData) {
  const session = await getSession()
  if (!session) redirect('/login')

  const studyId = formData.get('studyId') as string
  const timezone = formData.get('timezone') as string
  if (!studyId) return { error: 'Missing study.' }
  if (timezone) {
    await prisma.user.update({ where: { id: session.userId }, data: { timezone } })
  }

  await prisma.studyParticipant.updateMany({
    where: { studyId, userId: session.userId },
    data: { consentedAt: new Date() },
  })

  revalidatePath('/dashboard')
  return { success: true, error: undefined }
}

export async function togglePartStatus(partId: string, studyId: string, currentStatus: boolean) {
  await requireAdmin()
  await prisma.part.update({ where: { id: partId }, data: { isActive: !currentStatus } })
  revalidatePath(`/admin/studies/${studyId}`)
}

export async function addParticipant(prevState: unknown, formData: FormData) {
  const session = await requireAdmin()

  const studyId = formData.get('studyId') as string
  const email = String(formData.get('email') ?? '').trim().toLowerCase()

  if (!email) return { error: 'Email is required.' }

  const study = await prisma.study.findUnique({ where: { id: studyId }, select: { id: true, name: true, isArchived: true } })
  if (!study || study.isArchived) return { error: 'Study not found.' }

  const user = await prisma.user.findUnique({ where: { email } })
  try {
    if (user) {
      await prisma.studyParticipant.upsert({
        where: { studyId_userId: { studyId, userId: user.id } },
        update: {},
        create: { studyId, userId: user.id },
      })
    }
  } catch {
    return { error: 'This participant is already enrolled in the study.' }
  }

  const invitation = await prisma.studyInvitation.upsert({
    where: { studyId_email: { studyId, email } },
    update: { token: crypto.randomUUID().replaceAll('-', ''), invitedBy: session.userId, acceptedAt: user ? new Date() : null },
    create: { studyId, email, token: crypto.randomUUID().replaceAll('-', ''), invitedBy: session.userId, acceptedAt: user ? new Date() : null },
  })
  const emailResult = await sendStudyInvitationEmail({
    to: email,
    studyName: study.name,
    inviterName: session.name,
    inviteUrl: invitationUrl(invitation.token),
  })

  revalidatePath(`/admin/studies/${studyId}`)
  return {
    success: true,
    message: emailResult.sent
      ? user ? 'Participant added and invitation email sent.' : 'Invitation email sent.'
      : `Invitation saved, but email was not sent: ${emailResult.error}`,
  }
}

export async function removeParticipant(studyId: string, userId: string) {
  await requireAdmin()
  await prisma.studyParticipant.deleteMany({ where: { studyId, userId } })
  revalidatePath(`/admin/studies/${studyId}`)
}

export async function updateParticipantOps(prevState: unknown, formData: FormData) {
  await requireAdmin()
  const studyId = formData.get('studyId') as string
  const userId = formData.get('userId') as string
  const researcherNotes = optionalString(formData, 'researcherNotes')
  const incentiveStatus = (formData.get('incentiveStatus') as string) || 'NOT_TRACKED'

  await prisma.studyParticipant.update({
    where: { studyId_userId: { studyId, userId } },
    data: { researcherNotes, incentiveStatus: incentiveStatus as never },
  })

  revalidatePath(`/admin/studies/${studyId}`)
  return { success: true }
}
