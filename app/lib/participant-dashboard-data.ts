/**
 * Loads the participant dashboard with the fields needed to show available studies and entries.
 */
import 'server-only'

import { prisma } from '@/app/lib/db'
import { countPendingParticipantActions } from '@/app/lib/participant-actions'
import { normalizeTimezone } from '@/app/lib/validation'

export async function loadParticipantDashboardData(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { timezone: true },
  })
  const userTimezone = normalizeTimezone(user?.timezone)
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: userTimezone || undefined,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'

  const participations = await prisma.studyParticipant.findMany({
    where: {
      userId,
      study: {
        isArchived: false,
        status: { not: 'ARCHIVED' },
      },
    },
    select: {
      joinedAt: true,
      consentedAt: true,
      study: {
        select: {
          id: true,
          name: true,
          description: true,
          consentText: true,
          contactEmail: true,
          mode: true,
          journeyName: true,
          status: true,
          isActive: true,
          isArchived: true,
          sequential: true,
          participantEntryAccess: true,
          parts: {
            orderBy: { order: 'asc' },
            select: {
              id: true,
              name: true,
              instructions: true,
              flow: true,
              isActive: true,
              entryPolicy: true,
              targetEntries: true,
              durationDays: true,
              dueDate: true,
              unlockRule: true,
              unlockAt: true,
              entries: {
                where: { userId },
                orderBy: { submittedAt: 'desc' },
                take: 8,
                select: { id: true, date: true, submittedAt: true, isPilot: true },
              },
              _count: {
                select: {
                  questions: true,
                  entries: { where: { userId } },
                },
              },
            },
          },
          journeys: {
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: 5,
            select: {
              id: true,
              label: true,
              isPilot: true,
              completedAt: true,
              entries: {
                orderBy: { submittedAt: 'asc' },
                select: { id: true, partId: true, submittedAt: true, date: true, isPilot: true },
              },
            },
          },
        },
      },
    },
  })

  return {
    greeting,
    participations,
    readyActionCount: countPendingParticipantActions({ participations, today }),
    today,
  }
}
