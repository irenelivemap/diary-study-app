import { notFound } from 'next/navigation'
import AnalysisDashboard from '@/app/components/AnalysisDashboard'
import { loadStudyAnalysisData, parseStudyAnalysisFilters } from '@/app/lib/study-analysis-data'

export default async function AnalysisPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { id } = await params
  const data = await loadStudyAnalysisData(id, parseStudyAnalysisFilters(await searchParams))
  if (!data) notFound()

  return (
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <AnalysisDashboard
          studyId={id}
          studyName={data.studyName}
          includePilotByDefault={data.includePilotByDefault}
          parts={data.parts}
          participants={data.participants}
          questions={data.questions}
          rows={data.rows}
          filters={data.filters}
          pilotRowCount={data.pilotRowCount}
          summary={data.summary}
          questionSummaries={data.questionSummaries}
        />
      </main>
  )
}
