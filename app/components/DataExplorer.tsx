'use client'
import { useState, useMemo, useRef, useEffect } from 'react'
import { deleteEntryFromForm } from '@/app/actions/entries'
import { Badge, Button, IconButton, TextInput, TrashIcon } from '@/app/components/ui'
import { entryQualityLabel } from '@/app/lib/entry-state'

type Question = { id: string; partId: string; partName: string; text: string; type: string }
type Part = { id: string; name: string }
type Participant = { id: string; name: string; email: string }
type Row = {
  entryId: string
  partId: string
  partName: string
  participantId: string
  participantName: string
  participantEmail: string
  journeyId?: string | null
  journeyLabel?: string | null
  date: string
  submittedAt: string
  timezone: string | null
  qualityFlags: string[]
  answers: Record<string, string>
  answerShown?: Record<string, boolean>
  answerTags?: Record<string, string[]>
}

type Props = {
  studyId: string
  studyName: string
  studyVersion: number
  parts: Part[]
  participants: Participant[]
  questions: Question[]
  rows: Row[]
}

const BASE_COLUMNS = [
  { id: 'entryId', label: 'Entry ID' },
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
        <div className="absolute left-0 top-full mt-1.5 z-30 bg-white rounded-2xl border border-slate-100 shadow-lg p-4 min-w-[200px]">
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

function formatAnswerValue(value: string, type: string) {
  if (type !== 'MULTIPLE_CHOICE') return value
  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed)) return parsed.map(String).join('; ')
  } catch {}
  return value
}

function csvCell(value: string) {
  return `"${value.replace(/"/g, '""')}"`
}

export default function DataExplorer({ studyId, studyName, studyVersion, parts, participants, questions, rows }: Props) {
  const answerQuestions = questions.filter((q) => q.type !== 'CONTENT')
  const [selectedParts, setSelectedParts] = useState<Set<string>>(new Set(parts.map((p) => p.id)))
  const [selectedParticipants, setSelectedParticipants] = useState<Set<string>>(new Set(participants.map((p) => p.id)))
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [selectedBaseCols, setSelectedBaseCols] = useState<Set<BaseColumnId>>(new Set(BASE_COLUMNS.map((col) => col.id)))
  const [selectedQuestionCols, setSelectedQuestionCols] = useState<Set<string>>(new Set(answerQuestions.map((q) => q.id)))
  const [anonymize, setAnonymize] = useState(false)
  const [entryToDelete, setEntryToDelete] = useState<Row | null>(null)
  const [search, setSearch] = useState('')
  const showJourney = rows.some((row) => row.journeyId || row.journeyLabel)
  const availableQualityFlags = useMemo(
    () => Array.from(new Set(rows.flatMap((row) => row.qualityFlags))).sort(),
    [rows]
  )
  const [selectedQualityFlags, setSelectedQualityFlags] = useState<Set<string> | null>(null)
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

  const filteredRows = useMemo(() => rows.filter((r) => {
    if (!selectedParts.has(r.partId)) return false
    if (!selectedParticipants.has(r.participantId)) return false
    if (selectedQualityFlags && selectedQualityFlags.size > 0 && !r.qualityFlags.some((flag) => selectedQualityFlags.has(flag))) return false
    if (dateFrom && r.date < dateFrom) return false
    if (dateTo && r.date > dateTo) return false
    if (search.trim()) {
      const query = search.trim().toLowerCase()
      const haystack = [
        r.entryId,
        r.participantName,
        r.participantEmail,
        r.journeyLabel ?? '',
        r.partName,
        r.date,
        ...r.qualityFlags.map(entryQualityLabel),
        ...Object.values(r.answers),
        ...Object.values(r.answerTags ?? {}).flat(),
      ].join(' ').toLowerCase()
      if (!haystack.includes(query)) return false
    }
    return true
  }), [rows, selectedParts, selectedParticipants, selectedQualityFlags, dateFrom, dateTo, search])

  const selectedQuestions = answerQuestions.filter((q) => selectedQuestionCols.has(q.id))

  const partFilterBadge = selectedParts.size < parts.length ? parts.length - selectedParts.size : 0
  const participantFilterBadge = selectedParticipants.size < participants.length ? participants.length - selectedParticipants.size : 0
  const dateFilterBadge = (dateFrom || dateTo) ? 1 : 0
  const qualityFilterBadge = selectedQualityFlags?.size ?? 0
  const selectedColumnCount = selectedBaseCols.size + selectedQuestionCols.size
    - (!showJourney && selectedBaseCols.has('journey') ? 1 : 0)
  const totalColumnCount = BASE_COLUMNS.length - (showJourney ? 0 : 1) + answerQuestions.length

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
    const questionHeader = (q: Question) => parts.length > 1 ? `${q.partName}: ${q.text}` : q.text
    const baseHeaders = BASE_COLUMNS.flatMap((col) => {
      if (!showJourney && col.id === 'journey') return []
      if (!selectedBaseCols.has(col.id)) return []
      if (col.id === 'participant') return [anonymize ? 'Participant ID' : 'Participant']
      if (col.id === 'email' && anonymize) return []
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
        if (!showJourney && col.id === 'journey') return []
        if (!selectedBaseCols.has(col.id)) return []
        if (col.id === 'entryId') return [r.entryId]
        if (col.id === 'participant') return [anonymize ? participantAliasById.get(r.participantId) ?? 'P000' : r.participantName]
        if (col.id === 'email') return anonymize ? [] : [r.participantEmail]
        if (col.id === 'journey') return [r.journeyLabel || r.journeyId || '']
        if (col.id === 'part') return [r.partName]
        if (col.id === 'date') return [r.date]
        if (col.id === 'submittedAt') return [r.submittedAt]
        if (col.id === 'timezone') return [r.timezone ?? '']
        if (col.id === 'qualityFlags') return [r.qualityFlags.map(entryQualityLabel).join('; ')]
        return [String(studyVersion)]
      })
      return [
      ...baseValues,
      ...selectedQuestions.flatMap((q) => {
        const answer = r.answerShown?.[q.id] === false ? 'Not shown' : formatAnswerValue(r.answers[q.id] ?? '', q.type)
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
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search data"
            className="w-48 bg-white"
          />
          {/* Parts filter */}
          <Dropdown label="Parts" badge={partFilterBadge}>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Parts</p>
            <div className="space-y-1.5">
              {parts.map((p) => (
                <label key={p.id} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={selectedParts.has(p.id)}
                    onChange={() => setSelectedParts(toggle(selectedParts, p.id))}
                    className="w-4 h-4 rounded text-indigo-600" />
                  <span className="text-sm text-slate-700">{p.name}</span>
                </label>
              ))}
            </div>
            <Button type="button" onClick={() => setSelectedParts(new Set(parts.map(p => p.id)))}
              tone="ghost" size="sm" className="mt-3">Reset</Button>
          </Dropdown>

          {/* Participants filter */}
          <Dropdown label="Participants" badge={participantFilterBadge}>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Participants</p>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {participants.map((p) => (
                <label key={p.id} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={selectedParticipants.has(p.id)}
                    onChange={() => setSelectedParticipants(toggle(selectedParticipants, p.id))}
                    className="w-4 h-4 rounded text-indigo-600" />
                  <span className="text-sm text-slate-700">{p.name}</span>
                </label>
              ))}
            </div>
            <Button type="button" onClick={() => setSelectedParticipants(new Set(participants.map(p => p.id)))}
              tone="ghost" size="sm" className="mt-3">Reset</Button>
          </Dropdown>

          {/* Date filter */}
          <Dropdown label="Date" badge={dateFilterBadge}>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Date range</p>
            <div className="space-y-2 w-44">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">From</label>
                <TextInput type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">To</label>
                <TextInput type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </div>
              {(dateFrom || dateTo) && (
                <Button type="button" onClick={() => { setDateFrom(''); setDateTo('') }}
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
                        setSelectedQualityFlags(toggle(current, flag))
                      }}
                      className="w-4 h-4 rounded text-indigo-600"
                    />
                    <span className="text-sm text-slate-700">{entryQualityLabel(flag)}</span>
                  </label>
                ))}
              </div>
              {qualityFilterBadge > 0 && (
                <Button type="button" onClick={() => setSelectedQualityFlags(null)} tone="ghost" size="sm" className="mt-3">
                  Clear
                </Button>
              )}
            </Dropdown>
          )}

          <span className="text-sm text-slate-400 pl-1">
            <span className="font-semibold text-slate-600">{filteredRows.length}</span> entries
          </span>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-500">
            <input type="checkbox" checked={anonymize} onChange={(e) => setAnonymize(e.target.checked)}
              className="w-4 h-4 rounded text-indigo-600" />
            Anonymize export
          </label>
          <Button onClick={downloadCSV} className="shrink-0">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Download CSV
          </Button>
        </div>
      </div>

      {/* ── Table ── */}
      {filteredRows.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-12 text-center">
          <p className="text-slate-400 text-sm">No entries match the current filters.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
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
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="px-4 py-2 bg-slate-50 sticky left-0 z-10 border-r border-slate-100 min-w-[130px]">
                    <input
                      type="checkbox"
                      checked={baseColumnSelected('entryId')}
                      onChange={() => toggleBaseColumn('entryId')}
                      aria-label="Include entry ID in download"
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                    />
                  </th>
                  <th className="px-4 py-2 bg-slate-50 min-w-[130px]">
                    <input
                      type="checkbox"
                      checked={baseColumnSelected('participant')}
                      onChange={() => toggleBaseColumn('participant')}
                      aria-label="Include participant in download"
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                    />
                  </th>
                  <th className="px-4 py-2 bg-slate-50 hidden md:table-cell min-w-[160px]">
                    <input
                      type="checkbox"
                      checked={baseColumnSelected('email')}
                      onChange={() => toggleBaseColumn('email')}
                      aria-label="Include email in download"
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                    />
                  </th>
                  {showJourney && (
                    <th className="px-4 py-2 bg-slate-50 min-w-[140px]">
                      <input
                        type="checkbox"
                        checked={baseColumnSelected('journey')}
                        onChange={() => toggleBaseColumn('journey')}
                        aria-label="Include journey in download"
                        className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                      />
                    </th>
                  )}
                  {parts.length > 1 && (
                    <th className="px-4 py-2 bg-slate-50 min-w-[120px]">
                      <input
                        type="checkbox"
                        checked={baseColumnSelected('part')}
                        onChange={() => toggleBaseColumn('part')}
                        aria-label="Include part in download"
                        className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                      />
                    </th>
                  )}
                  <th className="px-4 py-2 bg-slate-50 min-w-[100px]">
                    <input
                      type="checkbox"
                      checked={baseColumnSelected('date')}
                      onChange={() => toggleBaseColumn('date')}
                      aria-label="Include date in download"
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                    />
                  </th>
                  <th className="px-4 py-2 bg-slate-50 min-w-[120px]">
                    <input
                      type="checkbox"
                      checked={baseColumnSelected('submittedAt')}
                      onChange={() => toggleBaseColumn('submittedAt')}
                      aria-label="Include submitted time in download"
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                    />
                  </th>
                  <th className="px-4 py-2 bg-slate-50 min-w-[140px]">
                    <input
                      type="checkbox"
                      checked={baseColumnSelected('timezone')}
                      onChange={() => toggleBaseColumn('timezone')}
                      aria-label="Include timezone in download"
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                    />
                  </th>
                  <th className="px-4 py-2 bg-slate-50 min-w-[160px]">
                    <input
                      type="checkbox"
                      checked={baseColumnSelected('qualityFlags')}
                      onChange={() => toggleBaseColumn('qualityFlags')}
                      aria-label="Include quality flags in download"
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                    />
                  </th>
                  <th className="px-4 py-2 bg-slate-50 min-w-[120px]">
                    <input
                      type="checkbox"
                      checked={baseColumnSelected('studyVersion')}
                      onChange={() => toggleBaseColumn('studyVersion')}
                      aria-label="Include study version in download"
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                    />
                  </th>
                  {answerQuestions.map((q) => (
                    <th key={q.id} className="px-4 py-2 bg-slate-50 min-w-[160px] max-w-[220px] text-left">
                      <input
                        type="checkbox"
                        checked={selectedQuestionCols.has(q.id)}
                        onChange={() => setSelectedQuestionCols(toggle(selectedQuestionCols, q.id))}
                        aria-label={`Include ${q.text} in download`}
                        className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                      />
                    </th>
                  ))}
                  <th className="px-4 py-2 bg-slate-50 min-w-[72px]" />
                </tr>
                <tr className="border-b-2 border-slate-100">
                  <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3 bg-white whitespace-nowrap sticky left-0 z-10 border-r border-slate-100 min-w-[130px]">
                    <span className={`${baseColumnSelected('entryId') ? '' : 'opacity-45'}`}>Entry ID</span>
                  </th>
                  <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3 bg-white whitespace-nowrap min-w-[130px]">
                    <span className={`${baseColumnSelected('participant') ? '' : 'opacity-45'}`}>Participant</span>
                  </th>
                  <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3 bg-white whitespace-nowrap hidden md:table-cell min-w-[160px]">
                    <span className={`${baseColumnSelected('email') ? '' : 'opacity-45'}`}>Email</span>
                  </th>
                  {showJourney && (
                    <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3 bg-white whitespace-nowrap min-w-[140px]">
                      <span className={`${baseColumnSelected('journey') ? '' : 'opacity-45'}`}>Journey</span>
                    </th>
                  )}
                  {parts.length > 1 && (
                    <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3 bg-white whitespace-nowrap min-w-[120px]">
                      <span className={`${baseColumnSelected('part') ? '' : 'opacity-45'}`}>Part</span>
                    </th>
                  )}
                  <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3 bg-white whitespace-nowrap min-w-[100px]">
                    <span className={`${baseColumnSelected('date') ? '' : 'opacity-45'}`}>Date</span>
                  </th>
                  <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3 bg-white whitespace-nowrap min-w-[120px]">
                    <span className={`${baseColumnSelected('submittedAt') ? '' : 'opacity-45'}`}>Submitted time</span>
                  </th>
                  <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3 bg-white whitespace-nowrap min-w-[140px]">
                    <span className={`${baseColumnSelected('timezone') ? '' : 'opacity-45'}`}>Timezone</span>
                  </th>
                  <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3 bg-white whitespace-nowrap min-w-[160px]">
                    <span className={`${baseColumnSelected('qualityFlags') ? '' : 'opacity-45'}`}>Quality flags</span>
                  </th>
                  <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3 bg-white whitespace-nowrap min-w-[120px]">
                    <span className={`${baseColumnSelected('studyVersion') ? '' : 'opacity-45'}`}>Study version</span>
                  </th>
                  {answerQuestions.map((q) => (
                    <th key={q.id}
                      className="text-left px-4 py-3 bg-white min-w-[160px] max-w-[220px]"
                    >
                      <div className={`${selectedQuestionCols.has(q.id) ? '' : 'opacity-45'}`}>
                        <div className="text-xs font-semibold text-slate-500 line-clamp-2 leading-snug">{q.text}</div>
                        <div className="text-xs text-slate-400 mt-0.5 font-normal">{q.type.toLowerCase().replace('_', ' ')}</div>
                      </div>
                    </th>
                  ))}
                  <th className="text-right text-xs font-semibold text-slate-500 px-4 py-3 bg-white whitespace-nowrap min-w-[72px]">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredRows.map((row, ri) => (
                  <tr key={row.entryId} className={`hover:bg-indigo-50/30 transition-colors ${ri % 2 === 0 ? '' : 'bg-slate-50/40'}`}>
                    <td className={`px-4 py-3 font-medium text-slate-800 whitespace-nowrap sticky left-0 border-r border-slate-100 z-10 ${ri % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'} ${baseColumnSelected('entryId') ? '' : 'opacity-60'}`}>
                      <span className={`${baseColumnSelected('entryId') ? '' : 'opacity-60'}`}>{row.entryId.slice(0, 10)}</span>
                    </td>
                    <td className={`px-4 py-3 font-medium text-slate-800 whitespace-nowrap ${baseColumnSelected('participant') ? '' : 'opacity-60'}`}>
                      {row.participantName}
                    </td>
                    <td className={`px-4 py-3 text-slate-400 whitespace-nowrap text-xs hidden md:table-cell ${baseColumnSelected('email') ? '' : 'bg-slate-50/50 opacity-60'}`}>
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
                      const val = wasShown ? formatAnswerValue(row.answers[q.id] ?? '', q.type) : 'Not shown'
                      return (
                        <td key={q.id} className={`px-4 py-3 text-slate-700 max-w-[220px] align-top ${selectedQuestionCols.has(q.id) ? '' : 'bg-slate-50/50 opacity-60'}`}>
                          {!wasShown ? (
                            <span className="text-xs font-medium text-slate-400">Not shown</span>
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
              {filteredRows.length} {filteredRows.length === 1 ? 'entry' : 'entries'} · {selectedColumnCount} columns selected for download
            </p>
            <p className="text-xs text-slate-400 hidden sm:block">The table remains visible; checkboxes choose CSV export columns</p>
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
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-xl leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close delete entry dialog"
              >
                x
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
