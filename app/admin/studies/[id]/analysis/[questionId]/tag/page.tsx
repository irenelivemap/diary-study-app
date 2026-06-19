/**
 * Next.js page for admin/studies/[id]/analysis/[questionId]/tag.
 */
import { notFound } from 'next/navigation'
import TaggingWorkspace from '@/app/components/TaggingWorkspace'
import { loadTagLabData } from '@/app/lib/tag-lab-data'

export default async function TaggingPage({ params }: { params: Promise<{ id: string; questionId: string }> }) {
  const { id, questionId } = await params

  const data = await loadTagLabData(id, questionId)
  if (!data) notFound()

  return (
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <div className="mb-6">
          <a
            href={`/admin/studies/${id}/analysis`}
            className="text-sm font-semibold text-[var(--text-link)]"
          >
            ← Back to analysis
          </a>
          <h1 className="mt-3 text-xl font-semibold text-[var(--text)]">{data.questionText}</h1>
          <p className="mt-1 text-sm text-[var(--text-tertiary)]">{data.answers.length} {data.answers.length === 1 ? 'answer' : 'answers'}</p>
        </div>
        <TaggingWorkspace
          studyId={id}
          questionId={questionId}
          initialTags={data.tagDefinitions}
          answers={data.answers}
        />
      </main>
  )
}
