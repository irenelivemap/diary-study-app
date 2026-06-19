/**
 * Loads the study overview metrics and health checks.
 */
import 'server-only'

import { prisma } from '@/app/lib/db'
import { buildReminderDiagnostic } from '@/app/lib/reminder-diagnostics'
import { studyStatusLabel } from '@/app/lib/study-lifecycle'

export async function loadStudyOverviewData(studyId: string) {
  const study = await prisma.study.findUnique({
    where: { id: studyId },
    select: {
      id: true,
      name: true,
      description: true,
      consentText: true,
      contactEmail: true,
      status: true,
      isActive: true,
      remindersEnabled: true,
      reminderTime: true,
      parts: {
        orderBy: { order: 'asc' },
        select: {
          id: true,
          name: true,
          order: true,
          flow: true,
          targetEntries: true,
          durationDays: true,
          dueDate: true,
          isActive: true,
          questions: {
            orderBy: [{ page: 'asc' }, { order: 'asc' }],
            select: {
              id: true,
              text: true,
              showIfQuestionId: true,
            },
          },
        },
      },
      participants: {
        select: { user: { select: { id: true, email: true } } },
        orderBy: { joinedAt: 'asc' },
      },
      invitations: {
        select: { email: true },
        orderBy: { createdAt: 'desc' },
      },
      reminderLogs: {
        orderBy: { sentAt: 'desc' },
        take: 5,
        select: {
          id: true,
          status: true,
          date: true,
          partId: true,
          userId: true,
          sentAt: true,
          error: true,
        },
      },
    },
  })
  if (!study) return null

  const includePilotEntries = study.status === 'PREPARATION'
  const entryWhere = { studyId, ...(includePilotEntries ? {} : { isPilot: false }) }
  const dayKeys = Array.from({ length: 7 }, (_, i) => {
    const date = new Date()
    date.setDate(date.getDate() - (6 - i))
    return date.toISOString().split('T')[0]
  })
  const invitedEmails = [...new Set(study.invitations.map((invitation) => invitation.email.toLowerCase()))]

  const [recentEntries, entriesByDayRaw, participantsWithEntriesRaw, entriesByParticipantPartRaw, invitedUsers] = await Promise.all([
    prisma.entry.findMany({
      where: entryWhere,
      take: 6,
      orderBy: { submittedAt: 'desc' },
      select: {
        id: true,
        date: true,
        submittedAt: true,
        user: { select: { name: true } },
        part: { select: { name: true } },
      },
    }),
    prisma.entry.groupBy({
      by: ['date'],
      where: { ...entryWhere, date: { in: dayKeys } },
      _count: { id: true },
    }),
    prisma.entry.groupBy({
      by: ['userId'],
      where: entryWhere,
      _count: { id: true },
    }),
    prisma.entry.groupBy({
      by: ['userId', 'partId'],
      where: entryWhere,
      _count: { id: true },
    }),
    invitedEmails.length
      ? prisma.user.findMany({
          where: { email: { in: invitedEmails } },
          select: { id: true, email: true, lastLoginAt: true },
        })
      : Promise.resolve([]),
  ])

  const dayCountMap = new Map(entriesByDayRaw.map((row) => [row.date, row._count.id]))
  const entriesByDay = dayKeys.map((date) => ({
    date,
    count: dayCountMap.get(date) ?? 0,
  }))
  const maxDayCount = Math.max(...entriesByDay.map((day) => day.count), 1)
  const participantsWithEntries = new Set(participantsWithEntriesRaw.map((entry) => entry.userId))
  const entryCountByParticipantPart = new Map(
    entriesByParticipantPartRaw.map((entry) => [`${entry.userId}:${entry.partId}`, entry._count.id])
  )
  const entryCountByPart = new Map<string, number>()
  for (const entry of entriesByParticipantPartRaw) {
    entryCountByPart.set(entry.partId, (entryCountByPart.get(entry.partId) ?? 0) + entry._count.id)
  }

  const invitedUsersByEmail = new Map(invitedUsers.map((user) => [user.email.toLowerCase(), user]))
  const invitedUserIds = invitedEmails
    .map((email) => invitedUsersByEmail.get(email)?.id)
    .filter((userId): userId is string => !!userId)
  const activeParts = study.parts.filter((part) => part.isActive)
  const participantCompletedStudy = (userId: string) => {
    if (activeParts.length === 0) return false
    return activeParts.every((part) => {
      const count = entryCountByParticipantPart.get(`${userId}:${part.id}`) ?? 0
      return part.targetEntries && part.targetEntries > 0 ? count >= part.targetEntries : count > 0
    })
  }
  const funnel = {
    invited: invitedEmails.length,
    loggedIn: invitedEmails.filter((email) => !!invitedUsersByEmail.get(email)?.lastLoginAt).length,
    started: invitedUserIds.filter((userId) => participantsWithEntries.has(userId)).length,
    completed: invitedUserIds.filter(participantCompletedStudy).length,
  }

  const allQuestions = study.parts.flatMap((part) => part.questions.map((question) => ({ ...question, partName: part.name })))
  const readiness = [
    { label: `Study status: ${studyStatusLabel(study.status)}`, ok: study.status !== 'ARCHIVED', fix: 'Restore the study before running fieldwork.' },
    { label: 'At least one participant is enrolled', ok: study.participants.length > 0, fix: 'Add participants in the Participants tab.' },
    { label: 'At least one active part exists', ok: study.parts.some((part) => part.isActive), fix: 'Activate a part in Setup.' },
    { label: 'All questions have text', ok: allQuestions.every((question) => question.text.replace(/<[^>]*>/g, '').trim().length > 0), fix: 'Add text to every question in Setup.' },
    { label: 'Participant consent text is present', ok: !!study.consentText, fix: 'Add consent / intro text in Setup.' },
    { label: 'Researcher contact email is present', ok: !!study.contactEmail, fix: 'Add a contact email in Setup.' },
    { label: 'Reminder email settings are ready', ok: !study.remindersEnabled || !!study.reminderTime, fix: 'Review email reminder settings in Setup.' },
    { label: 'Entry target or duration is set for each part', ok: study.parts.every((part) => part.targetEntries || part.durationDays || part.dueDate), fix: 'Set target entries, duration, or due date for each part.' },
    {
      label: 'Conditional questions point to existing questions',
      ok: allQuestions.every((question) => !question.showIfQuestionId || allQuestions.some((source) => source.id === question.showIfQuestionId)),
      fix: 'Review conditional display rules in Setup.',
    },
  ]
  const partNameById = new Map(study.parts.map((part) => [part.id, part.name]))
  const participantEmailByUserId = new Map(study.participants.map((participant) => [participant.user.id, participant.user.email]))

  return {
    study,
    includePilotEntries,
    entriesByDay,
    maxDayCount,
    entryCountByPart,
    funnel,
    recentEntries,
    readinessIssues: readiness.filter((item) => !item.ok),
    reminderDiagnostic: buildReminderDiagnostic(study.remindersEnabled, study.reminderLogs),
    partNameById,
    participantEmailByUserId,
  }
}
