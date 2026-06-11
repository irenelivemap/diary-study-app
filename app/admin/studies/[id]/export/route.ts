import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/app/lib/session'
import { prisma } from '@/app/lib/db'
import { DEMOGRAPHIC_FIELDS, demographicFieldLabel } from '@/app/lib/demographics'
import { csvCell, dataTypeLabel, formatQualityFlags, formatVisibleAnswer } from '@/app/lib/answer-dataset'
import { plainTextFromHtml } from '@/app/lib/sanitize-html'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const includePilot = req.nextUrl.searchParams.get('includePilot') === 'true'
  const study = await prisma.study.findUnique({
    where: { id },
    include: {
      parts: {
        orderBy: { order: 'asc' },
        include: {
          questions: { orderBy: [{ page: 'asc' }, { order: 'asc' }] },
          entries: {
            ...(includePilot ? {} : { where: { isPilot: false } }),
            include: {
              journey: { select: { id: true, label: true } },
              user: {
                select: {
                  name: true,
                  email: true,
                  demographics: true,
                  participations: {
                    where: { studyId: id },
                    select: { externalParticipantId: true, demographics: true },
                    take: 1,
                  },
                },
              },
              answers: {
                include: {
                  question: true,
                  tags: { include: { tag: true }, orderBy: { tag: { label: 'asc' } } },
                },
              },
            },
            orderBy: [{ userId: 'asc' }, { date: 'asc' }],
          },
        },
      },
    },
  })
  if (!study) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const allQuestions = study.parts.flatMap((p) => p.questions).filter((q) => q.type !== 'CONTENT')
  const demographicFields = DEMOGRAPHIC_FIELDS.map((field) => field.key)
  const showJourney = study.mode === 'JOURNEY' || study.parts.some((part) => part.entries.some((entry) => entry.journeyId))
  const anonymize = req.nextUrl.searchParams.get('anonymize') !== 'false'
  const participantIds = new Map<string, string>()
  let participantCounter = 0

  const headers = [
    ...(showJourney ? ['journey_label', 'journey_id'] : []),
    'part_name',
    anonymize ? 'participant_id' : 'participant_name',
    ...(anonymize ? [] : ['participant_email', 'external_participant_id']),
    ...(anonymize ? [] : demographicFields.map((field) => `demographic_${demographicFieldLabel(field).replace(/[^a-z0-9]+/gi, '_').toLowerCase()}`)),
    'date',
    'submitted_at',
    'timezone',
    'data_type',
    'is_pilot_entry',
    'quality_flags',
    'study_version',
    ...allQuestions.flatMap((q) => {
      const text = plainTextFromHtml(q.text)
      return q.type === 'FREE_TEXT' ? [text, `${text} tags`] : [text]
    })
  ]

  const rows = study.parts.flatMap((part) =>
    part.entries.map((entry) => {
      const answerMap = Object.fromEntries(entry.answers.map((a) => [
        a.questionId,
        { value: a.value, wasShown: a.wasShown },
      ]))
      const tagMap = Object.fromEntries(entry.answers.map((a) => [
        a.questionId,
        a.tags.map((answerTag) => answerTag.tag.label).join('; '),
      ]))
      const participantKey = entry.user.email
      const participation = entry.user.participations[0]
      const profileDemographics = entry.user.demographics && typeof entry.user.demographics === 'object'
        ? entry.user.demographics as Record<string, unknown>
        : {}
      const legacyStudyDemographics = participation?.demographics && typeof participation.demographics === 'object'
        ? participation.demographics as Record<string, unknown>
        : {}
      const demographics = { ...legacyStudyDemographics, ...profileDemographics }
      if (!participantIds.has(participantKey)) {
        participantCounter += 1
        participantIds.set(participantKey, `P${String(participantCounter).padStart(3, '0')}`)
      }
      return [
        ...(showJourney ? [entry.journey?.label ?? '', entry.journey?.id ?? ''] : []),
        part.name,
        anonymize ? participantIds.get(participantKey)! : entry.user.name,
        ...(anonymize ? [] : [entry.user.email, participation?.externalParticipantId ?? '']),
        ...(anonymize ? [] : demographicFields.map((field) => String(demographics[field] ?? ''))),
        entry.date,
        entry.submittedAt.toISOString(),
        entry.timezone ?? '',
        dataTypeLabel(entry.isPilot),
        entry.isPilot ? 'true' : 'false',
        formatQualityFlags(entry.qualityFlags),
        String(study.version),
        ...allQuestions.flatMap((q) => {
          const answer = formatVisibleAnswer(answerMap[q.id], q.type)
          return q.type === 'FREE_TEXT' ? [answer, tagMap[q.id] ?? ''] : [answer]
        }),
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
