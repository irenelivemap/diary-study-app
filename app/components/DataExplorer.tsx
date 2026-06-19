'use client'
import { useState, useMemo, useRef, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { deleteEntryFromForm } from '@/app/actions/entries'
import { Badge, Button, IconButton, SwitchVisual, TextInput, TrashIcon } from '@/app/components/ui'
import { entryQualityLabel } from '@/app/lib/entry-state'
import {
  NOT_SHOWN_LABEL,
  csvCell,
  dataTypeLabel,
  datasetHasJourney,
  formatQualityFlags,
  formatVisibleAnswer,
  type DatasetRow,
} from '@/app/lib/answer-dataset'
import type { StudyDataTableFilters } from '@/app/lib/study-data-table-data'

type Question = { id: string; partId: string; partName: string; text: string; type: string }
type Part = { id: string; name: string }
type Participant = { id: string; name: string; email: string }
type Props = {
  studyId: string
  studyName: string
  studyVersion: number
  includePilotByDefault?: boolean
  parts: Part[]
  participants: Participant[]
  questions: Question[]
  rows: DatasetRow[]
  filters?: StudyDataTableFilters
  pageSize?: number
  totalRows?: number
  pilotRowCount?: number
  availableQualityFlags?: string[]
  showJourney?: boolean
}

const BASE_COLUMNS = [
  { id: 'entryId', label: 'Entry ID' },
  { id: 'dataType', label: 'Data type' },
  { id: 'participant', label: 'Participant' },
  { id: 'email', label: 'Email' },
  { id: 'journey', label: 'Journey' },
  { id: 'part', label: 'Part' },
  { id: 'date', label: 'Date' },
  { id: 'submittedAt', label: 'Submitted time' },
  { id: 'timezone', label: 'Timezone' },
  { id: 'qualityFlags', label: 'Quality flags' },
  { id: 'studyVersion', label: 'Study version' },
] as const
const TABLE_PAGE_SIZE = 100

type BaseColumnId = typeof BASE_COLUMNS[number]['id']

// Simple dropdown wrapper
function Dropdown({ label, badge, children }: { label: string; badge?: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div ref={ref} className="relative">
      <Button
        type="button"
        onClick={() => setOpen((v) => !v)}
        tone={open ? 'primary' : 'secondary'}
        size="sm"
      >
        {label}
        {badge != null && badge > 0 && (
          <Badge tone={open ? 'neutral' : 'info'} className="px-1.5 py-0 text-xs">{badge}</Badge>
        )}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={`transition-transform ${open ? 'rotate-180' : ''}`}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </Button>
      {open && (
        <div className="absolute left-0 top-full mt-1.5 z-30 bg-white rounded-2xl border border-[var(--border)] shadow-[var(--shadow-lg)] p-4 min-w-[200px]">
          {children}
        </div>
      )}
    </div>
  )
}

function formatSubmittedTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function DataExplorer({
  studyId,
  studyName,
  studyVersion,
  includePilotByDefault = false,
  parts,
  participants,
  questions,
  rows,
  filters,
  pageSize = TABLE_PAGE_SIZE,
  totalRows = rows.length,
  pilotRowCount: serverPilotRowCount,
  availableQualityFlags: serverAvailableQualityFlags,
  showJourney: serverShowJourney,
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const answerQuestions = questions.filter((q) => q.type !== 'CONTENT')
  const selectedParts = useMemo(
    () => new Set(filters?.partIds.length ? filters.partIds : parts.map((p) => p.id)),
    [filters?.partIds, parts]
  )
  const selectedParticipants = useMemo(
    () => new Set(filters?.participantIds.length ? filters.participantIds : participants.map((p) => p.id)),
    [filters?.participantIds, participants]
  )
  const selectedQualityFlags = useMemo(
    () => filters?.qualityFlags.length ? new Set(filters.qualityFlags) : null,
    [filters?.qualityFlags]
  )
  const dateFrom = filters?.dateFrom ?? ''
  const dateTo = filters?.dateTo ?? ''
  const search = filters?.search ?? ''
  const includePilotData = filters?.includePilotData ?? includePilotByDefault
  const currentPage = filters?.page ?? 1
  const [selectedBaseCols, setSelectedBaseCols] = useState<Set<BaseColumnId>>(new Set(BASE_COLUMNS.map((col) => col.id)))
  const [selectedQuestionCols, setSelectedQuestionCols] = useState<Set<string>>(new Set(answerQuestions.map((q) => q.id)))
  const [anonymize, setAnonymize] = useState(true)
  const [entryToDelete, setEntryToDelete] = useState<DatasetRow | null>(null)
  const [searchDraft, setSearchDraft] = useState(search)
  const pilotRowCount = serverPilotRowCount ?? rows.filter((row) => row.isPilot).length
  const showJourney = serverShowJourney ?? datasetHasJourney(rows)
  const availableQualityFlags = serverAvailableQualityFlags ?? Array.from(new Set(rows.flatMap((row) => row.qualityFlags))).sort()
  const participantAliasById = useMemo(() => new Map(
    [...participants]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((participant, index) => [participant.id, `P${String(index + 1).padStart(3, '0')}`])
  ), [participants])

  function toggle<T>(set: Set<T>, val: T): Set<T> {
    const next = new Set(set)
    if (next.has(val)) {
      next.delete(val)
    } else {
      next.add(val)
    }
    return next
  }

  useEffect(() => {
    setSearchDraft(search)
  }, [search])

  function updateServerFilters(next: Partial<{
    partIds: string[]
    participantIds: string[]
    qualityFlags: string[]
    dateFrom: string
    dateTo: string
    search: string
    includePilotData: boolean
    page: number
  }>) {
    const params = new URLSearchParams()
    const nextPartIds = next.partIds ?? filters?.partIds ?? []
    const nextParticipantIds = next.participantIds ?? filters?.participantIds ?? []
    const nextQualityFlags = next.qualityFlags ?? filters?.qualityFlags ?? []
    const nextDateFrom = next.dateFrom ?? dateFrom
    const nextDateTo = next.dateTo ?? dateTo
    const nextSearch = next.search ?? search
    const nextIncludePilot = next.includePilotData ?? includePilotData
    const nextPage = next.page ?? 1

    if (nextPartIds.length > 0 && nextPartIds.length < parts.length) params.set('parts', nextPartIds.join(','))
    if (nextParticipantIds.length > 0 && nextParticipantIds.length < participants.length) params.set('participants', nextParticipantIds.join(','))
    if (nextQualityFlags.length > 0) params.set('quality', nextQualityFlags.join(','))
    if (nextDateFrom) params.set('from', nextDateFrom)
    if (nextDateTo) params.set('to', nextDateTo)
    if (nextSearch.trim()) params.set('search', nextSearch.trim())
    if (nextIncludePilot) params.set('includePilot', 'true')
    if (nextPage > 1) params.set('page', String(nextPage))

    const query = params.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }

  const filteredRows = rows
  const tablePageCount = Math.max(1, Math.ceil(totalRows / pageSize))
  const visibleRows = rows

  const selectedQuestions = answerQuestions.filter((q) => selectedQuestionCols.has(q.id))

  const partFilterBadge = selectedParts.size < parts.length ? parts.length - selectedParts.size : 0
  const participantFilterBadge = selectedParticipants.size < participants.length ? participants.length - selectedParticipants.size : 0
  const dateFilterBadge = (dateFrom || dateTo) ? 1 : 0
  const qualityFilterBadge = selectedQualityFlags?.size ?? 0

  function baseColumnExported(id: BaseColumnId) {
    if (id === 'email' && anonymize) return false
    if (id === 'journey' && !showJourney) return false
    return selectedBaseCols.has(id)
  }

  const exportableBaseColumnCount = BASE_COLUMNS.filter((col) => {
    if (col.id === 'email' && anonymize) return false
    if (col.id === 'journey' && !showJourney) return false
    return true
  }).length
  const selectedColumnCount = BASE_COLUMNS.filter((col) => baseColumnExported(col.id)).length + selectedQuestionCols.size
  const totalColumnCount = exportableBaseColumnCount + answerQuestions.length
  const canDownloadCsv = visibleRows.length > 0 && selectedColumnCount > 0

  function selectedFilterValues<T extends { id: string }>(selected: Set<string>, options: T[]) {
    if (selected.size === 0) return ['__none__']
    if (selected.size === options.length) return []
    const validOptionIds = new Set(options.map((option) => option.id))
    return Array.from(selected).filter((id) => validOptionIds.has(id))
  }

  function allBaseCols() {
    return new Set(BASE_COLUMNS.filter((col) => showJourney || col.id !== 'journey').map((col) => col.id))
  }

  function allQuestionCols() {
    return new Set(answerQuestions.map((q) => q.id))
  }

  function baseColumnSelected(id: BaseColumnId) {
    return selectedBaseCols.has(id)
  }

  function toggleBaseColumn(id: BaseColumnId) {
    setSelectedBaseCols(toggle(selectedBaseCols, id))
  }

  function downloadCSV() {
    if (!canDownloadCsv) return
    const questionHeader = (q: Question) => parts.length > 1 ? `${q.partName}: ${q.text}` : q.text
    const baseHeaders = BASE_COLUMNS.flatMap((col) => {
      if (!baseColumnExported(col.id)) return []
      if (col.id === 'participant') return [anonymize ? 'Participant ID' : 'Participant']
      if (col.id === 'submittedAt') return ['Submitted at']
      return [col.label]
    })
    const questionHeaders = selectedQuestions.flatMap((q) => {
      const label = questionHeader(q)
      return q.type === 'FREE_TEXT'
        ? [label, `${label} tags`]
        : [label]
    })
    const headers = [...baseHeaders, ...questionHeaders]
    const csvRows = filteredRows.map((r) => {
      const baseValues = BASE_COLUMNS.flatMap((col) => {
        if (!baseColumnExported(col.id)) return []
        if (col.id === 'entryId') return [r.entryId]
        if (col.id === 'dataType') return [dataTypeLabel(r.isPilot)]
        if (col.id === 'participant') return [anonymize ? participantAliasById.get(r.participantId) ?? 'P000' : r.participantName]
        if (col.id === 'email') return [r.participantEmail]
        if (col.id === 'journey') return [r.journeyLabel || r.journeyId || '']
        if (col.id === 'part') return [r.partName]
        if (col.id === 'date') return [r.date]
        if (col.id === 'submittedAt') return [r.submittedAt]
        if (col.id === 'timezone') return [r.timezone ?? '']
        if (col.id === 'qualityFlags') return [formatQualityFlags(r.qualityFlags)]
        return [String(studyVersion)]
      })
      return [
      ...baseValues,
      ...selectedQuestions.flatMap((q) => {
        const answer = formatVisibleAnswer({ value: r.answers[q.id], wasShown: r.answerShown?.[q.id] }, q.type)
        if (q.type !== 'FREE_TEXT') return [answer]
        const tags = (r.answerTags?.[q.id] ?? []).join('; ')
        return [answer, tags]
      })
    ].map((value) => csvCell(String(value))).join(',')
    })
    const blob = new Blob([[headers.map((header) => csvCell(header)).join(','), ...csvRows].join('\n')], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${studyName.replace(/[^a-z0-9]/gi, '_')}_export.csv`
    a.click()
  }

  return (
    <div className="space-y-3">
      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <TextInput
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') updateServerFilters({ search: searchDraft, page: 1 })
            }}
            placeholder="Search data"
            className="w-48 bg-white"
          />
          {searchDraft !== search && (
            <Button type="button" tone="secondary" size="sm" onClick={() => updateServerFilters({ search: searchDraft, page: 1 })}>
              Search
            </Button>
          )}
          {/* Parts filter */}
          <Dropdown label="Parts" badge={partFilterBadge}>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Parts</p>
            <div className="space-y-1.5">
              {parts.map((p) => (
                <label key={p.id} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={selectedParts.has(p.id)}
                    onChange={() => {
                      const next = toggle(selectedParts, p.id)
                      updateServerFilters({ partIds: selectedFilterValues(next, parts), page: 1 })
                    }}
                    className="w-4 h-4 rounded text-indigo-600" />
                  <span className="text-sm text-slate-700">{p.name}</span>
                </label>
              ))}
            </div>
            <Button type="button" onClick={() => updateServerFilters({ partIds: [], page: 1 })}
              tone="ghost" size="sm" className="mt-3">Reset</Button>
          </Dropdown>

          {/* Participants filter */}
          <Dropdown label="Participants" badge={participantFilterBadge}>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Participants</p>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {participants.map((p) => (
                <label key={p.id} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={selectedParticipants.has(p.id)}
                    onChange={() => {
                      const next = toggle(selectedParticipants, p.id)
                      updateServerFilters({ participantIds: selectedFilterValues(next, participants), page: 1 })
                    }}
                    className="w-4 h-4 rounded text-indigo-600" />
                  <span className="text-sm text-slate-700">{p.name}</span>
                </label>
              ))}
            </div>
            <Button type="button" onClick={() => updateServerFilters({ participantIds: [], page: 1 })}
              tone="ghost" size="sm" className="mt-3">Reset</Button>
          </Dropdown>

          {/* Date filter */}
          <Dropdown label="Date" badge={dateFilterBadge}>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Date range</p>
            <div className="space-y-2 w-44">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">From</label>
                <TextInput type="date" value={dateFrom} onChange={(e) => updateServerFilters({ dateFrom: e.target.value, page: 1 })} />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">To</label>
                <TextInput type="date" value={dateTo} onChange={(e) => updateServerFilters({ dateTo: e.target.value, page: 1 })} />
              </div>
              {(dateFrom || dateTo) && (
                <Button type="button" onClick={() => updateServerFilters({ dateFrom: '', dateTo: '', page: 1 })}
                  tone="ghost" size="sm">Clear</Button>
              )}
            </div>
          </Dropdown>

          {availableQualityFlags.length > 0 && (
            <Dropdown label="Quality" badge={qualityFilterBadge}>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Quality flags</p>
              <div className="space-y-1.5">
                {availableQualityFlags.map((flag) => (
                  <label key={flag} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedQualityFlags?.has(flag) ?? false}
                      onChange={() => {
                        const current = selectedQualityFlags ?? new Set<string>()
                        const next = toggle(current, flag)
                        updateServerFilters({ qualityFlags: Array.from(next), page: 1 })
                      }}
                      className="w-4 h-4 rounded text-indigo-600"
                    />
                    <span className="text-sm text-slate-700">{entryQualityLabel(flag)}</span>
                  </label>
                ))}
              </div>
              {qualityFilterBadge > 0 && (
                <Button type="button" onClick={() => updateServerFilters({ qualityFlags: [], page: 1 })} tone="ghost" size="sm" className="mt-3">
                  Clear
                </Button>
              )}
            </Dropdown>
          )}

          <button
            type="button"
            disabled={pilotRowCount === 0}
            onClick={() => updateServerFilters({ includePilotData: !includePilotData, page: 1 })}
            className={`inline-flex min-h-10 items-center gap-3 rounded-xl border px-3 py-2 text-left text-sm transition-colors ${
              pilotRowCount === 0
                ? 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400'
                : includePilotData
                  ? 'border-indigo-200 bg-indigo-50 text-indigo-900 hover:bg-indigo-100'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <span>
              <span className="block font-semibold">
                {includePilotData ? 'Including pilot data' : 'Fieldwork data only'}
              </span>
              <span className="block text-xs text-slate-500">
                {pilotRowCount > 0
                  ? `${pilotRowCount} pilot ${pilotRowCount === 1 ? 'entry' : 'entries'} available`
                  : 'No pilot data yet'}
              </span>
            </span>
            <SwitchVisual checked={includePilotData} />
          </button>

          <span className="tabular text-sm text-[var(--text-tertiary)] pl-1">
            <span className="font-semibold text-[var(--text-secondary)]">{totalRows}</span> entries
          </span>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-600">
            <input type="checkbox" checked={anonymize} onChange={(e) => setAnonymize(e.target.checked)}
              className="w-4 h-4 rounded text-indigo-600" />
            Anonymize download
          </label>
          <Button onClick={downloadCSV} disabled={!canDownloadCsv} aria-label="Download CSV" className="shrink-0">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Download visible CSV
          </Button>
        </div>
      </div>

      {/* ── Table ── */}
      {totalRows === 0 ? (
        <div className="bg-white rounded-2xl border border-[var(--border)] shadow-sm p-12 text-center">
          <p className="text-slate-500 text-sm">No entries match the current filters.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-[var(--border)] shadow-sm overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-[var(--border-subtle)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-800">Export columns</p>
              <p className="text-sm text-slate-500">
                {selectedColumnCount} of {totalColumnCount} columns selected for CSV export.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                tone="secondary"
                size="sm"
                onClick={() => {
                  setSelectedBaseCols(allBaseCols())
                  setSelectedQuestionCols(allQuestionCols())
                }}
              >
                Select all
              </Button>
              <Button
                type="button"
                tone="secondary"
                size="sm"
                onClick={() => {
                  setSelectedBaseCols(new Set())
                  setSelectedQuestionCols(new Set())
                }}
              >
                Deselect all
              </Button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b-2 border-[var(--border)] bg-[var(--bg-sunken)]">
                  <th className="text-left px-4 py-3 bg-[var(--bg-sunken)] sticky left-0 z-10 border-r border-[var(--border-subtle)] min-w-[130px]">
                    <label className="flex items-center gap-2 cursor-pointer whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={baseColumnSelected('entryId')}
                        onChange={() => toggleBaseColumn('entryId')}
                        className="h-4 w-4 shrink-0 rounded border-slate-300 text-indigo-600"
                      />
                      <span className={`text-xs font-semibold text-slate-500 ${baseColumnSelected('entryId') ? '' : 'opacity-45'}`}>Entry ID</span>
                    </label>
                  </th>
                  <th className="text-left px-4 py-3 min-w-[110px]">
                    <label className="flex items-center gap-2 cursor-pointer whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={baseColumnSelected('dataType')}
                        onChange={() => toggleBaseColumn('dataType')}
                        className="h-4 w-4 shrink-0 rounded border-slate-300 text-indigo-600"
                      />
                      <span className={`text-xs font-semibold text-slate-500 ${baseColumnSelected('dataType') ? '' : 'opacity-45'}`}>Data type</span>
                    </label>
                  </th>
                  <th className="text-left px-4 py-3 min-w-[130px]">
                    <label className="flex items-center gap-2 cursor-pointer whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={baseColumnSelected('participant')}
                        onChange={() => toggleBaseColumn('participant')}
                        className="h-4 w-4 shrink-0 rounded border-slate-300 text-indigo-600"
                      />
                      <span className={`text-xs font-semibold text-slate-500 ${baseColumnSelected('participant') ? '' : 'opacity-45'}`}>Participant</span>
                    </label>
                  </th>
                  <th className="text-left px-4 py-3 hidden md:table-cell min-w-[160px]">
                    <label className={`flex items-center gap-2 whitespace-nowrap ${anonymize ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                      title={anonymize ? 'Email is excluded from anonymized downloads.' : undefined}>
                      <input
                        type="checkbox"
                        checked={baseColumnSelected('email') && !anonymize}
                        onChange={() => toggleBaseColumn('email')}
                        disabled={anonymize}
                        className="h-4 w-4 shrink-0 rounded border-slate-300 text-indigo-600 disabled:cursor-not-allowed disabled:opacity-40"
                      />
                      <span className={`text-xs font-semibold text-slate-500 ${baseColumnExported('email') ? '' : 'opacity-45'}`}>Email</span>
                    </label>
                  </th>
                  {showJourney && (
                    <th className="text-left px-4 py-3 min-w-[140px]">
                      <label className="flex items-center gap-2 cursor-pointer whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={baseColumnSelected('journey')}
                          onChange={() => toggleBaseColumn('journey')}
                          className="h-4 w-4 shrink-0 rounded border-slate-300 text-indigo-600"
                        />
                        <span className={`text-xs font-semibold text-slate-500 ${baseColumnSelected('journey') ? '' : 'opacity-45'}`}>Journey</span>
                      </label>
                    </th>
                  )}
                  {parts.length > 1 && (
                    <th className="text-left px-4 py-3 min-w-[120px]">
                      <label className="flex items-center gap-2 cursor-pointer whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={baseColumnSelected('part')}
                          onChange={() => toggleBaseColumn('part')}
                          className="h-4 w-4 shrink-0 rounded border-slate-300 text-indigo-600"
                        />
                        <span className={`text-xs font-semibold text-slate-500 ${baseColumnSelected('part') ? '' : 'opacity-45'}`}>Part</span>
                      </label>
                    </th>
                  )}
                  <th className="text-left px-4 py-3 min-w-[100px]">
                    <label className="flex items-center gap-2 cursor-pointer whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={baseColumnSelected('date')}
                        onChange={() => toggleBaseColumn('date')}
                        className="h-4 w-4 shrink-0 rounded border-slate-300 text-indigo-600"
                      />
                      <span className={`text-xs font-semibold text-slate-500 ${baseColumnSelected('date') ? '' : 'opacity-45'}`}>Date</span>
                    </label>
                  </th>
                  <th className="text-left px-4 py-3 min-w-[120px]">
                    <label className="flex items-center gap-2 cursor-pointer whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={baseColumnSelected('submittedAt')}
                        onChange={() => toggleBaseColumn('submittedAt')}
                        className="h-4 w-4 shrink-0 rounded border-slate-300 text-indigo-600"
                      />
                      <span className={`text-xs font-semibold text-slate-500 ${baseColumnSelected('submittedAt') ? '' : 'opacity-45'}`}>Submitted time</span>
                    </label>
                  </th>
                  <th className="text-left px-4 py-3 min-w-[140px]">
                    <label className="flex items-center gap-2 cursor-pointer whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={baseColumnSelected('timezone')}
                        onChange={() => toggleBaseColumn('timezone')}
                        className="h-4 w-4 shrink-0 rounded border-slate-300 text-indigo-600"
                      />
                      <span className={`text-xs font-semibold text-slate-500 ${baseColumnSelected('timezone') ? '' : 'opacity-45'}`}>Timezone</span>
                    </label>
                  </th>
                  <th className="text-left px-4 py-3 min-w-[160px]">
                    <label className="flex items-center gap-2 cursor-pointer whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={baseColumnSelected('qualityFlags')}
                        onChange={() => toggleBaseColumn('qualityFlags')}
                        className="h-4 w-4 shrink-0 rounded border-slate-300 text-indigo-600"
                      />
                      <span className={`text-xs font-semibold text-slate-500 ${baseColumnSelected('qualityFlags') ? '' : 'opacity-45'}`}>Quality flags</span>
                    </label>
                  </th>
                  <th className="text-left px-4 py-3 min-w-[120px]">
                    <label className="flex items-center gap-2 cursor-pointer whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={baseColumnSelected('studyVersion')}
                        onChange={() => toggleBaseColumn('studyVersion')}
                        className="h-4 w-4 shrink-0 rounded border-slate-300 text-indigo-600"
                      />
                      <span className={`text-xs font-semibold text-slate-500 ${baseColumnSelected('studyVersion') ? '' : 'opacity-45'}`}>Study version</span>
                    </label>
                  </th>
                  {answerQuestions.map((q) => (
                    <th key={q.id} className="text-left px-4 py-3 min-w-[160px] max-w-[220px]">
                      <label className="flex items-start gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedQuestionCols.has(q.id)}
                          onChange={() => setSelectedQuestionCols(toggle(selectedQuestionCols, q.id))}
                          className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-indigo-600"
                        />
                        <div className={selectedQuestionCols.has(q.id) ? '' : 'opacity-45'}>
                          <div className="text-xs font-semibold text-slate-500 line-clamp-2 leading-snug">{q.text}</div>
                          <div className="text-xs text-slate-400 mt-0.5 font-normal">{q.type.toLowerCase().replace('_', ' ')}</div>
                        </div>
                      </label>
                    </th>
                  ))}
                  <th className="text-right text-xs font-semibold text-slate-500 px-4 py-3 whitespace-nowrap min-w-[72px]">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {visibleRows.map((row, ri) => (
                  <tr key={row.entryId} className={`hover:bg-indigo-50/30 transition-colors ${ri % 2 === 0 ? '' : 'bg-slate-50/40'}`}>
                    <td className={`px-4 py-3 font-medium text-slate-800 whitespace-nowrap sticky left-0 border-r border-slate-100 z-10 ${ri % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'} ${baseColumnSelected('entryId') ? '' : 'opacity-60'}`}>
                      <span className={`${baseColumnSelected('entryId') ? '' : 'opacity-60'}`}>{row.entryId.slice(0, 10)}</span>
                    </td>
                    <td className={`px-4 py-3 whitespace-nowrap text-xs ${baseColumnSelected('dataType') ? '' : 'bg-slate-50/50 opacity-60'}`}>
                      <span className={`rounded-full px-2.5 py-1 font-semibold ${
                        row.isPilot
                          ? 'bg-sky-50 text-sky-700'
                          : 'bg-emerald-50 text-emerald-700'
                      }`}>
                        {dataTypeLabel(row.isPilot)}
                      </span>
                    </td>
                    <td className={`px-4 py-3 font-medium text-slate-800 whitespace-nowrap ${baseColumnSelected('participant') ? '' : 'opacity-60'}`}>
                      {row.participantName}
                    </td>
                    <td className={`px-4 py-3 text-slate-400 whitespace-nowrap text-xs hidden md:table-cell ${baseColumnExported('email') ? '' : 'bg-slate-50/50 opacity-60'}`}>
                      {row.participantEmail}
                    </td>
                    {showJourney && (
                      <td className={`px-4 py-3 text-slate-500 whitespace-nowrap text-xs font-medium ${baseColumnSelected('journey') ? '' : 'bg-slate-50/50 opacity-60'}`}>
                        {row.journeyLabel || row.journeyId || '—'}
                      </td>
                    )}
                    {parts.length > 1 && (
                      <td className={`px-4 py-3 text-slate-500 whitespace-nowrap text-xs ${baseColumnSelected('part') ? '' : 'bg-slate-50/50 opacity-60'}`}>
                        {row.partName}
                      </td>
                    )}
                    <td className={`px-4 py-3 text-slate-500 whitespace-nowrap text-xs font-medium ${baseColumnSelected('date') ? '' : 'bg-slate-50/50 opacity-60'}`}>
                      {row.date}
                    </td>
                    <td className={`px-4 py-3 text-slate-500 whitespace-nowrap text-xs font-medium ${baseColumnSelected('submittedAt') ? '' : 'bg-slate-50/50 opacity-60'}`}>
                      {formatSubmittedTime(row.submittedAt)}
                    </td>
                    <td className={`px-4 py-3 text-slate-500 whitespace-nowrap text-xs ${baseColumnSelected('timezone') ? '' : 'bg-slate-50/50 opacity-60'}`}>
                      {row.timezone ?? '—'}
                    </td>
                    <td className={`px-4 py-3 text-slate-500 whitespace-nowrap text-xs ${baseColumnSelected('qualityFlags') ? '' : 'bg-slate-50/50 opacity-60'}`}>
                      {row.qualityFlags.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {row.qualityFlags.map((flag) => (
                            <span key={flag} className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">
                              {entryQualityLabel(flag)}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className={`px-4 py-3 text-slate-500 whitespace-nowrap text-xs ${baseColumnSelected('studyVersion') ? '' : 'bg-slate-50/50 opacity-60'}`}>
                      {studyVersion}
                    </td>
                    {answerQuestions.map((q) => {
                      const wasShown = row.answerShown?.[q.id] !== false
                      const val = formatVisibleAnswer({ value: row.answers[q.id], wasShown: row.answerShown?.[q.id] }, q.type)
                      return (
                        <td key={q.id} className={`px-4 py-3 text-slate-700 max-w-[220px] align-top ${selectedQuestionCols.has(q.id) ? '' : 'bg-slate-50/50 opacity-60'}`}>
                          {!wasShown ? (
                            <span className="text-xs font-medium text-slate-400">{NOT_SHOWN_LABEL}</span>
                          ) : q.type === 'SCREENSHOT' ? (
                            val
                              ? <a href={val} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline text-xs">View</a>
                              : <span className="text-slate-200">—</span>
                          ) : q.type === 'RATING' ? (
                            <span className="font-semibold text-slate-700">{val || <span className="text-slate-200 font-normal">—</span>}</span>
                          ) : (
                            <span className="text-xs leading-relaxed line-clamp-3">
                              {val || <span className="text-slate-200">—</span>}
                            </span>
                          )}
                        </td>
                      )
                    })}
                    <td className="px-4 py-3 text-right align-middle">
                      <IconButton
                        type="button"
                        label={`Delete entry from ${row.participantName} on ${row.date}`}
                        tone="trash"
                        className="h-9 w-9"
                        onClick={() => setEntryToDelete(row)}
                      >
                        <TrashIcon />
                      </IconButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
            <p className="text-xs text-slate-400">
              Showing {visibleRows.length} of {totalRows} {totalRows === 1 ? 'entry' : 'entries'} · {selectedColumnCount} columns selected for visible CSV
            </p>
            {tablePageCount > 1 ? (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  tone="secondary"
                  size="sm"
                  disabled={currentPage <= 1}
                  onClick={() => updateServerFilters({ page: Math.max(1, currentPage - 1) })}
                >
                  Previous
                </Button>
                <span className="text-xs font-medium text-slate-500">
                  Page {Math.min(currentPage, tablePageCount)} of {tablePageCount}
                </span>
                <Button
                  type="button"
                  tone="secondary"
                  size="sm"
                  disabled={currentPage >= tablePageCount}
                  onClick={() => updateServerFilters({ page: Math.min(tablePageCount, currentPage + 1) })}
                >
                  Next
                </Button>
              </div>
            ) : (
              <p className="text-xs text-slate-400 hidden sm:block">The table remains visible; checkboxes choose CSV export columns</p>
            )}
          </div>
        </div>
      )}

      {entryToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-slate-950">Delete this entry?</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  This will permanently remove the entry from the data table, analysis dashboard, participant counts, and exports.
                </p>
                <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  <p className="font-semibold text-slate-900">{entryToDelete.participantName}</p>
                  <p>{entryToDelete.partName} · {entryToDelete.date} · {formatSubmittedTime(entryToDelete.submittedAt)}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEntryToDelete(null)}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close delete entry dialog"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </div>

            <form action={deleteEntryFromForm} className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <input type="hidden" name="studyId" value={studyId} />
              <input type="hidden" name="entryId" value={entryToDelete.entryId} />
              <Button type="button" tone="secondary" onClick={() => setEntryToDelete(null)}>
                Cancel
              </Button>
              <Button type="submit" tone="danger">
                Delete entry
              </Button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
