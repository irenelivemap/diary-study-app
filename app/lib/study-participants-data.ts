/**
 * Loads participant progress and participant detail data for admin views.
 */
import 'server-only'

import { prisma } from '@/app/lib/db'

export type ParticipantStatus = {
  label: 'Not started' | 'Active' | 'Quiet'
  detail: string
  tone: 'neutral' | 'info' | 'warning'
}

function formatLatestEntryDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

function participantStatus({
  latestDate,
  nowTime,
  total,
}: {
  latestDate?: string
  nowTime: number
  total: number
}): ParticipantStatus {
  if (total === 0) {
    return {
      label: 'Not started',
      detail: 'No entries yet',
      tone: 'neutral',
    }
  }

  if (latestDate) {
    const daysSince = Math.floor((nowTime - new Date(`${latestDate}T00:00:00`).getTime()) / (1000 * 60 * 60 * 24))
    const formattedLatestDate = formatLatestEntryDate(latestDate)
    if (daysSince >= 7) {
      return {
        label: 'Quiet',
        detail: `Last entry ${formattedLatestDate}`,
        tone: 'warning',
      }
    }
    return {
      label: 'Active',
      detail: `Last entry ${formattedLatestDate}`,
      tone: 'info',
    }
  }

  return {
    label: 'Active',
    detail: 'Has submitted at least one entry',
    tone: 'info',
  }
}

export async function loadStudyParticipantsData(studyId: string) {
  const study = await prisma.study.findUnique({
    where: { id: studyId },
    include: {
      parts: {
        orderBy: { order: 'asc' },
        include: { _count: { select: { entries: { where: { isPilot: false } } } } },
      },
      participants: {
        include: { user: { select: { id: true, name: true, email: true, lastLoginAt: true, demographics: true } } },
        orderBy: { joinedAt: 'asc' },
      },
      invitations: {
        orderBy: { createdAt: 'desc' },
      },
    },
  })
  if (!study) return null

  const includePilotEntries = study.status === 'PREPARATION'
  const [entriesByPartAndUser, latestEntryByUser] = await Promise.all([
    prisma.entry.groupBy({
      by: ['partId', 'userId'],
      where: { studyId, ...(includePilotEntries ? {} : { isPilot: false }) },
      _count: { id: true },
    }),
    prisma.entry.groupBy({
      by: ['userId'],
      where: { studyId, ...(includePilotEntries ? {} : { isPilot: false }) },
      _max: { date: true },
    }),
  ])
  const latestEntryMap = new Map(latestEntryByUser.flatMap((row) => row._max.date ? [[row.userId, row._max.date] as const] : []))

  const entryCountMap: Record<string, Record<string, number>> = {}
  for (const row of entriesByPartAndUser) {
    if (!entryCountMap[row.userId]) entryCountMap[row.userId] = {}
    entryCountMap[row.userId][row.partId] = row._count.id
  }

  const nowTime = new Date().getTime()
  const participants = study.participants.map((participant) => {
    const userCounts = entryCountMap[participant.user.id] ?? {}
    const total = Object.values(userCounts).reduce((a, b) => a + b, 0)
    return {
      externalParticipantId: participant.externalParticipantId,
      user: participant.user,
      countsByPart: userCounts,
      total,
      status: participantStatus({
        latestDate: latestEntryMap.get(participant.user.id),
        nowTime,
        total,
      }),
    }
  })

  return {
    inviteToken: study.inviteToken,
    includePilotEntries,
    parts: study.parts.map((part) => ({
      id: part.id,
      name: part.name,
    })),
    participants,
    pendingInvitations: study.invitations
      .filter((invitation) => !invitation.acceptedAt)
      .map((invitation) => ({
        id: invitation.id,
        email: invitation.email,
        externalParticipantId: invitation.externalParticipantId,
        createdAt: invitation.createdAt,
      })),
  }
}
