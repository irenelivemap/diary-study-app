import { redirect, notFound } from 'next/navigation'
import { getSession } from '@/app/lib/session'
import { prisma } from '@/app/lib/db'
import { updateStudy } from '@/app/actions/studies'
import StudyForm from '@/app/components/StudyForm'
import NavBar from '@/app/components/NavBar'
import StudyTabs from '@/app/components/StudyTabs'

export default async function EditStudyPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') redirect('/login')

  const { id } = await params
  const study = await prisma.study.findUnique({
    where: { id },
    include: {
      parts: {
        orderBy: { order: 'asc' },
        include: { questions: { orderBy: [{ page: 'asc' }, { order: 'asc' }] } },
      },
      _count: { select: { entries: true } },
    },
  })
  if (!study) notFound()

  const action = updateStudy.bind(null, id)

  return (
    <div className="min-h-screen bg-[#F7F8FC]">
      <NavBar name={session.name} role="ADMIN" />
      <StudyTabs studyId={id} active="setup" studyName={study.name} isActive={study.isActive} />
      <main className="max-w-6xl mx-auto px-4 sm:px-8 py-6 sm:py-8">
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
          initialConsentText={study.consentText ?? ''}
          initialContactEmail={study.contactEmail ?? ''}
          initialParticipantEntryAccess={study.participantEntryAccess}
          initialReminderNote={study.reminderNote ?? ''}
          initialRemindersEnabled={study.remindersEnabled}
          initialReminderTime={study.reminderTime ?? '18:00'}
          initialReminderDays={study.reminderDays}
          initialReminderSubject={study.reminderSubject ?? ''}
          initialReminderBody={study.reminderBody ?? ''}
          initialIsActive={study.isActive}
          initialSequential={study.sequential}
          showStudyStatus={false}
          initialParts={study.parts.map((p) => ({
            id: p.id,
            name: p.name,
            order: p.order,
            instructions: p.instructions ?? '',
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
              required: q.required,
              min: q.min ?? undefined,
              max: q.max ?? undefined,
            })),
          }))}
          submitLabel="Save changes"
        />
      </main>
    </div>
  )
}
