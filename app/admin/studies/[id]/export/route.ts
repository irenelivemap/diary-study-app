import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/app/lib/session'
import { prisma } from '@/app/lib/db'
import { demographicFieldLabel } from '@/app/lib/demographics'

function csvCell(value: string) {
  return `"${value.replace(/"/g, '""')}"`
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const study = await prisma.study.findUnique({
    where: { id },
    include: {
      parts: {
        orderBy: { order: 'asc' },
        include: {
          questions: { orderBy: [{ page: 'asc' }, { order: 'asc' }] },
          entries: {
            include: {
              user: {
                select: {
                  name: true,
                  email: true,
                  participations: {
                    where: { studyId: id },
                    select: { externalParticipantId: true, demographics: true },
                    take: 1,
                  },
                },
              },
              answers: { include: { question: true } },
            },
            orderBy: [{ userId: 'asc' }, { date: 'asc' }],
          },
        },
      },
    },
  })
  if (!study) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const allQuestions = study.parts.flatMap((p) => p.questions).filter((q) => q.type !== 'CONTENT')
  const demographicFields = study.demographicFields
  const anonymize = req.nextUrl.searchParams.get('anonymize') === 'true'
  const participantIds = new Map<string, string>()
  let participantCounter = 0

  const headers = [
    'part_name',
    anonymize ? 'participant_id' : 'participant_name',
    ...(anonymize ? [] : ['participant_email', 'external_participant_id']),
    ...demographicFields.map((field) => `demographic_${demographicFieldLabel(field).replace(/[^a-z0-9]+/gi, '_').toLowerCase()}`),
    'date',
    'submitted_at',
    'timezone',
    'study_version',
    ...allQuestions.map((q) => q.text.replace(/<[^>]*>/g, ''))
  ]

  const rows = study.parts.flatMap((part) =>
    part.entries.map((entry) => {
      const answerMap = Object.fromEntries(entry.answers.map((a) => [a.questionId, a.value]))
      const participantKey = entry.user.email
      const participation = entry.user.participations[0]
      const demographics = participation?.demographics && typeof participation.demographics === 'object'
        ? participation.demographics as Record<string, unknown>
        : {}
      if (!participantIds.has(participantKey)) {
        participantCounter += 1
        participantIds.set(participantKey, `P${String(participantCounter).padStart(3, '0')}`)
      }
      return [
        part.name,
        anonymize ? participantIds.get(participantKey)! : entry.user.name,
        ...(anonymize ? [] : [entry.user.email, participation?.externalParticipantId ?? '']),
        ...demographicFields.map((field) => String(demographics[field] ?? '')),
        entry.date,
        entry.submittedAt.toISOString(),
        entry.timezone ?? '',
        String(study.version),
        ...allQuestions.map((q) => answerMap[q.id] ?? ''),
      ].map((value) => csvCell(String(value))).join(',')
    })
  )

  const csv = [headers.map(csvCell).join(','), ...rows].join('\n')
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${study.name.replace(/[^a-z0-9]/gi, '_')}_export.csv"`,
    },
  })
}
