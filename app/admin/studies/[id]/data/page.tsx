/**
 * Next.js page for admin/studies/[id]/data.
 */
import { notFound } from 'next/navigation'
import DataExplorer from '@/app/components/DataExplorer'
import { loadStudyDataTableData, parseStudyDataTableFilters } from '@/app/lib/study-data-table-data'

export default async function DataPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { id } = await params
  const data = await loadStudyDataTableData(id, parseStudyDataTableFilters(await searchParams))
  if (!data) notFound()

  return (
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-6">
        <DataExplorer
          studyId={id}
          studyName={data.studyName}
          studyVersion={data.studyVersion}
          includePilotByDefault={data.includePilotByDefault}
          parts={data.parts}
          participants={data.participants}
          questions={data.questions}
          rows={data.rows}
          filters={data.filters}
          pageSize={data.pageSize}
          totalRows={data.totalRows}
          pilotRowCount={data.pilotRowCount}
          availableQualityFlags={data.availableQualityFlags}
          showJourney={data.showJourney}
        />
      </div>
  )
}
