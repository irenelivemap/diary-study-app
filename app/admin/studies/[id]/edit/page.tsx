import { notFound } from 'next/navigation'
import { prisma } from '@/app/lib/db'
import { updateStudy } from '@/app/actions/studies'
import StudyForm from '@/app/components/StudyForm'

export default async function EditStudyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ saved?: string }>
}) {
  const { id } = await params
  const { saved } = await searchParams
  const study = await prisma.study.findUnique({
    where: { id },
    include: {
      parts: {
        orderBy: { order: 'asc' },
        include: { questions: { orderBy: [{ page: 'asc' }, { order: 'asc' }] } },
      },
      _count: { select: { entries: { where: { isPilot: false } } } },
    },
  })
  if (!study) notFound()

  const action = updateStudy.bind(null, id)

  return (
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {study._count.entries > 0 && (
          <div className="mb-5 bg-amber-50 border border-amber-100 rounded-2xl px-5 py-4">
            <h2 className="text-sm font-semibold text-amber-900">Editing after data collection has started</h2>
            <p className="text-sm text-amber-700 mt-1">
              This study already has {study._count.entries} response{study._count.entries === 1 ? '' : 's'}. Saving setup changes will increment the study version so exports can be interpreted carefully.
            </p>
          </div>
        )}
        <StudyForm
          action={action}
          initialName={study.name}
          initialDescription={study.description ?? ''}
          initialMode={study.mode}
          initialJourneyName={study.journeyName ?? ''}
          initialConsentText={study.consentText ?? ''}
          initialContactEmail={study.contactEmail ?? ''}
          initialParticipantEntryAccess={study.participantEntryAccess}
          initialReminderNote={study.reminderNote ?? ''}
          initialRemindersEnabled={study.remindersEnabled}
          initialReminderTime={study.reminderTime ?? '18:00'}
          initialReminderDays={study.reminderDays}
          initialReminderSubject={study.reminderSubject ?? ''}
          initialReminderBody={study.reminderBody ?? ''}
          initialSequential={study.sequential}
          initialSaved={saved === '1'}
          initialParts={study.parts.map((p) => ({
            id: p.id,
            name: p.name,
            order: p.order,
            instructions: p.instructions ?? '',
            flow: p.flow as 'STANDARD' | 'JOURNEY_STAGE',
            entryPolicy: p.entryPolicy,
            targetEntries: p.targetEntries,
            durationDays: p.durationDays,
            dueDate: p.dueDate ? p.dueDate.toISOString().split('T')[0] : null,
            unlockRule: p.unlockRule,
            unlockAt: p.unlockAt ? p.unlockAt.toISOString().split('T')[0] : null,
            isActive: p.isActive,
            questions: p.questions.map((q) => ({
              id: q.id,
              page: q.page,
              text: q.text,
              type: q.type,
              scaleType: q.scaleType,
              options: q.options,
              randomizeOptions: q.randomizeOptions,
              required: q.required,
              min: q.min ?? undefined,
              max: q.max ?? undefined,
              showIfQuestionId: q.showIfQuestionId,
              showIfOperator: q.showIfOperator as 'is' | 'is_not' | null,
              showIfValue: q.showIfValue,
            })),
          }))}
          submitLabel="Save changes"
        />
      </main>
  )
}
