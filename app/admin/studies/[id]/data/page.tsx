import { notFound } from 'next/navigation'
import DataExplorer from '@/app/components/DataExplorer'
import { loadStudyDataTableData } from '@/app/lib/study-data-table-data'

export default async function DataPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const data = await loadStudyDataTableData(id)
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
        />
      </div>
  )
}
