'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { EntryPolicy, ParticipantEntryAccess, StudyMode, StudyStatus } from '@prisma/client'
import { prisma } from '@/app/lib/db'
import { getSession } from '@/app/lib/session'
import { sanitizeHtml } from '@/app/lib/sanitize-html'
import { invitationUrl, sendStudyInvitationEmail } from '@/app/lib/invitations'
import { sendParticipantRemovalEmail } from '@/app/lib/participant-removal'
import { acceptsParticipantEntries, lifecyclePersistence } from '@/app/lib/study-lifecycle'
import { isValidEmail, isValidReminderTime, normalizeEmail, normalizeTimezone } from '@/app/lib/validation'
import { REMOVED_INVITE_PREFIX, isRemovedInviteToken } from '@/app/lib/invitation-access'

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
  flow?: 'STANDARD' | 'JOURNEY_STAGE'
  entryPolicy?: 'ONCE_PER_DAY' | 'MULTIPLE_PER_DAY'
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
  return Array.from(new Set(formData.getAll('reminderDays').map(String).filter((day) => /^[0-6]$/.test(day))))
}

function optionalExternalId(formData: FormData) {
  const value = optionalString(formData, 'externalParticipantId')
  return value ? value.slice(0, 120) : null
}

function sanitizedOptions(options: string[] | undefined) {
  const seen = new Set<string>()
  const final: string[] = []
  for (const rawOption of options || []) {
    const option = rawOption === '__OTHER__' ? rawOption : sanitizeHtml(rawOption).trim()
    if (!option || seen.has(option)) continue
    seen.add(option)
    final.push(option)
  }
  return final
}

function normalizedEntryPolicy(value: string | null | undefined) {
  return value === EntryPolicy.ONCE_PER_DAY ? EntryPolicy.ONCE_PER_DAY : EntryPolicy.MULTIPLE_PER_DAY
}

function normalizedPartFlow(value: string | null | undefined) {
  return value === 'JOURNEY_STAGE' ? 'JOURNEY_STAGE' : 'STANDARD'
}

function normalizedStudyFields(formData: FormData) {
  const name = String(formData.get('name') ?? '').trim()
  const description = optionalString(formData, 'description')
  const rawMode = String(formData.get('mode') ?? StudyMode.STANDARD)
  const mode = rawMode === StudyMode.JOURNEY ? StudyMode.JOURNEY : StudyMode.STANDARD
  const journeyName = optionalString(formData, 'journeyName')
  const consentText = optionalString(formData, 'consentText')
  const contactEmail = optionalString(formData, 'contactEmail')
  const rawParticipantEntryAccess = String(formData.get('participantEntryAccess') ?? ParticipantEntryAccess.SHOW_READ_ONLY)
  const participantEntryAccess = rawParticipantEntryAccess === ParticipantEntryAccess.HIDE_PAST_ENTRIES
    ? ParticipantEntryAccess.HIDE_PAST_ENTRIES
    : ParticipantEntryAccess.SHOW_READ_ONLY
  const reminderNote = optionalString(formData, 'reminderNote')
  const remindersEnabled = checkboxValue(formData, 'remindersEnabled')
  const rawReminderTime = optionalString(formData, 'reminderTime') ?? '18:00'
  const reminderTime = isValidReminderTime(rawReminderTime) ? rawReminderTime : null
  const reminderDays = reminderDaysValue(formData)
  const reminderSubject = optionalString(formData, 'reminderSubject')
  const reminderBody = optionalString(formData, 'reminderBody')
  const sequential = checkboxValue(formData, 'sequential')

  return {
    name,
    description,
    mode,
    journeyName,
    consentText,
    contactEmail,
    participantEntryAccess,
    reminderNote,
    remindersEnabled,
    reminderTime,
    reminderDays,
    reminderSubject,
    reminderBody,
    sequential,
  }
}

function validateParts(parts: PartInput[]) {
  if (parts.length === 0) return 'At least one part is required.'
  for (const part of parts) {
    if (!part.name.trim()) return 'Every part needs a name.'
    if (!Number.isInteger(part.order) || part.order < 1) return 'Every part needs a valid order.'
    if (part.flow && !['STANDARD', 'JOURNEY_STAGE'].includes(part.flow)) return `Part "${part.name}" has an invalid part type.`
    if (part.entryPolicy && !Object.values(EntryPolicy).includes(part.entryPolicy as EntryPolicy)) return `Part "${part.name}" has an invalid entry rule.`
    if (part.targetEntries != null && (!Number.isInteger(part.targetEntries) || part.targetEntries < 1 || part.targetEntries > 365)) {
      return 'Target entries must be between 1 and 365.'
    }
    if (part.durationDays != null && (!Number.isInteger(part.durationDays) || part.durationDays < 1 || part.durationDays > 3650)) {
      return 'Duration must be between 1 and 3650 days.'
    }
    if (part.dueDate && Number.isNaN(new Date(part.dueDate).getTime())) return `Part "${part.name}" has an invalid due date.`
    if (part.unlockAt && Number.isNaN(new Date(part.unlockAt).getTime())) return `Part "${part.name}" has an invalid unlock date.`
    if (part.questions.length === 0) return `Part "${part.name}" needs at least one question or content block.`
    const questionIds = new Set(part.questions.flatMap((question) => question.id ? [question.id] : []))
    for (const [index, question] of part.questions.entries()) {
      if (!Number.isInteger(question.page ?? 1) || (question.page ?? 1) < 1) return `One question in "${part.name}" has an invalid page.`
      if (!question.text.trim() && question.type !== 'CONTENT') return `One question in "${part.name}" is missing text.`
      if (question.type === 'MULTIPLE_CHOICE') {
        const optionCount = sanitizedOptions(question.options).filter((option) => option !== '__OTHER__').length
        const min = question.min ?? (question.required === false ? 0 : 1)
        const max = question.max ?? optionCount
        if (optionCount < 1) return 'Multiple-choice questions need at least one option.'
        if (min < 0 || max < 1 || min > max || max > optionCount) {
          return 'Multiple-choice min/max selections must fit the number of available options.'
        }
      }
      if (question.type === 'SINGLE_CHOICE' && sanitizedOptions(question.options).filter((option) => option !== '__OTHER__').length < 1) {
        return 'Single-choice questions need at least one option.'
      }
      if (question.type === 'RATING') {
        const min = question.min ?? 1
        const max = question.max ?? 7
        if (!Number.isInteger(min) || !Number.isInteger(max) || min >= max || max - min > 100) {
          return 'Rating scales need a valid minimum and maximum.'
        }
      }
      if (question.showIfQuestionId || question.showIfValue) {
        if (!question.showIfQuestionId || !question.showIfValue) return 'Conditional questions need both a source question and answer.'
        if (!questionIds.has(question.showIfQuestionId)) return 'Conditional questions must refer to another question in the same part.'
        const sourceIndex = part.questions.findIndex((candidate) => candidate.id === question.showIfQuestionId)
        if (sourceIndex < 0 || sourceIndex >= index) return 'Conditional questions can only depend on earlier questions.'
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
    flow: normalizedPartFlow(part.flow),
    entryPolicy: normalizedEntryPolicy(part.entryPolicy),
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

  const studyFields = normalizedStudyFields(formData)
  const partsJson = formData.get('parts') as string

  if (!studyFields.name) return { error: 'Study name is required.' }
  if (studyFields.contactEmail && !isValidEmail(studyFields.contactEmail)) return { error: 'Researcher contact email is not valid.' }
  if (!studyFields.reminderTime) return { error: 'Reminder time must use HH:MM format.' }

  let parts: PartInput[] = []
  try {
    parts = JSON.parse(partsJson || '[]')
  } catch {
    return { error: 'Invalid parts format.' }
  }

  const validationError = validateParts(parts)
  if (validationError) return { error: validationError }

  const hasJourneyStages = parts.some((part) => normalizedPartFlow(part.flow) === 'JOURNEY_STAGE')
  const final = await prisma.study.create({
    data: {
      ...studyFields,
      ...lifecyclePersistence(StudyStatus.PREPARATION),
      mode: hasJourneyStages ? StudyMode.JOURNEY : StudyMode.STANDARD,
      journeyName: hasJourneyStages ? (studyFields.journeyName || 'Journey') : null,
      reminderTime: studyFields.reminderTime,
    },
  })

  for (const part of parts) {
    await prisma.part.create({ data: buildPartCreate(part, final.id) })
  }

  revalidatePath('/admin')
  redirect(`/admin/studies/${final.id}`)
}

export async function updateStudy(studyId: string, prevState: unknown, formData: FormData) {
  await requireAdmin()

  const studyFields = normalizedStudyFields(formData)
  const isActive = formData.has('isActive') ? checkboxValue(formData, 'isActive') : undefined
  const lifecycle = isActive === undefined ? null : lifecyclePersistence(isActive ? StudyStatus.ACTIVE : StudyStatus.CLOSED)
  const partsJson = formData.get('parts') as string

  if (!studyFields.name) return { error: 'Study name is required.' }
  if (studyFields.contactEmail && !isValidEmail(studyFields.contactEmail)) return { error: 'Researcher contact email is not valid.' }
  if (!studyFields.reminderTime) return { error: 'Reminder time must use HH:MM format.' }

  let parts: PartInput[] = []
  try {
    parts = JSON.parse(partsJson || '[]')
  } catch {
    return { error: 'Invalid parts format.' }
  }

  const validationError = validateParts(parts)
  if (validationError) return { error: validationError }
  const hasJourneyStages = parts.some((part) => normalizedPartFlow(part.flow) === 'JOURNEY_STAGE')

  const existingEntries = await prisma.entry.count({ where: { studyId, isPilot: false } })
  const currentParts = await prisma.part.findMany({
    where: { studyId },
    include: {
      _count: { select: { entries: { where: { isPilot: false } } } },
      questions: { include: { _count: { select: { answers: { where: { entry: { isPilot: false } } } } } } },
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
          name: studyFields.name,
          description: studyFields.description,
          mode: hasJourneyStages ? StudyMode.JOURNEY : StudyMode.STANDARD,
          journeyName: hasJourneyStages ? (studyFields.journeyName || 'Journey') : null,
          consentText: studyFields.consentText,
          contactEmail: studyFields.contactEmail,
          participantEntryAccess: studyFields.participantEntryAccess,
          reminderNote: studyFields.reminderNote,
          remindersEnabled: studyFields.remindersEnabled,
          reminderTime: studyFields.reminderTime,
          reminderDays: studyFields.reminderDays,
          reminderSubject: studyFields.reminderSubject,
          reminderBody: studyFields.reminderBody,
          ...(lifecycle ?? {}),
          sequential: studyFields.sequential,
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
            flow: normalizedPartFlow(part.flow),
            entryPolicy: normalizedEntryPolicy(part.entryPolicy),
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
  revalidatePath('/dashboard')
  redirect(`/admin/studies/${studyId}/edit?saved=1`)
}

export async function deleteStudy(studyId: string) {
  await requireAdmin()
  await prisma.study.delete({ where: { id: studyId } })
  revalidatePath('/admin')
  redirect('/admin')
}

export async function archiveStudy(studyId: string) {
  await requireAdmin()
  await prisma.study.update({ where: { id: studyId }, data: lifecyclePersistence(StudyStatus.ARCHIVED) })
  revalidatePath('/admin')
  redirect('/admin')
}

export async function restoreStudy(studyId: string) {
  await requireAdmin()
  await prisma.study.update({ where: { id: studyId }, data: lifecyclePersistence(StudyStatus.CLOSED) })
  revalidatePath('/admin')
}

export async function duplicateStudy(studyId: string) {
  await requireAdmin()

  const source = await prisma.study.findUnique({
    where: { id: studyId },
    include: {
      parts: {
        orderBy: { order: 'asc' },
        include: {
          questions: {
            orderBy: { order: 'asc' },
            include: { tagDefinitions: true },
          },
        },
      },
    },
  })
  if (!source) redirect('/admin')

  const copiedStudy = await prisma.$transaction(async (tx) => {
    const copy = await tx.study.create({
      data: {
        name: `Copy of ${source.name}`.slice(0, 160),
        description: source.description,
        consentText: source.consentText,
        contactEmail: source.contactEmail,
        mode: source.mode,
        journeyName: source.journeyName,
        ...lifecyclePersistence(StudyStatus.PREPARATION),
        sequential: source.sequential,
        reminderNote: source.reminderNote,
        remindersEnabled: source.remindersEnabled,
        reminderTime: source.reminderTime,
        reminderDays: source.reminderDays,
        reminderSubject: source.reminderSubject,
        reminderBody: source.reminderBody,
        participantEntryAccess: source.participantEntryAccess,
        demographicFields: source.demographicFields,
        version: 1,
      },
    })

    const questionIdMap = new Map<string, string>()
    const conditionalQuestions: Array<{ newQuestionId: string; oldSourceQuestionId: string; showIfValue: string }> = []

    for (const part of source.parts) {
      const copiedPart = await tx.part.create({
        data: {
          studyId: copy.id,
          name: part.name,
          order: part.order,
          instructions: part.instructions,
          flow: part.flow,
          entryPolicy: part.entryPolicy,
          targetEntries: part.targetEntries,
          durationDays: part.durationDays,
          dueDate: part.dueDate,
          unlockRule: part.unlockRule,
          unlockAt: part.unlockAt,
          isActive: part.isActive,
        },
      })

      for (const question of part.questions) {
        const copiedQuestion = await tx.question.create({
          data: {
            partId: copiedPart.id,
            studyId: copy.id,
            page: question.page,
            order: question.order,
            text: question.text,
            scaleType: question.scaleType,
            type: question.type,
            options: question.options,
            required: question.required,
            min: question.min,
            max: question.max,
            showIfQuestionId: null,
            showIfValue: null,
            tagDefinitions: {
              create: question.tagDefinitions.map((tag) => ({
                label: tag.label,
                color: tag.color,
              })),
            },
          },
        })
        questionIdMap.set(question.id, copiedQuestion.id)
        if (question.showIfQuestionId && question.showIfValue) {
          conditionalQuestions.push({
            newQuestionId: copiedQuestion.id,
            oldSourceQuestionId: question.showIfQuestionId,
            showIfValue: question.showIfValue,
          })
        }
      }
    }

    for (const condition of conditionalQuestions) {
      const copiedSourceQuestionId = questionIdMap.get(condition.oldSourceQuestionId)
      if (!copiedSourceQuestionId) continue
      await tx.question.update({
        where: { id: condition.newQuestionId },
        data: {
          showIfQuestionId: copiedSourceQuestionId,
          showIfValue: condition.showIfValue,
        },
      })
    }

    return copy
  })

  revalidatePath('/admin')
  redirect(`/admin/studies/${copiedStudy.id}/edit`)
}

export async function ensureInviteLink(studyId: string) {
  await requireAdmin()
  const study = await prisma.study.findUnique({
    where: { id: studyId },
    select: { inviteToken: true, status: true, isActive: true, isArchived: true },
  })
  if (!study || !acceptsParticipantEntries(study)) {
    return { error: 'This study is closed. Reopen it before sharing an invite link.' }
  }
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
  const externalParticipantId = optionalExternalId(formData)
  const invitation = await prisma.studyInvitation.findUnique({
    where: { token },
    include: { study: true },
  })
  const study = invitation?.study ?? await prisma.study.findUnique({ where: { inviteToken: token } })
  if (!study || study.isArchived || study.status === StudyStatus.CLOSED || study.status === StudyStatus.ARCHIVED) return { error: 'This invite link is not valid.' }
  if (isRemovedInviteToken(invitation?.token)) return { error: 'This invite link is not valid.' }
  if (invitation && invitation.email.toLowerCase() !== session.email.toLowerCase()) {
    return { error: `This invitation is for ${invitation.email}. Please sign in with that email.` }
  }
  const removedInvitation = await prisma.studyInvitation.findUnique({
    where: { studyId_email: { studyId: study.id, email: session.email.toLowerCase() } },
    select: { token: true },
  })
  if (isRemovedInviteToken(removedInvitation?.token)) {
    return { error: 'You no longer have access to this study. Contact the researcher if this seems wrong.' }
  }

  await prisma.studyParticipant.upsert({
    where: { studyId_userId: { studyId: study.id, userId: session.userId } },
    update: externalParticipantId || invitation?.externalParticipantId
      ? { externalParticipantId: externalParticipantId ?? invitation?.externalParticipantId ?? null }
      : {},
    create: {
      studyId: study.id,
      userId: session.userId,
      externalParticipantId: externalParticipantId ?? invitation?.externalParticipantId ?? null,
    },
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
  await prisma.study.update({
    where: { id: studyId },
    data: lifecyclePersistence(currentStatus ? StudyStatus.CLOSED : StudyStatus.ACTIVE),
  })
  revalidatePath('/admin')
}

type EditableStudyStatus = typeof StudyStatus.PREPARATION | typeof StudyStatus.ACTIVE | typeof StudyStatus.CLOSED

export async function setStudyLifecycleStatus(studyId: string, status: EditableStudyStatus) {
  await requireAdmin()
  if (![StudyStatus.PREPARATION, StudyStatus.ACTIVE, StudyStatus.CLOSED].includes(status)) return
  await prisma.study.update({ where: { id: studyId }, data: lifecyclePersistence(status) })
  revalidatePath('/admin')
  revalidatePath(`/admin/studies/${studyId}`)
  revalidatePath('/dashboard')
}

export async function renameStudy(studyId: string, name: string) {
  await requireAdmin()
  if (!name.trim()) return
  await prisma.study.update({ where: { id: studyId }, data: { name: name.trim().slice(0, 160) } })
  revalidatePath('/admin')
  revalidatePath(`/admin/studies/${studyId}`)
}

export async function acceptConsent(prevState: unknown, formData: FormData) {
  const session = await getSession()
  if (!session) redirect('/login')

  const studyId = formData.get('studyId') as string
  const timezone = normalizeTimezone(formData.get('timezone'))
  if (!studyId) return { error: 'Missing study.' }
  if (timezone) {
    await prisma.user.update({ where: { id: session.userId }, data: { timezone } })
  }

  const participation = await prisma.studyParticipant.findUnique({
    where: { studyId_userId: { studyId, userId: session.userId } },
    include: { study: { select: { status: true, isActive: true, isArchived: true } } },
  })
  if (!participation || !acceptsParticipantEntries(participation.study)) {
    return { error: 'This study is not available.' }
  }

  await prisma.studyParticipant.update({
    where: { studyId_userId: { studyId, userId: session.userId } },
    data: {
      consentedAt: participation.consentedAt ?? new Date(),
    },
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
  const email = normalizeEmail(formData.get('email'))
  const externalParticipantId = optionalExternalId(formData)

  if (!email) return { error: 'Email is required.' }
  if (!isValidEmail(email)) return { error: 'Enter a valid email address.' }

  const study = await prisma.study.findUnique({
    where: { id: studyId },
    select: { id: true, name: true, status: true, isActive: true, isArchived: true },
  })
  if (!study) return { error: 'Study not found.' }
  if (!acceptsParticipantEntries(study)) {
    return { error: 'This study is closed. Reopen it before inviting participants.' }
  }

  const user = await prisma.user.findUnique({ where: { email } })
  try {
    if (user) {
      await prisma.studyParticipant.upsert({
        where: { studyId_userId: { studyId, userId: user.id } },
        update: externalParticipantId ? { externalParticipantId } : {},
        create: { studyId, userId: user.id, externalParticipantId },
      })
    }
  } catch {
    return { error: 'This participant is already enrolled in the study.' }
  }

  const invitation = await prisma.studyInvitation.upsert({
    where: { studyId_email: { studyId, email } },
    update: { token: crypto.randomUUID().replaceAll('-', ''), invitedBy: session.userId, acceptedAt: user ? new Date() : null, externalParticipantId },
    create: { studyId, email, token: crypto.randomUUID().replaceAll('-', ''), invitedBy: session.userId, acceptedAt: user ? new Date() : null, externalParticipantId },
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

export async function removeParticipant(
  studyId: string,
  userId: string,
  options: { notifyParticipant?: boolean; deleteParticipantData?: boolean } = {}
) {
  await requireAdmin()
  const participant = await prisma.studyParticipant.findUnique({
    where: { studyId_userId: { studyId, userId } },
    include: {
      user: { select: { email: true, name: true } },
      study: { select: { name: true, contactEmail: true } },
    },
  })
  const normalizedEmail = participant?.user.email.toLowerCase()
  await prisma.$transaction([
    ...(options.deleteParticipantData
      ? [
          prisma.entry.deleteMany({ where: { studyId, userId } }),
          prisma.journey.deleteMany({ where: { studyId, userId } }),
        ]
      : []),
    prisma.studyParticipant.deleteMany({ where: { studyId, userId } }),
    ...(normalizedEmail
      ? [prisma.studyInvitation.upsert({
          where: { studyId_email: { studyId, email: normalizedEmail } },
          update: {
            token: `${REMOVED_INVITE_PREFIX}${crypto.randomUUID().replaceAll('-', '')}`,
            acceptedAt: null,
            invitedBy: null,
          },
          create: {
            studyId,
            email: normalizedEmail,
            token: `${REMOVED_INVITE_PREFIX}${crypto.randomUUID().replaceAll('-', '')}`,
            acceptedAt: null,
          },
        })]
      : []),
  ])
  if (options.notifyParticipant && participant) {
    await sendParticipantRemovalEmail({
      to: participant.user.email,
      participantName: participant.user.name,
      studyName: participant.study.name,
      contactEmail: participant.study.contactEmail,
    })
  }
  revalidatePath('/admin')
  revalidatePath(`/admin/studies/${studyId}`)
  revalidatePath(`/admin/studies/${studyId}/participants`)
  revalidatePath(`/admin/studies/${studyId}/data`)
  revalidatePath(`/admin/studies/${studyId}/analysis`)
  redirect(`/admin/studies/${studyId}/participants`)
}

export async function removeParticipantFromForm(formData: FormData) {
  const studyId = String(formData.get('studyId') ?? '')
  const userId = String(formData.get('userId') ?? '')
  const notifyParticipant = checkboxValue(formData, 'notifyParticipant')
  const deleteParticipantData = checkboxValue(formData, 'deleteParticipantData')
  if (!studyId || !userId) redirect('/admin')
  await removeParticipant(studyId, userId, { notifyParticipant, deleteParticipantData })
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
