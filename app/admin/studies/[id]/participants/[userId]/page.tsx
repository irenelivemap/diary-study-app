import { notFound, redirect } from 'next/navigation'
import NavBar from '@/app/components/NavBar'
import StudyTabs from '@/app/components/StudyTabs'
import { ButtonLink } from '@/app/components/ui'
import CopyTextButton from '@/app/components/CopyTextButton'
import { prisma } from '@/app/lib/db'
import { getSession } from '@/app/lib/session'
import { demographicFieldLabel } from '@/app/lib/demographics'

const PART_COLORS = ['bg-teal-500','bg-emerald-500','bg-green-700','bg-blue-500','bg-purple-500','bg-indigo-600']

function stripHtml(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function formatTime(date: Date) {
  return new Intl.DateTimeFormat('en', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function isImageValue(value: string) {
  return /^https?:\/\//.test(value) || value.startsWith('/uploads/')
}

function hasAnswer(value: string) {
  return value.trim().length > 0 && value !== 'N/A - not shown'
}

function formatAnswerText(value: string, type: string) {
  if (type !== 'MULTIPLE_CHOICE') return value
  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed)) return parsed.map(String).join(', ')
  } catch {}
  return value
}

function shortQuestionLabel(text: string) {
  const clean = stripHtml(text)
  const lower = clean.toLowerCase()

  if (lower.includes('feel today overall')) return 'Mood'
  if (lower.includes('stressed')) return 'Stress'
  if (lower.includes('exercise')) return 'Exercise'
  if (lower.includes('main activity')) return 'Main activity'
  if (lower.includes('when did') || lower.includes('date') || lower.includes('time')) return 'Event time'
  if (lower.includes('best moment')) return 'Best moment'
  if (lower.includes('differently')) return 'Would change'
  if (lower.includes('screenshot')) return 'Attachment'
  if (lower.includes('rate this week')) return 'Week rating'
  if (lower.includes('highlight')) return 'Highlight'
  if (lower.includes('challenging')) return 'Challenge'
  if (lower.includes('productive')) return 'Productive'

  return clean.length > 38 ? `${clean.slice(0, 38).trim()}...` : clean
}

function isSummaryAnswer(type: string, text: string) {
  const lower = text.toLowerCase()
  return (
    type === 'RATING' ||
    type === 'YES_NO' ||
    type === 'SINGLE_CHOICE' ||
    type === 'MULTIPLE_CHOICE' ||
    lower.includes('activity') ||
    lower.includes('challenging')
  )
}

function parseMultipleChoiceText(value: string) {
  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed)) return parsed.map(String).join(', ')
  } catch {}
  return null
}

function AnswerValue({ value, type }: { value: string; type: string }) {
  if (!value.trim()) {
    return <span className="text-base text-slate-500">No answer</span>
  }

  if (type === 'MULTIPLE_CHOICE') {
    const parsed = parseMultipleChoiceText(value)
    if (parsed) return <p className="whitespace-pre-wrap text-base leading-relaxed text-slate-900">{parsed}</p>
  }

  if (type === 'SCREENSHOT' || isImageValue(value)) {
    return (
      <div className="space-y-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={value}
          alt="Participant upload"
          className="max-h-72 w-full rounded-xl border border-slate-200 object-contain bg-slate-50"
        />
        <a
          href={value}
          target="_blank"
          rel="noreferrer"
          className="inline-flex text-sm font-semibold text-indigo-700 hover:text-indigo-900"
        >
          Open upload
        </a>
      </div>
    )
  }

  return <p className="whitespace-pre-wrap text-base leading-relaxed text-slate-900">{value}</p>
}

export default async function ParticipantEntriesPage({
  params,
}: {
  params: Promise<{ id: string; userId: string }>
}) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') redirect('/login')

  const { id, userId } = await params

  const participation = await prisma.studyParticipant.findUnique({
    where: { studyId_userId: { studyId: id, userId } },
    include: {
      user: { select: { id: true, name: true, email: true, demographics: true } },
      study: {
        select: {
          id: true,
          name: true,
          isActive: true,
          parts: {
            orderBy: { order: 'asc' },
            select: { id: true, name: true },
          },
        },
      },
    },
  })

  if (!participation) notFound()

  const legacyDemographics = participation.demographics && typeof participation.demographics === 'object'
    ? participation.demographics as Record<string, unknown>
    : {}
  const profileDemographics = participation.user.demographics && typeof participation.user.demographics === 'object'
    ? participation.user.demographics as Record<string, unknown>
    : {}
  const demographics = { ...legacyDemographics, ...profileDemographics }

  const entries = await prisma.entry.findMany({
    where: { studyId: id, userId },
    include: {
      part: { select: { id: true, name: true, order: true } },
      answers: {
        include: {
          question: {
            select: {
              id: true,
              text: true,
              type: true,
              page: true,
              order: true,
              required: true,
            },
          },
        },
      },
    },
    orderBy: [{ submittedAt: 'desc' }],
  })

  const countsByPart = new Map<string, number>()
  for (const entry of entries) {
    countsByPart.set(entry.partId, (countsByPart.get(entry.partId) ?? 0) + 1)
  }

  const entriesByPart = participation.study.parts.map((part) => ({
    part,
    entries: entries.filter((entry) => entry.partId === part.id),
    count: countsByPart.get(part.id) ?? 0,
  }))

  return (
    <div className="min-h-screen bg-[#F7F8FC]">
      <NavBar name={session.name} role="ADMIN" canSwitchModes />
      <StudyTabs
        studyId={id}
        active="participants"
        studyName={participation.study.name}
        isActive={participation.study.isActive}
      />

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <ButtonLink href={`/admin/studies/${id}/participants`} tone="secondary" size="sm">
              ← Participants
            </ButtonLink>
            <h2 className="mt-3 text-2xl font-bold text-slate-950">{participation.user.name}</h2>
            <p className="mt-1 text-base text-slate-600">{participation.user.email}</p>
          </div>
        </div>

        <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-slate-500">Joined {formatDate(participation.joinedAt)}</span>
            {participation.externalParticipantId && (
              <span className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-700">
                External ID: {participation.externalParticipantId}
              </span>
            )}
          </div>
          {Object.keys(demographics).length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {Object.entries(demographics).map(([key, value]) => (
                <span key={key} className="rounded-full bg-indigo-50 px-3 py-1 text-sm text-indigo-800">
                  <span className="font-semibold">{demographicFieldLabel(key)}:</span> {String(value)}
                </span>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-4">
          <h3 className="text-lg font-bold text-slate-950">Entries</h3>

          {entries.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
              <p className="text-base font-semibold text-slate-800">No entries yet</p>
              <p className="mt-1 text-sm text-slate-500">When this participant submits an entry, it will appear here.</p>
            </div>
          ) : (
            entriesByPart
              .filter(({ entries: partEntries }) => partEntries.length > 0)
              .map(({ part, entries: partEntries, count }, partIndex) => (
                <div key={part.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="border-b border-slate-100 bg-white px-5 py-4 sm:px-6">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h4 className="text-lg font-bold text-slate-950">
                          <span className={`mr-2 rounded-md px-2 py-1 text-xs font-bold text-white ${PART_COLORS[partIndex % PART_COLORS.length]}`}>PT {partIndex + 1}</span>
                          {part.name}
                        </h4>
                        <p className="mt-1 text-sm text-slate-600">
                          {count} {count === 1 ? 'entry' : 'entries'}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3 bg-slate-50/60 p-3 sm:p-4">
                    {partEntries.map((entry, entryIndex) => {
                      const shownAnswers = entry.answers
                        .filter((answer) => answer.wasShown)
                        .sort((a, b) => {
                          if (a.question.page !== b.question.page) return a.question.page - b.question.page
                          return a.question.order - b.question.order
                        })
                      const visibleAnswers = shownAnswers.filter((answer) => hasAnswer(answer.value) || answer.question.required)
                      const emptyOptionalAnswers = shownAnswers.filter((answer) => !hasAnswer(answer.value) && !answer.question.required)
                      const summaryAnswers = visibleAnswers
                        .filter((answer) => hasAnswer(answer.value) && isSummaryAnswer(answer.question.type, answer.question.text))
                        .slice(0, 4)

                      return (
                        <details key={entry.id} open={entryIndex === 0} className="group rounded-xl border border-slate-200 bg-white shadow-sm">
                          <summary className="cursor-pointer list-none px-4 py-4 marker:hidden sm:px-5">
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="text-base font-bold text-slate-950">{entry.date}</p>
                                  <span className="text-sm text-slate-500">Submitted {formatTime(entry.submittedAt)}</span>
                                </div>
                                {summaryAnswers.length > 0 && (
                                  <div className="mt-3 flex flex-wrap gap-2 group-open:hidden">
                                    {summaryAnswers.map((answer) => (
                                      <span key={answer.id} className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
                                        <span className="font-semibold text-slate-950">{shortQuestionLabel(answer.question.text)}:</span> {formatAnswerText(answer.value, answer.question.type)}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </summary>

                          <div className="space-y-3 border-t border-slate-100 px-4 pb-4 sm:px-5">
                            {visibleAnswers.length === 0 ? (
                              <p className="pt-4 text-sm text-slate-500">No visible answers were saved for this entry.</p>
                            ) : (
                              visibleAnswers.map((answer) => {
                                const isTextAnswer = answer.question.type === 'FREE_TEXT' && hasAnswer(answer.value)
                                return (
                                  <div key={answer.id} className={`rounded-xl border px-4 py-4 ${isTextAnswer ? 'border-indigo-100 bg-indigo-50/40' : 'border-slate-100 bg-white'}`}>
                                    <div className="flex items-start justify-between gap-3">
                                      <p className="text-sm font-semibold leading-relaxed text-slate-950">{shortQuestionLabel(answer.question.text)}</p>
                                      {isTextAnswer && <CopyTextButton text={answer.value} />}
                                    </div>
                                    {shortQuestionLabel(answer.question.text) !== stripHtml(answer.question.text) && (
                                      <p className="mt-1 text-xs leading-relaxed text-slate-500">{stripHtml(answer.question.text)}</p>
                                    )}
                                    <div className={`mt-3 rounded-xl px-4 py-3 ${isTextAnswer ? 'bg-white' : 'bg-slate-50'}`}>
                                      <AnswerValue value={answer.value} type={answer.question.type} />
                                    </div>
                                  </div>
                                )
                              })
                            )}

                            {emptyOptionalAnswers.length > 0 && (
                              <details className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3">
                                <summary className="cursor-pointer text-sm font-semibold text-slate-600">
                                  Show {emptyOptionalAnswers.length} empty optional {emptyOptionalAnswers.length === 1 ? 'answer' : 'answers'}
                                </summary>
                                <div className="mt-3 space-y-2">
                                  {emptyOptionalAnswers.map((answer) => (
                                    <div key={answer.id} className="rounded-lg bg-white px-3 py-2">
                                      <p className="text-sm font-medium text-slate-700">{shortQuestionLabel(answer.question.text)}</p>
                                      <p className="text-sm text-slate-400">No answer</p>
                                    </div>
                                  ))}
                                </div>
                              </details>
                            )}
                          </div>
                        </details>
                      )
                    })}
                  </div>
                </div>
              ))
          )}
        </section>
      </main>
    </div>
  )
}
