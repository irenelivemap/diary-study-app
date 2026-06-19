'use client'
import { useActionState, useState, useRef, useEffect } from 'react'
import type { DragEvent } from 'react'
import RichTextEditor from './RichTextEditor'
import { Button, IconButton, SwitchVisual, TextInput, TrashIcon } from '@/app/components/ui'
import SelectMenu from '@/app/components/SelectMenu'
import { phaseBadgeClass } from '@/app/lib/phase-colors'

type Question = {
  id: string
  text: string
  type: 'FREE_TEXT' | 'RATING' | 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'YES_NO' | 'SCREENSHOT' | 'DATE_TIME' | 'CONTENT'
  options: string[]
  randomizeOptions: boolean
  required: boolean
  page: number
  min?: number
  max?: number
  scaleType?: string
  showIfQuestionId?: string | null
  showIfOperator?: 'is' | 'is_not' | null
  showIfValue?: string | null
}
type Part = {
  id: string
  name: string
  order: number
  instructions?: string
  flow?: 'STANDARD' | 'JOURNEY_STAGE'
  entryPolicy?: 'ONCE_PER_DAY' | 'MULTIPLE_PER_DAY'
  targetEntries?: number | null
  durationDays?: number | null
  dueDate?: string | null
  unlockRule?: string | null
  unlockAt?: string | null
  isActive?: boolean
  questions: Question[]
}

type Props = {
  action: (prevState: unknown, formData: FormData) => Promise<{ error?: string } | void>
  initialName?: string
  initialDescription?: string
  initialMode?: 'STANDARD' | 'JOURNEY'
  initialJourneyName?: string
  initialConsentText?: string
  initialContactEmail?: string
  initialParticipantEntryAccess?: 'HIDE_PAST_ENTRIES' | 'SHOW_READ_ONLY'
  initialReminderNote?: string
  initialRemindersEnabled?: boolean
  initialReminderTime?: string
  initialReminderDays?: string[]
  initialReminderSubject?: string
  initialReminderBody?: string
  initialSequential?: boolean
  initialParts?: Part[]
  initialSaved?: boolean
  submitLabel?: string
}

type DropPosition = 'before' | 'after'

const QUESTION_TYPES = [
  { value: 'FREE_TEXT', label: 'Free text' },
  { value: 'RATING', label: 'Rating scale' },
  { value: 'SINGLE_CHOICE', label: 'Single choice' },
  { value: 'MULTIPLE_CHOICE', label: 'Multiple choice' },
  { value: 'YES_NO', label: 'Yes / No' },
  { value: 'DATE_TIME', label: 'Event date / time' },
  { value: 'SCREENSHOT', label: 'Screenshot' },
  { value: 'CONTENT', label: 'Content block' },
] as const

export const OTHER_SENTINEL = '__OTHER__'

const SCALE_TYPES = [
  { value: 'numbers', label: 'Numbers only' },
  { value: 'numbers_labeled', label: 'Numbers + labels' },
  { value: 'labels_only', label: 'Labels only' },
  { value: 'vas', label: 'VAS' },
]

const UNLOCK_RULE_OPTIONS = [
  { value: 'AFTER_PREVIOUS_TARGET', label: 'After previous part target is reached' },
  { value: 'DATE', label: 'On a specific date' },
  { value: 'MANUAL', label: 'Manual: when this part is active' },
  { value: 'IMMEDIATE', label: 'Immediately' },
]

const ENTRY_POLICY_OPTIONS = [
  { value: 'MULTIPLE_PER_DAY', label: 'Allow multiple entries' },
  { value: 'ONCE_PER_DAY', label: 'Limit to one per day' },
]

const PART_FLOW_OPTIONS = [
  { value: 'STANDARD', label: 'Independent diary part' },
  { value: 'JOURNEY_STAGE', label: 'Stage inside a journey' },
]

const WEEKDAYS = [
  { value: '1', label: 'Mon' },
  { value: '2', label: 'Tue' },
  { value: '3', label: 'Wed' },
  { value: '4', label: 'Thu' },
  { value: '5', label: 'Fri' },
  { value: '6', label: 'Sat' },
  { value: '0', label: 'Sun' },
]

let counter = 0
function uid() { return `_${++counter}` }

function MoreIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
      <circle cx="5" cy="12" r="1" />
    </svg>
  )
}

function defaultPart(order: number): Part {
  return {
    id: uid(), name: `Part ${order}`, order,
    instructions: '', flow: 'STANDARD', entryPolicy: 'MULTIPLE_PER_DAY', targetEntries: null, durationDays: null, dueDate: null, unlockRule: 'AFTER_PREVIOUS_TARGET', unlockAt: null, isActive: true,
    questions: [{ id: uid(), text: '', type: 'FREE_TEXT', options: [], randomizeOptions: false, required: true, page: 1 }],
  }
}

export default function StudyForm({
  action, initialName = '', initialDescription = '',
  initialMode = 'STANDARD', initialJourneyName = '',
  initialConsentText = '', initialContactEmail = '', initialParticipantEntryAccess = 'SHOW_READ_ONLY', initialReminderNote = '',
  initialRemindersEnabled = false, initialReminderTime = '18:00',
  initialReminderDays = [],
  initialReminderSubject = '', initialReminderBody = '',
  initialSequential = false, initialParts = [], initialSaved = false, submitLabel = 'Create study',
}: Props) {
  const [state, formAction, pending] = useActionState(action, null)
  const [parts, setParts] = useState<Part[]>(
    initialParts.length > 0 ? initialParts : [defaultPart(1)]
  )
  const [activePart, setActivePart] = useState(0)
  const [renamingPart, setRenamingPart] = useState<string | null>(null)
  const [studyMode, setStudyMode] = useState<'STANDARD' | 'JOURNEY'>(initialMode)
  const [isSequential, setIsSequential] = useState(initialSequential)
  const [remindersEnabled, setRemindersEnabled] = useState(initialRemindersEnabled)
  const [reminderDays, setReminderDays] = useState<string[]>(initialReminderDays)
  const [collapsedQuestions, setCollapsedQuestions] = useState<Record<string, boolean>>({})
  const [openQuestionSettingsId, setOpenQuestionSettingsId] = useState<string | null>(null)
  const [draggedQuestion, setDraggedQuestion] = useState<{ partId: string; page: number; qId: string } | null>(null)
  const [draggedOption, setDraggedOption] = useState<{ partId: string; qId: string; index: number } | null>(null)
  const [questionDropIndicator, setQuestionDropIndicator] = useState<{ qId: string; position: DropPosition } | null>(null)
  const [optionDropIndicator, setOptionDropIndicator] = useState<{ qId: string; index: number; position: DropPosition } | null>(null)
  const [landedQuestionId, setLandedQuestionId] = useState<string | null>(null)
  const [landedOption, setLandedOption] = useState<{ qId: string; index: number } | null>(null)
  const [partToDelete, setPartToDelete] = useState<{ id: string; name: string } | null>(null)
  const [contentImageUploading, setContentImageUploading] = useState<Record<string, boolean>>({})
  const [localError, setLocalError] = useState('')
  const [isDirty, setIsDirty] = useState(false)
  const [recentlySaved, setRecentlySaved] = useState(initialSaved)
  const partsInputRef = useRef<HTMLInputElement>(null)
  const hasTrackedInitialParts = useRef(false)

  const isEditForm = submitLabel === 'Save changes'

  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (!isDirty || pending) return
      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isDirty, pending])

  useEffect(() => {
    if (partsInputRef.current) partsInputRef.current.value = JSON.stringify(parts)
    if (hasTrackedInitialParts.current) {
      setIsDirty(true)
    } else {
      hasTrackedInitialParts.current = true
    }
  }, [parts])

  const part = parts[activePart] ?? parts[0]
  const hasJourneyStages = parts.some((candidate) => candidate.flow === 'JOURNEY_STAGE') || studyMode === 'JOURNEY'
  const allReminderDaysSelected = reminderDays.length === 0 || reminderDays.length === WEEKDAYS.length

  function toggleReminderDay(day: string) {
    setRecentlySaved(false)
    setIsDirty(true)
    setReminderDays((current) => {
      const normalized = current.length === 0 ? WEEKDAYS.map((item) => item.value) : current
      return normalized.includes(day)
        ? normalized.filter((item) => item !== day)
        : [...normalized, day]
    })
  }

  // ── Part operations ──────────────────────────────────
  function addPart() {
    const newPart = { ...defaultPart(parts.length + 1), flow: studyMode === 'JOURNEY' ? 'JOURNEY_STAGE' as const : 'STANDARD' as const }
    setParts((p) => [...p, newPart])
    setActivePart(parts.length)
  }

  function deletePart(idx: number) {
    if (parts.length === 1) return
    const candidate = parts[idx]
    if (!candidate) return
    setPartToDelete({ id: candidate.id, name: candidate.name })
  }

  function confirmDeletePart() {
    if (!partToDelete || parts.length === 1) return
    const nextParts = parts
      .filter((candidate) => candidate.id !== partToDelete.id)
      .map((candidate, index) => ({ ...candidate, order: index + 1 }))
    setParts(nextParts)
    setActivePart((current) => Math.min(current, Math.max(nextParts.length - 1, 0)))
    setPartToDelete(null)
  }

  function updatePart(id: string, patch: Partial<Part>) {
    setParts((p) => p.map((x) => (x.id === id ? { ...x, ...patch } : x)) as Part[])
  }

  // ── Question operations ──────────────────────────────
  function addQuestion(partId: string, page: number) {
    const newQ: Question = { id: uid(), text: '', type: 'FREE_TEXT', options: [], randomizeOptions: false, required: true, page }
    setParts((p) => p.map((x) =>
      x.id !== partId ? x : { ...x, questions: [...x.questions, newQ] }
    ))
    setCollapsedQuestions((prev) => ({ ...prev, [newQ.id]: false }))
  }

  function removeQuestion(partId: string, qId: string) {
    setParts((p) => p.map((x) =>
      x.id !== partId ? x : { ...x, questions: x.questions.filter((q) => q.id !== qId) }
    ) as Part[])
    setCollapsedQuestions((prev) => {
      const next = { ...prev }
      delete next[qId]
      return next
    })
  }

  function updateQuestion(partId: string, qId: string, patch: Partial<Question>) {
    setParts((p) => p.map((x) =>
      x.id !== partId ? x : { ...x, questions: x.questions.map((q) => q.id === qId ? { ...q, ...patch } : q) }
    ) as Part[])
  }

  function choiceLimitDefaults(q: Question) {
    const optionCount = Math.max((q.options ?? []).filter((option) => option !== OTHER_SENTINEL).length, 1)
    return {
      min: q.min == null ? (q.required === false ? 0 : 1) : Math.max(0, Math.min(q.min, optionCount)),
      max: q.max == null ? optionCount : Math.max(1, Math.min(q.max, optionCount)),
    }
  }

  async function uploadContentImage(partId: string, qId: string, file: File) {
    setContentImageUploading((prev) => ({ ...prev, [qId]: true }))
    setLocalError('')
    try {
      const fd = new FormData()
      fd.append('context', 'study-content')
      fd.append('file', file)
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok || !data.url) throw new Error(data.error || 'Upload failed.')
      updateQuestion(partId, qId, { options: [data.url] })
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'Upload failed.')
    } finally {
      setContentImageUploading((prev) => ({ ...prev, [qId]: false }))
    }
  }

  function markQuestionLanded(qId: string) {
    setLandedQuestionId(qId)
    window.setTimeout(() => setLandedQuestionId((current) => current === qId ? null : current), 1800)
  }

  function markOptionLanded(qId: string, index: number) {
    setLandedOption({ qId, index })
    window.setTimeout(() => setLandedOption((current) => current?.qId === qId && current.index === index ? null : current), 1800)
  }

  function dropPositionFromEvent(event: DragEvent<HTMLElement>): DropPosition {
    const rect = event.currentTarget.getBoundingClientRect()
    return event.clientY > rect.top + rect.height / 2 ? 'after' : 'before'
  }

  function reorderQuestion(partId: string, page: number, draggedId: string, targetId: string, position: DropPosition = 'before') {
    if (draggedId === targetId) return
    setParts((p) => p.map((x) => {
      if (x.id !== partId) return x
      const pageQs = x.questions.filter((q) => q.page === page)
      const from = pageQs.findIndex((q) => q.id === draggedId)
      if (from < 0) return x

      const moved = pageQs[from]
      const withoutMoved = pageQs.filter((q) => q.id !== draggedId)
      const targetIndex = withoutMoved.findIndex((q) => q.id === targetId)
      if (targetIndex < 0) return x
      const insertIndex = targetIndex + (position === 'after' ? 1 : 0)
      const reordered = [...withoutMoved]
      reordered.splice(insertIndex, 0, moved)

      let pageIndex = 0
      return {
        ...x,
        questions: x.questions.map((q) => q.page === page ? reordered[pageIndex++] : q),
      }
    }))
    markQuestionLanded(draggedId)
  }

  function reorderQuestionWithKeyboard(partId: string, page: number, qId: string, direction: 'up' | 'down') {
    const targetPart = parts.find((candidate) => candidate.id === partId)
    const pageQs = targetPart?.questions.filter((q) => q.page === page) ?? []
    const index = pageQs.findIndex((q) => q.id === qId)
    const nextIndex = direction === 'up' ? index - 1 : index + 1
    if (index < 0 || nextIndex < 0 || nextIndex >= pageQs.length) return
    reorderQuestion(partId, page, qId, pageQs[nextIndex].id, direction === 'up' ? 'before' : 'after')
  }

  function addOption(partId: string, qId: string) {
    setParts((p) => p.map((x) =>
      x.id !== partId ? x : {
        ...x, questions: x.questions.map((q) => {
          if (q.id !== qId) return q
          const hasOther = (q.options ?? []).includes(OTHER_SENTINEL)
          const regular = (q.options ?? []).filter((o) => o !== OTHER_SENTINEL)
          return { ...q, options: hasOther ? [...regular, '', OTHER_SENTINEL] : [...regular, ''] }
        })
      }
    ))
  }

  function updateOption(partId: string, qId: string, idx: number, val: string) {
    setParts((p) => p.map((x) =>
      x.id !== partId ? x : {
        ...x, questions: x.questions.map((q) =>
          q.id !== qId ? q : { ...q, options: q.options?.map((o, i) => i === idx ? val : o) }
        )
      }
    ))
  }

  function removeOption(partId: string, qId: string, idx: number) {
    setParts((p) => p.map((x) =>
      x.id !== partId ? x : {
        ...x, questions: x.questions.map((q) =>
          q.id !== qId ? q : { ...q, options: q.options?.filter((_, i) => i !== idx) }
        )
      }
    ))
  }

  function reorderOption(partId: string, qId: string, from: number, to: number, position: DropPosition = 'before') {
    if (from === to) return
    let landedIndex: number | null = null
    setParts((p) => p.map((x) =>
      x.id !== partId ? x : {
        ...x,
        questions: x.questions.map((q) => {
          if (q.id !== qId) return q
          const hasOther = (q.options ?? []).includes(OTHER_SENTINEL)
          const regular = (q.options ?? []).filter((o) => o !== OTHER_SENTINEL)
          if (from < 0 || to < 0 || from >= regular.length || to >= regular.length) return q
          const moved = regular[from]
          const withoutMoved = regular.filter((_, index) => index !== from)
          const adjustedTarget = from < to ? to - 1 : to
          const insertIndex = adjustedTarget + (position === 'after' ? 1 : 0)
          const reordered = [...withoutMoved]
          reordered.splice(insertIndex, 0, moved)
          landedIndex = insertIndex
          return { ...q, options: hasOther ? [...reordered, OTHER_SENTINEL] : reordered }
        })
      }
    ))
    if (landedIndex != null) markOptionLanded(qId, landedIndex)
  }

  function reorderOptionWithKeyboard(partId: string, qId: string, index: number, direction: 'up' | 'down') {
    const targetPart = parts.find((candidate) => candidate.id === partId)
    const question = targetPart?.questions.find((candidate) => candidate.id === qId)
    const regular = (question?.options ?? []).filter((option) => option !== OTHER_SENTINEL)
    const nextIndex = direction === 'up' ? index - 1 : index + 1
    if (nextIndex < 0 || nextIndex >= regular.length) return
    reorderOption(partId, qId, index, nextIndex, direction === 'up' ? 'before' : 'after')
  }

  function toggleOther(partId: string, qId: string, add: boolean) {
    setParts((p) => p.map((x) =>
      x.id !== partId ? x : {
        ...x, questions: x.questions.map((q) => {
          if (q.id !== qId) return q
          const without = (q.options ?? []).filter((o) => o !== OTHER_SENTINEL)
          return { ...q, options: add ? [...without, OTHER_SENTINEL] : without }
        })
      }
    ))
  }

  function addPage(partId: string) {
    const p = parts.find((x) => x.id === partId)
    if (!p) return
    const maxPage = Math.max(...p.questions.map((q) => q.page), 1)
    addQuestion(partId, maxPage + 1)
  }

  function deletePage(partId: string, page: number) {
    setParts((prev) => prev.map((x) => {
      if (x.id !== partId) return x
      const newQs = x.questions
        .filter((q) => q.page !== page)
        .map((q) => q.page > page ? { ...q, page: q.page - 1 } : q)
      const fallback: Question = { id: uid(), text: '', type: 'FREE_TEXT', options: [], randomizeOptions: false, required: true, page: 1 }
      return { ...x, questions: newQs.length > 0 ? newQs : [fallback] }
    }))
  }

  function toggleQuestionCollapsed(qId: string) {
    setCollapsedQuestions((prev) => ({ ...prev, [qId]: !prev[qId] }))
  }

  function plainText(html: string) {
    return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  }

  // ── Render ───────────────────────────────────────────
  const pageCount = part ? Math.max(...part.questions.map((q) => q.page), 1) : 1
  const pages = Array.from({ length: pageCount }, (_, i) => i + 1)
  const hasSaveIssue = Boolean(state?.error || localError)
  const saveBarShouldStick = isDirty || pending || hasSaveIssue
  const saveStatusTitle = pending
    ? 'Saving setup…'
    : hasSaveIssue
    ? 'Could not save setup'
    : isDirty
    ? 'Unsaved changes'
    : recentlySaved
    ? 'Changes saved'
    : isEditForm
    ? 'Setup is up to date'
    : 'Ready to create'
  const saveStatusCopy = pending
    ? 'Keep this page open while diARI saves the setup.'
    : hasSaveIssue
    ? 'Fix the issue above, then save again.'
    : isDirty
    ? 'Save once when you are done editing this study.'
    : recentlySaved
    ? 'Your latest setup changes were saved.'
    : isEditForm
    ? 'Make a change and the save bar will follow you while you work.'
    : 'Add the study details, then create the study.'

  const inputCls = "w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-sunken)] px-4 py-2.5 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-indigo-400/30 focus:border-[var(--border-focus)] focus:bg-white transition-colors"
  const smallInputCls = "w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg-sunken)] px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-indigo-400/30 focus:border-[var(--border-focus)] focus:bg-white transition-colors"
  const sectionTitleCls = "text-sm font-semibold text-slate-800"
  const fieldLabelCls = "block text-sm font-medium text-slate-700 mb-2"
  const partsPanel = (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-sm">
      <div className="flex flex-1 gap-2 overflow-x-auto p-3 lg:flex-col lg:overflow-x-hidden lg:overflow-y-auto">
        {parts.map((p, i) => (
          <div key={p.id}
            className={`group flex min-w-[180px] max-w-[280px] cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2.5 transition-colors sm:min-w-[220px] lg:min-w-0 lg:max-w-none ${
              activePart === i
                ? 'border-indigo-300 bg-indigo-50 text-slate-900 ring-1 ring-indigo-100'
                : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
            }`}
            onClick={() => setActivePart(i)}>
            <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-xs font-bold ${phaseBadgeClass(i)}`}>
              PT {i + 1}
            </span>
            {renamingPart === p.id ? (
              <input autoFocus value={p.name}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => updatePart(p.id, { name: e.target.value })}
                onBlur={() => setRenamingPart(null)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') setRenamingPart(null) }}
                className="min-w-0 flex-1 border-b border-indigo-400 bg-transparent text-sm font-medium outline-none" />
            ) : (
              <span className="min-w-0 flex-1 truncate text-sm font-medium"
                onDoubleClick={(e) => { e.stopPropagation(); setRenamingPart(p.id) }}>
                {p.name}
              </span>
            )}
            <IconButton
              label={parts.length > 1 ? `Delete ${p.name}` : 'At least one part is required'}
              tone="trash"
              onClick={(e) => { e.stopPropagation(); deletePart(i) }}
              disabled={parts.length === 1}
              className="h-8 w-8 shrink-0">
              <TrashIcon />
            </IconButton>
          </div>
        ))}
      </div>
      <div className="border-t border-slate-100 p-3">
        <Button type="button" onClick={addPart} tone="secondary" size="sm" className="w-full border-dashed">
          + Add part
        </Button>
      </div>
    </div>
  )

  return (
    <form
      action={formAction}
      className={`space-y-5 ${saveBarShouldStick ? 'pb-24' : ''}`}
      onInputCapture={() => { setRecentlySaved(false); setIsDirty(true) }}
      onChangeCapture={() => { setRecentlySaved(false); setIsDirty(true) }}
    >
      {/* ── Study basics ── */}
      <div className="h-full overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-sm">
        <div className="p-5 space-y-4">
          <div>
            <label htmlFor="study-name" className={fieldLabelCls}>Study name *</label>
            <TextInput id="study-name" name="name" defaultValue={initialName} required placeholder="e.g. Daily wellbeing study" />
          </div>
          <div>
            <label htmlFor="study-description" className={fieldLabelCls}>Description</label>
            <textarea
              id="study-description"
              name="description"
              defaultValue={initialDescription}
              rows={3}
              className={`${inputCls} min-h-[84px] resize-y leading-relaxed`}
              placeholder="Short description (optional)"
            />
          </div>
          <fieldset>
            <legend className={fieldLabelCls}>Study structure</legend>
            <p className="-mt-1 mb-3 text-sm leading-relaxed text-slate-500">
              Pick a starting structure, then use Part type below if a study needs both independent diary parts and journey stages.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="cursor-pointer rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 transition-colors has-[:checked]:border-indigo-500 has-[:checked]:bg-indigo-50 has-[:checked]:ring-1 has-[:checked]:ring-indigo-100">
                <div className="flex items-start gap-3">
                  <input
                    type="radio"
                    name="mode"
                    value="STANDARD"
                    checked={studyMode === 'STANDARD'}
                    onChange={() => {
                      setStudyMode('STANDARD')
                      setParts((current) => current.map((candidate) => ({ ...candidate, flow: 'STANDARD' })))
                    }}
                    className="mt-1 h-4 w-4 border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Standard diary</p>
                    <p className="mt-1 text-sm leading-relaxed text-slate-500">Participants choose the entry form they need.</p>
                  </div>
                </div>
              </label>
              <label className="cursor-pointer rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 transition-colors has-[:checked]:border-indigo-500 has-[:checked]:bg-indigo-50 has-[:checked]:ring-1 has-[:checked]:ring-indigo-100">
                <div className="flex items-start gap-3">
                  <input
                    type="radio"
                    name="mode"
                    value="JOURNEY"
                    checked={studyMode === 'JOURNEY'}
                    onChange={() => {
                      setStudyMode('JOURNEY')
                      setParts((current) => current.map((candidate) => ({ ...candidate, flow: 'JOURNEY_STAGE' })))
                    }}
                    className="mt-1 h-4 w-4 border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Journey-based study</p>
                    <p className="mt-1 text-sm leading-relaxed text-slate-500">Guide participants through stages like before, during and after.</p>
                  </div>
                </div>
              </label>
            </div>
            {hasJourneyStages && (
              <div className="mt-3">
                <label htmlFor="journey-name" className={fieldLabelCls}>Journey name</label>
                <TextInput id="journey-name" name="journeyName" defaultValue={initialJourneyName} placeholder="e.g. Badi visit" />
                <p className="mt-2 text-sm text-slate-500">Participants will see actions using this name, for example “Start a mobility moment” or “Different Badi visit?”. Only parts marked as journey stages are included.</p>
              </div>
            )}
          </fieldset>
        <details className="group rounded-2xl border border-[var(--border)] bg-white">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-3">
            <div>
              <p className={sectionTitleCls}>Participant-facing information</p>
            </div>
            <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-white text-slate-500 transition-transform group-open:rotate-180" aria-hidden="true">
              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6l4 4 4-4" /></svg>
            </span>
          </summary>
          <div className="border-t border-[var(--border-subtle)] p-5 space-y-4">
            <div>
            <label className={fieldLabelCls}>Consent / intro text</label>
            <textarea
              name="consentText"
              defaultValue={initialConsentText}
              rows={4}
              className={`${inputCls} min-h-[112px] resize-y leading-relaxed`}
              placeholder="Explain what participants are agreeing to before they start."
            />
            </div>
            <div>
              <label className={fieldLabelCls}>Researcher contact email</label>
              <TextInput
                name="contactEmail"
                type="email"
                defaultValue={initialContactEmail}
                placeholder="researcher@example.com"
              />
            </div>
            <fieldset>
              <legend className={fieldLabelCls}>Submitted entry visibility</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="cursor-pointer rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 transition-colors has-[:checked]:border-indigo-500 has-[:checked]:bg-indigo-50 has-[:checked]:ring-1 has-[:checked]:ring-indigo-100">
                  <div className="flex items-start gap-3">
                    <input
                      type="radio"
                      name="participantEntryAccess"
                      value="HIDE_PAST_ENTRIES"
                      defaultChecked={initialParticipantEntryAccess === 'HIDE_PAST_ENTRIES'}
                      className="mt-1 h-4 w-4 border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Hide previous submissions</p>
                      <p className="mt-1 text-sm leading-relaxed text-slate-500">
                        Participants see the confirmation after submitting, but not older entries.
                      </p>
                    </div>
                  </div>
                </label>
                <label className="cursor-pointer rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 transition-colors has-[:checked]:border-indigo-500 has-[:checked]:bg-indigo-50 has-[:checked]:ring-1 has-[:checked]:ring-indigo-100">
                  <div className="flex items-start gap-3">
                    <input
                      type="radio"
                      name="participantEntryAccess"
                      value="SHOW_READ_ONLY"
                      defaultChecked={initialParticipantEntryAccess === 'SHOW_READ_ONLY'}
                      className="mt-1 h-4 w-4 border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Let participants review read-only submissions</p>
                      <p className="mt-1 text-sm leading-relaxed text-slate-500">
                        Participants can review what they submitted, but cannot edit it.
                      </p>
                    </div>
                  </div>
                </label>
              </div>
            </fieldset>
            <div>
              <label className={fieldLabelCls}>Reminder note</label>
              <TextInput
                name="reminderNote"
                defaultValue={initialReminderNote}
                placeholder="e.g. Please complete entries before 9pm."
              />
            </div>
          </div>
        </details>

        <details className="group rounded-2xl border border-[var(--border)] bg-white">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-3">
            <div>
              <p className={sectionTitleCls}>Email reminders</p>
            </div>
            <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-white text-slate-500 transition-transform group-open:rotate-180" aria-hidden="true">
              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6l4 4 4-4" /></svg>
            </span>
          </summary>
          <div className="border-t border-[var(--border-subtle)] p-5 space-y-4">
          <label className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <span className="text-sm font-medium text-slate-800">Send automatic reminders</span>
            <span className="flex items-center gap-2.5">
              <input type="hidden" name="remindersEnabled" value="false" />
              <input
                type="checkbox"
                name="remindersEnabled"
                value="true"
                checked={remindersEnabled}
                onChange={(e) => setRemindersEnabled(e.target.checked)}
                className="sr-only"
              />
              <SwitchVisual checked={remindersEnabled} />
              <span className="text-sm text-slate-600">{remindersEnabled ? 'Enabled' : 'Off'}</span>
            </span>
          </label>
          {(allReminderDaysSelected ? [] : reminderDays).map((day) => (
            <input key={day} type="hidden" name="reminderDays" value={day} />
          ))}
          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <label className={fieldLabelCls}>Send on</label>
              <button
                type="button"
                onClick={() => {
                  setReminderDays([])
                  setIsDirty(true)
                }}
                className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
              >
                Every day
              </button>
            </div>
            <div className="grid grid-cols-7 gap-2">
              {WEEKDAYS.map((day) => {
                const selected = allReminderDaysSelected || reminderDays.includes(day.value)
                return (
                  <button
                    key={day.value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggleReminderDay(day.value)}
                    className={`h-10 rounded-xl border text-sm font-semibold transition-colors ${
                      selected
                        ? 'border-indigo-600 bg-indigo-600 text-white'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {day.label}
                  </button>
                )
              })}
            </div>
            <p className="mt-2 text-sm text-slate-500">
              {allReminderDaysSelected
                ? 'Automatic reminders can run every day after the selected time.'
                : 'Automatic reminders only run on the selected days.'}
            </p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-[180px_minmax(0,1fr)] gap-4">
            <div>
              <label className={fieldLabelCls}>Send after</label>
              <TextInput
                name="reminderTime"
                type="time"
                defaultValue={initialReminderTime}
              />
            </div>
            <div>
              <label className={fieldLabelCls}>Email subject</label>
              <TextInput
                name="reminderSubject"
                defaultValue={initialReminderSubject}
                placeholder="Reminder: please complete today's diary entry"
              />
            </div>
          </div>

          <div>
            <label className={fieldLabelCls}>Email message</label>
            <textarea
              name="reminderBody"
              defaultValue={initialReminderBody}
              rows={4}
              className={`${inputCls} min-h-[112px] resize-y leading-relaxed`}
              placeholder="Write the reminder participants should receive."
            />
          </div>
          </div>
        </details>
        </div>
      </div>

      {/* ── Parts ── */}
      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)] lg:items-stretch">
        {part && (
          <>
            {partsPanel}
            <div className="min-w-0">
            {/* Part settings */}
            <div className="bg-white rounded-2xl border border-[var(--border)] shadow-sm overflow-hidden">
              {/* Part header */}
              <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100">
                <span className={`rounded-lg px-2 py-1 text-xs font-bold ${phaseBadgeClass(activePart)}`}>
                  PT {activePart + 1}
                </span>
                <input value={part.name} onChange={(e) => updatePart(part.id, { name: e.target.value })}
                  className="font-semibold text-slate-900 text-base bg-transparent border-b-2 border-transparent hover:border-slate-200 focus:border-indigo-400 outline-none flex-1 transition-colors" />
              </div>

              {/* Part meta fields */}
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Instructions</label>
                  <textarea value={part.instructions ?? ''} rows={3}
                    onChange={(e) => updatePart(part.id, { instructions: e.target.value })}
                    placeholder="Describe what participants should do for this part of the study…"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white resize-y transition-colors" />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
                  <SelectMenu
                    label="Part type"
                    value={part.flow ?? (studyMode === 'JOURNEY' ? 'JOURNEY_STAGE' : 'STANDARD')}
                    onChange={(value) => {
                      const flow = value as Part['flow']
                      setParts((current) => {
                        const next = current.map((candidate) => candidate.id === part.id ? { ...candidate, flow } : candidate)
                        setStudyMode(next.some((candidate) => candidate.flow === 'JOURNEY_STAGE') ? 'JOURNEY' : 'STANDARD')
                        return next
                      })
                    }}
                    options={PART_FLOW_OPTIONS}
                  />
                  <SelectMenu
                    label="Entry rule"
                    value={part.entryPolicy ?? 'MULTIPLE_PER_DAY'}
                    onChange={(value) => updatePart(part.id, { entryPolicy: value as Part['entryPolicy'] })}
                    options={ENTRY_POLICY_OPTIONS}
                  />
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Target entries</label>
                    <input type="number" min={1} value={part.targetEntries ?? ''}
                      onChange={(e) => updatePart(part.id, { targetEntries: e.target.value ? Number(e.target.value) : null })}
                      placeholder="e.g. 7"
                      className={smallInputCls} />
                    <p className="text-xs text-slate-400 mt-1">How many entries per participant</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Duration (days)</label>
                    <input type="number" min={1} value={part.durationDays ?? ''}
                      onChange={(e) => updatePart(part.id, { durationDays: e.target.value ? Number(e.target.value) : null })}
                      placeholder="e.g. 14"
                      className={smallInputCls} />
                    <p className="text-xs text-slate-400 mt-1">How long this part runs</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Due date</label>
                    <input type="date" value={part.dueDate ?? ''}
                      onChange={(e) => updatePart(part.id, { dueDate: e.target.value || null })}
                      className={smallInputCls} />
                    <p className="text-xs text-slate-400 mt-1">Optional deadline</p>
                  </div>
                </div>
                <details className="group rounded-xl border border-[var(--border)] bg-white">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3">
                    <span className="text-sm font-medium text-slate-800">Access and availability</span>
                    <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-white text-slate-500 transition-transform group-open:rotate-180" aria-hidden="true">
                      <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6l4 4 4-4" /></svg>
                    </span>
                  </summary>
                  <div className="space-y-4 border-t border-slate-100 p-4">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <span className="text-sm font-medium text-slate-700">This part accepts entries</span>
                        <span className="flex items-center gap-2.5">
                          <SwitchVisual checked={part.isActive !== false} />
                          <input
                            type="checkbox"
                            checked={part.isActive !== false}
                            onChange={() => updatePart(part.id, { isActive: !part.isActive })}
                            className="sr-only"
                          />
                          <span className="text-sm text-slate-600">{part.isActive !== false ? 'Active' : 'Inactive'}</span>
                        </span>
                      </label>
                      <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <span>
                          <span className="block text-sm font-medium text-slate-700">Require order</span>
                          <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">
                            Off keeps the recommended order visible but lets participants answer the stage that fits their situation.
                          </span>
                        </span>
                        <span className="flex items-center gap-2.5">
                          <input type="hidden" name="sequential" value="false" />
                          <input
                            type="checkbox"
                            name="sequential"
                            value="true"
                            checked={isSequential}
                            onChange={(e) => setIsSequential(e.target.checked)}
                            className="sr-only"
                          />
                          <SwitchVisual checked={isSequential} />
                          <span className="text-sm text-slate-600">{isSequential ? 'Strict' : 'Flexible'}</span>
                        </span>
                      </label>
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <SelectMenu
                          label="Unlock rule"
                          value={part.unlockRule ?? 'AFTER_PREVIOUS_TARGET'}
                          onChange={(value) => updatePart(part.id, { unlockRule: value })}
                          options={UNLOCK_RULE_OPTIONS}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">Unlock date</label>
                        <input
                          type="date"
                          value={part.unlockAt ?? ''}
                          onChange={(e) => updatePart(part.id, { unlockAt: e.target.value || null })}
                          disabled={(part.unlockRule ?? 'AFTER_PREVIOUS_TARGET') !== 'DATE'}
                          className={`${smallInputCls} disabled:opacity-50 disabled:cursor-not-allowed`}
                        />
                      </div>
                    </div>
                  </div>
                </details>
              </div>
            </div>
            </div>

            <div className="min-w-0 space-y-4 lg:col-span-2">
            {/* Questions */}
            {pages.map((page) => {
              const pageQs = part.questions.filter((q) => q.page === page)
              return (
                <div key={page} className="space-y-3">
                  {pageCount > 1 && (
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-slate-600">Page {page}</p>
                      <Button type="button" onClick={() => deletePage(part.id, page)}
                        tone="danger" size="sm">
                        Remove page
                      </Button>
                    </div>
                  )}

                  {pageQs.map((q, i) => {
                    const regularOptions = (q.options ?? []).filter((o) => o !== OTHER_SENTINEL)
                    const hasOther = (q.options ?? []).includes(OTHER_SENTINEL)
                    const scaleType = q.scaleType ?? 'numbers'
                    const collapsed = collapsedQuestions[q.id] === true
                    const questionPreview = plainText(q.text) || 'Untitled question'
                    const isContentBlock = q.type === 'CONTENT'
                    const itemLabel = isContentBlock ? `Content block ${i + 1}` : `Question ${i + 1}`
                    const allBefore = part.questions.filter((prev) => {
                      if (prev.id === q.id) return false
                      if (prev.page < q.page) return true
                      if (prev.page === q.page) {
                        const pageQuestions = part.questions.filter((candidate) => candidate.page === q.page)
                        const prevIdx = pageQuestions.findIndex((candidate) => candidate.id === prev.id)
                        const thisIdx = pageQuestions.findIndex((candidate) => candidate.id === q.id)
                        return prevIdx < thisIdx
                      }
                      return false
                    }).filter((previous) => ['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'YES_NO', 'RATING'].includes(previous.type))
                    const triggerQ = allBefore.find((previous) => previous.id === q.showIfQuestionId)
                    const conditionOperatorLabel = q.showIfOperator === 'is_not' ? 'is not' : 'is'
                    const conditionSummary = triggerQ && q.showIfValue
                      ? `Shown if ${plainText(triggerQ.text).slice(0, 36) || 'selected question'} ${conditionOperatorLabel} ${q.showIfValue}`
                      : null
                    const canSetCondition = allBefore.length > 0 || Boolean(q.showIfQuestionId || q.showIfValue)
                    const settingsOpen = openQuestionSettingsId === q.id

                    return (
                      <div key={q.id} className="group/setup-question relative">
                        {questionDropIndicator?.qId === q.id && (
                          <div
                            className={`pointer-events-none absolute left-0 right-0 z-20 lg:left-0 ${questionDropIndicator.position === 'before' ? '-top-1.5' : '-bottom-1.5'}`}
                            aria-hidden
                          >
                            <div className="h-1 rounded-full bg-[var(--accent)] shadow-[0_0_0_3px_var(--accent-subtle)]" />
                          </div>
                        )}
                        <button
                          type="button"
                          draggable
                          title="Drag question. Use Alt+Up or Alt+Down to reorder with the keyboard."
                          aria-label="Drag to reorder question"
                          aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
                          onDragStart={(event) => {
                            setDraggedQuestion({ partId: part.id, page: q.page, qId: q.id })
                            event.dataTransfer.effectAllowed = 'move'
                          }}
                          onDragEnd={() => {
                            setDraggedQuestion(null)
                            setQuestionDropIndicator(null)
                          }}
                          onKeyDown={(event) => {
                            if (!event.altKey) return
                            if (event.key === 'ArrowUp') {
                              event.preventDefault()
                              reorderQuestionWithKeyboard(part.id, q.page, q.id, 'up')
                            }
                            if (event.key === 'ArrowDown') {
                              event.preventDefault()
                              reorderQuestionWithKeyboard(part.id, q.page, q.id, 'down')
                            }
                          }}
                          className={`absolute -left-11 top-4 hidden h-10 w-8 cursor-grab select-none items-center justify-center rounded-xl border border-transparent bg-transparent text-lg font-semibold leading-none text-slate-400 shadow-none transition-colors hover:border-[var(--border)] hover:bg-white hover:text-slate-700 focus-visible:border-[var(--border-focus)] focus-visible:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] active:cursor-grabbing lg:inline-flex ${draggedQuestion?.qId === q.id ? 'opacity-70' : 'opacity-0 group-hover/setup-question:opacity-60 group-focus-within/setup-question:opacity-60'}`}
                        >
                          ⋮⋮
                        </button>
                        <div
                        onDragOver={(event) => {
                          if (draggedQuestion?.partId === part.id && draggedQuestion.page === q.page) {
                            event.preventDefault()
                            if (draggedQuestion.qId !== q.id) {
                              setQuestionDropIndicator({ qId: q.id, position: dropPositionFromEvent(event) })
                            }
                          }
                        }}
                        onDragLeave={() => {
                          if (questionDropIndicator?.qId === q.id) setQuestionDropIndicator(null)
                        }}
                        onDrop={(event) => {
                          event.preventDefault()
                          if (draggedQuestion?.partId === part.id && draggedQuestion.page === q.page) {
                            const position = questionDropIndicator?.qId === q.id ? questionDropIndicator.position : dropPositionFromEvent(event)
                            reorderQuestion(part.id, q.page, draggedQuestion.qId, q.id, position)
                          }
                          setDraggedQuestion(null)
                          setQuestionDropIndicator(null)
                        }}
                        className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-[background-color,border-color,box-shadow,opacity] duration-200 ${
                          draggedQuestion?.qId === q.id
                            ? 'border-[var(--accent-muted)] opacity-40'
                            : landedQuestionId === q.id
                              ? 'border-[var(--accent-muted)] bg-[var(--accent-subtle)] shadow-[inset_0_0_0_1px_var(--accent-muted)]'
                              : 'border-[var(--border)]'
                        }`}
                      >
                        <div
                          role="button"
                          tabIndex={0}
                          aria-expanded={!collapsed}
                          onClick={() => toggleQuestionCollapsed(q.id)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault()
                              toggleQuestionCollapsed(q.id)
                            }
                          }}
                          className="flex cursor-pointer flex-col gap-3 border-b border-[var(--border-subtle)] bg-[var(--bg-sunken)]/60 p-4 transition-colors hover:bg-[var(--bg-sunken)]"
                        >
                          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                            <div className="min-w-0 flex-1">
                              <div className="flex min-w-0 items-center gap-2">
                                <p className="shrink-0 text-sm font-semibold text-slate-800">
                                  {itemLabel}
                                </p>
                                {!isContentBlock && q.required === false && (
                                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
                                    Optional
                                  </span>
                                )}
                                {!isContentBlock && q.randomizeOptions === true && (
                                  <span className="rounded-full bg-[var(--accent-subtle)] px-2 py-0.5 text-xs font-semibold text-[var(--text-link)]">
                                    Randomized
                                  </span>
                                )}
                                {!isContentBlock && conditionSummary && (
                                  <span className="max-w-[12rem] truncate rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
                                    Condition
                                  </span>
                                )}
                                <svg viewBox="0 0 16 16" className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${collapsed ? '' : 'rotate-90'}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 4l4 4-4 4" /></svg>
                                {collapsed && (
                                  <p className="truncate text-sm text-slate-500">
                                    {questionPreview}
                                  </p>
                                )}
                              </div>
                              {!collapsed && (
                                <div
                                  className="mt-3 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm transition-colors focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500"
                                  onClick={(e) => e.stopPropagation()}
                                  onKeyDown={(e) => e.stopPropagation()}
                                >
                                  <RichTextEditor value={q.text}
                                    onChange={(val) => updateQuestion(part.id, q.id, { text: val })}
                                    placeholder={isContentBlock ? 'Write instructions or display text…' : 'Type your question here…'}
                                    compact
                                    className="!min-h-[1.75rem] max-h-[12rem] resize-y overflow-auto leading-6" />
                                </div>
                              )}
                            </div>

                          {!collapsed && <div className="flex flex-wrap items-center gap-2 self-end sm:justify-end">
                            <div className="w-48" onClick={(e) => e.stopPropagation()}>
                              <SelectMenu
                                value={q.type}
                                onChange={(value) => {
                                  const nextType = value as Question['type']
                                  const limits = nextType === 'MULTIPLE_CHOICE'
                                    ? choiceLimitDefaults(q)
                                    : nextType === 'RATING'
                                      ? { min: q.min ?? 1, max: q.max ?? 7 }
                                      : { min: undefined, max: undefined }
                                  updateQuestion(part.id, q.id, {
                                    type: nextType,
                                    randomizeOptions: nextType === 'SINGLE_CHOICE' || nextType === 'MULTIPLE_CHOICE' ? q.randomizeOptions : false,
                                    required: nextType === 'CONTENT' ? false : q.required,
                                    ...limits,
                                  })
                                }}
                                options={[...QUESTION_TYPES]}
                              />
                            </div>
                            {!isContentBlock && (
                              <button
                                type="button"
                                aria-expanded={settingsOpen}
                                aria-controls={`question-settings-${q.id}`}
                                title="Question settings"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  setOpenQuestionSettingsId((current) => current === q.id ? null : q.id)
                                }}
                                className={`interactive-press inline-flex h-10 w-10 items-center justify-center rounded-xl border text-sm font-semibold transition-colors ${
                                  settingsOpen
                                    ? 'border-[var(--accent-muted)] bg-[var(--accent-subtle)] text-[var(--text-link)]'
                                    : 'border-[var(--border-strong)] bg-white text-[var(--text-secondary)] hover:bg-[var(--bg-sunken)] hover:text-[var(--text)]'
                                }`}
                              >
                                <span className="sr-only">Question settings</span>
                                <MoreIcon />
                              </button>
                            )}
                            <IconButton type="button" label="Delete question" tone="trash" onClick={(e) => { e.stopPropagation(); removeQuestion(part.id, q.id) }}
                              className="h-10 w-10"><TrashIcon /></IconButton>
                          </div>}
                        </div>
                        </div>

                        {!collapsed && !isContentBlock && settingsOpen && (
                          <div
                            id={`question-settings-${q.id}`}
                            className="border-b border-[var(--border-subtle)] bg-[var(--bg-sunken)]/60 px-5 py-4"
                            onClick={(event) => event.stopPropagation()}
                            onKeyDown={(event) => event.stopPropagation()}
                          >
                            <div className="space-y-4">
                              <div className="space-y-3">
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Answer</p>
                                <div className="flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    aria-pressed={q.required !== false}
                                    onClick={() => updateQuestion(part.id, q.id, { required: q.required === false })}
                                    className="inline-flex h-10 w-fit items-center gap-3 rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                                  >
                                    <SwitchVisual checked={q.required !== false} />
                                    Required
                                  </button>

                                  {(q.type === 'SINGLE_CHOICE' || q.type === 'MULTIPLE_CHOICE') && (
                                    <button
                                      type="button"
                                      aria-pressed={q.randomizeOptions === true}
                                      onClick={() => updateQuestion(part.id, q.id, { randomizeOptions: q.randomizeOptions !== true })}
                                      className="inline-flex h-10 w-fit items-center gap-3 rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                                    >
                                      <SwitchVisual checked={q.randomizeOptions === true} />
                                      Randomize option order
                                    </button>
                                  )}
                                </div>

                                {q.type === 'MULTIPLE_CHOICE' && (
                                  <div className="max-w-md space-y-2">
                                    <p className="text-sm text-slate-600">Participants can choose</p>
                                    <div className="grid grid-cols-2 gap-2">
                                      <label>
                                        <span className="mb-1 block text-xs font-medium text-slate-500">At least</span>
                                        <input
                                          type="number"
                                          min={q.required === false ? 0 : 1}
                                          max={Math.max(regularOptions.length, 1)}
                                          value={choiceLimitDefaults(q).min}
                                          onChange={(e) => {
                                            const optionCount = Math.max(regularOptions.length, 1)
                                            const nextMin = Math.max(q.required === false ? 0 : 1, Math.min(Number(e.target.value), optionCount))
                                            updateQuestion(part.id, q.id, { min: nextMin, max: Math.max(nextMin, choiceLimitDefaults(q).max) })
                                          }}
                                          className={smallInputCls}
                                        />
                                      </label>
                                      <label>
                                        <span className="mb-1 block text-xs font-medium text-slate-500">At most</span>
                                        <input
                                          type="number"
                                          min={Math.max(choiceLimitDefaults(q).min, 1)}
                                          max={Math.max(regularOptions.length, 1)}
                                          value={choiceLimitDefaults(q).max}
                                          onChange={(e) => {
                                            const optionCount = Math.max(regularOptions.length, 1)
                                            const nextMax = Math.max(choiceLimitDefaults(q).min, Math.min(Number(e.target.value), optionCount))
                                            updateQuestion(part.id, q.id, { max: nextMax })
                                          }}
                                          className={smallInputCls}
                                        />
                                      </label>
                                    </div>
                                  </div>
                                )}
                              </div>

                              {canSetCondition && (
                                <div className="space-y-2">
                                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Condition</p>
                                  <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white/70 p-3">
                                    <span className="text-sm text-slate-500">Show only if</span>
                                    <div className="min-w-64 flex-1">
                                      <SelectMenu
                                        value={q.showIfQuestionId ?? ''}
                                        onChange={(value) => updateQuestion(part.id, q.id, {
                                          showIfQuestionId: value || null,
                                          showIfOperator: value ? (q.showIfOperator ?? 'is') : null,
                                          showIfValue: null,
                                        })}
                                        options={[
                                          { value: '', label: 'Choose question' },
                                          ...allBefore.map((previous, bi) => ({
                                            value: previous.id,
                                            label: `Q${bi + 1}: ${plainText(previous.text).slice(0, 40) || 'Untitled question'}`,
                                          })),
                                        ]}
                                      />
                                    </div>

                                    {triggerQ && (
                                      <>
                                        <div className="w-28">
                                          <SelectMenu
                                            value={q.showIfOperator ?? 'is'}
                                            onChange={(value) => updateQuestion(part.id, q.id, { showIfOperator: value === 'is_not' ? 'is_not' : 'is' })}
                                            options={[
                                              { value: 'is', label: 'is' },
                                              { value: 'is_not', label: 'is not' },
                                            ]}
                                          />
                                        </div>
                                        <div className="min-w-52 flex-1">
                                          <SelectMenu
                                            value={q.showIfValue ?? ''}
                                            onChange={(value) => updateQuestion(part.id, q.id, { showIfValue: value || null })}
                                            options={[
                                              { value: '', label: 'Pick answer' },
                                              ...(triggerQ.type === 'YES_NO' ? ['Yes', 'No'].map((value) => ({ value, label: value })) : []),
                                              ...(triggerQ.type === 'MULTIPLE_CHOICE' || triggerQ.type === 'SINGLE_CHOICE'
                                                ? triggerQ.options
                                                  .filter((option) => option !== '__OTHER__')
                                                  .map((option) => ({ value: option, label: plainText(option).slice(0, 50) || 'Untitled option' }))
                                                : []),
                                              ...(triggerQ.type === 'RATING'
                                                ? Array.from(
                                                  { length: (triggerQ.max ?? 7) - (triggerQ.min ?? 1) + 1 },
                                                  (_, ratingIndex) => String(ratingIndex + (triggerQ.min ?? 1))
                                                ).map((value) => ({ value, label: value }))
                                                : []),
                                            ]}
                                          />
                                        </div>
                                      </>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {!collapsed && <div className="space-y-4 p-5">
                          {isContentBlock && (
                            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                  <p className="text-sm font-medium text-slate-700">Optional image</p>
                                  <p className="mt-0.5 text-xs text-slate-500">Shown to participants with this text.</p>
                                </div>
                                <label className="inline-flex h-10 cursor-pointer items-center justify-center rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50">
                                  {contentImageUploading[q.id] ? 'Uploading…' : 'Upload image'}
                                  <input
                                    type="file"
                                    accept="image/*"
                                    className="sr-only"
                                    onChange={(e) => {
                                      const file = e.target.files?.[0]
                                      if (file) uploadContentImage(part.id, q.id, file)
                                      e.currentTarget.value = ''
                                    }}
                                  />
                                </label>
                              </div>
                              {q.options?.[0] && (
                                <div className="mt-3">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={q.options[0]} alt="" className="max-h-56 rounded-xl border border-slate-200 object-contain" />
                                  <Button type="button" tone="ghost" size="sm" className="mt-2 text-red-700 hover:bg-red-50"
                                    onClick={() => updateQuestion(part.id, q.id, { options: [] })}>
                                    Remove image
                                  </Button>
                                </div>
                              )}
                            </div>
                          )}

                          {!isContentBlock && q.type === 'RATING' && (
                            <div className="space-y-3">
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="flex flex-wrap gap-2">
                                  {SCALE_TYPES.map((t) => (
                                    <button key={t.value} type="button"
                                      onClick={() => {
                                        const steps = (q.max ?? 7) - (q.min ?? 1) + 1
                                        const opts = t.value === 'vas' ? ['', ''] : Array.from({ length: steps }, (_, i) => (q.options ?? [])[i] ?? '')
                                        updateQuestion(part.id, q.id, { scaleType: t.value, options: opts })
                                      }}
                                      className={`text-sm px-3 py-1.5 rounded-full border transition-colors ${scaleType === t.value ? 'bg-indigo-600 text-white border-indigo-600' : 'border-slate-200 text-slate-600 hover:border-indigo-300 bg-white'}`}>
                                      {t.label}
                                    </button>
                                  ))}
                                </div>
                                <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-2 py-1">
                                  <span className="pl-1 text-xs font-medium text-slate-500">Range</span>
                                  <label className="sr-only" htmlFor={`${q.id}-min`}>Minimum rating value</label>
                                  <input type="number" value={q.min ?? 1}
                                    id={`${q.id}-min`}
                                    onChange={(e) => updateQuestion(part.id, q.id, { min: Number(e.target.value) })}
                                    className="h-8 w-14 rounded-lg border border-slate-200 bg-[var(--bg-sunken)] px-2 text-center text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                                  <span className="text-xs text-slate-400">to</span>
                                  <label className="sr-only" htmlFor={`${q.id}-max`}>Maximum rating value</label>
                                  <input type="number" value={q.max ?? 7}
                                    id={`${q.id}-max`}
                                    onChange={(e) => updateQuestion(part.id, q.id, { max: Number(e.target.value) })}
                                    className="h-8 w-14 rounded-lg border border-slate-200 bg-[var(--bg-sunken)] px-2 text-center text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                                </div>
                              </div>
                              {(scaleType === 'numbers_labeled' || scaleType === 'labels_only') && (
                                <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min((q.max ?? 7) - (q.min ?? 1) + 1, 5)}, 1fr)` }}>
                                  {Array.from({ length: (q.max ?? 7) - (q.min ?? 1) + 1 }, (_, i) => (
                                    <div key={i} className="space-y-1">
                                      <p className="text-xs text-slate-400 text-center font-medium">{(q.min ?? 1) + i}</p>
                                      <input type="text" value={(q.options ?? [])[i] ?? ''}
                                        onChange={(e) => {
                                          const labels = [...(q.options ?? [])]
                                          labels[i] = e.target.value
                                          updateQuestion(part.id, q.id, { options: labels })
                                        }}
                                        placeholder="Label"
                                        className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-center bg-slate-50 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                                    </div>
                                  ))}
                                </div>
                              )}
                              {scaleType === 'vas' && (
                                <div className="grid grid-cols-2 gap-3">
                                  {['Left anchor', 'Right anchor'].map((label, i) => (
                                    <div key={i}>
                                      <p className="text-xs text-slate-400 mb-1">{label}</p>
                                      <input type="text" value={(q.options ?? [])[i] ?? ''}
                                        onChange={(e) => {
                                          const opts = [...(q.options ?? ['', ''])]
                                          opts[i] = e.target.value
                                          updateQuestion(part.id, q.id, { options: opts })
                                        }}
                                        placeholder={i === 0 ? 'e.g. Not at all' : 'e.g. Extremely'}
                                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          {!isContentBlock && (q.type === 'SINGLE_CHOICE' || q.type === 'MULTIPLE_CHOICE') && (
                            <div className="space-y-3">
                              {regularOptions.map((opt, oi) => (
                                <div
                                  key={oi}
                                  className="group/setup-option relative"
                                  onDragOver={(event) => {
                                    if (draggedOption?.partId === part.id && draggedOption.qId === q.id) {
                                      event.preventDefault()
                                      if (draggedOption.index !== oi) {
                                        setOptionDropIndicator({ qId: q.id, index: oi, position: dropPositionFromEvent(event) })
                                      }
                                    }
                                  }}
                                  onDragLeave={() => {
                                    if (optionDropIndicator?.qId === q.id && optionDropIndicator.index === oi) setOptionDropIndicator(null)
                                  }}
                                  onDrop={(event) => {
                                    event.preventDefault()
                                    if (draggedOption?.partId === part.id && draggedOption.qId === q.id) {
                                      const position = optionDropIndicator?.qId === q.id && optionDropIndicator.index === oi
                                        ? optionDropIndicator.position
                                        : dropPositionFromEvent(event)
                                      reorderOption(part.id, q.id, draggedOption.index, oi, position)
                                    }
                                    setDraggedOption(null)
                                    setOptionDropIndicator(null)
                                  }}
                                >
                                  {optionDropIndicator?.qId === q.id && optionDropIndicator.index === oi && (
                                    <div
                                      className={`pointer-events-none absolute left-0 right-0 z-20 ${optionDropIndicator.position === 'before' ? '-top-1' : '-bottom-1'}`}
                                      aria-hidden
                                    >
                                      <div className="h-0.5 rounded-full bg-[var(--accent)] shadow-[0_0_0_2px_var(--accent-subtle)]" />
                                    </div>
                                  )}
                                  <div
                                    className={`grid grid-cols-[28px_minmax(0,1fr)_36px] items-center gap-2 rounded-xl transition-[background-color,box-shadow,opacity] duration-200 ${
                                      draggedOption?.qId === q.id && draggedOption.index === oi
                                        ? 'opacity-40'
                                        : landedOption?.qId === q.id && landedOption.index === oi
                                          ? 'bg-[var(--accent-subtle)] shadow-[inset_0_0_0_1px_var(--accent-muted)]'
                                          : ''
                                    }`}
                                  >
                                  <button
                                    type="button"
                                    draggable={regularOptions.length > 1}
                                    title={regularOptions.length > 1 ? 'Drag option. Use Alt+Up or Alt+Down to reorder with the keyboard.' : 'Add another option to reorder'}
                                    aria-label={`Drag option ${oi + 1} to reorder`}
                                    aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
                                    onDragStart={(event) => {
                                      setDraggedOption({ partId: part.id, qId: q.id, index: oi })
                                      event.dataTransfer.effectAllowed = 'move'
                                    }}
                                    onDragEnd={() => {
                                      setDraggedOption(null)
                                      setOptionDropIndicator(null)
                                    }}
                                    onKeyDown={(event) => {
                                      if (!event.altKey) return
                                      if (event.key === 'ArrowUp') {
                                        event.preventDefault()
                                        reorderOptionWithKeyboard(part.id, q.id, oi, 'up')
                                      }
                                      if (event.key === 'ArrowDown') {
                                        event.preventDefault()
                                        reorderOptionWithKeyboard(part.id, q.id, oi, 'down')
                                      }
                                    }}
                                    className={`inline-flex h-9 w-7 cursor-grab select-none items-center justify-center rounded-lg text-sm font-semibold leading-none text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] active:cursor-grabbing disabled:cursor-default disabled:opacity-40 ${draggedOption?.qId === q.id && draggedOption.index === oi ? 'opacity-70' : 'opacity-50 group-hover/setup-option:opacity-80 group-focus-within/setup-option:opacity-80'}`}
                                    disabled={regularOptions.length <= 1}
                                  >
                                    ⋮⋮
                                  </button>
                                  <div className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm transition-colors focus-within:border-indigo-500 focus-within:bg-white focus-within:ring-2 focus-within:ring-indigo-500">
                                    <RichTextEditor value={opt}
                                      onChange={(val) => updateOption(part.id, q.id, oi, val)}
                                      placeholder={`Option ${oi + 1}`}
                                      singleLine
                                      compact
                                      className="!min-h-[1.5rem] leading-6" />
                                  </div>
                                  <IconButton type="button" label={`Delete option ${oi + 1}`} tone="trash" onClick={() => removeOption(part.id, q.id, oi)}
                                    className="h-8 w-8 rounded-lg"><TrashIcon /></IconButton>
                                  </div>
                                </div>
                              ))}
                              {hasOther && (
                                <div className="grid grid-cols-[28px_minmax(0,1fr)_36px] items-center gap-2">
                                  <div aria-hidden="true" />
                                  <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-500">
                                    Other (free text)
                                  </div>
                                  <IconButton type="button" label="Remove Other option" tone="trash" onClick={() => toggleOther(part.id, q.id, false)}
                                    className="h-8 w-8 rounded-lg"><TrashIcon /></IconButton>
                                </div>
                              )}
                              <div className="flex flex-wrap gap-2 pt-1 pl-9">
                                <Button type="button" onClick={() => addOption(part.id, q.id)}
                                  tone="secondary" size="sm">+ Add option</Button>
                                {!hasOther && (
                                  <Button type="button" onClick={() => toggleOther(part.id, q.id, true)}
                                    tone="secondary" size="sm">+ Add &quot;Other&quot;</Button>
                                )}
                              </div>
                            </div>
                          )}

                        </div>}
                      </div>
                      </div>
                    )
                  })}

                  <div className="flex justify-start">
                    <Button type="button" onClick={() => addQuestion(part.id, page)}
                      tone="secondary"
                      size="sm"
                      className="border-dashed">
                      + Add question{pageCount > 1 ? ` to page ${page}` : ''}
                    </Button>
                  </div>
                </div>
              )
            })}

            <div className="rounded-2xl border border-dashed border-indigo-200 bg-indigo-50/50 p-3">
              <Button type="button" onClick={() => addPage(part.id)} tone="secondary" className="w-full border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-50">
                + Add new page
              </Button>
            </div>
          </div>
          </>
        )}
      </div>

      <input ref={partsInputRef} type="hidden" name="parts" defaultValue={JSON.stringify(parts)} />

      {(state?.error || localError) && (
        <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">{(state?.error as string) || localError}</p>
      )}

      <div className={saveBarShouldStick
        ? 'sticky bottom-0 z-20 -mx-4 border-t border-[var(--border)] bg-white/95 px-4 py-3 shadow-[0_-8px_20px_rgba(15,23,42,0.06)] backdrop-blur sm:-mx-6 sm:px-6'
        : 'rounded-2xl border border-[var(--border)] bg-white px-5 py-4 shadow-sm'
      }>
        <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-900">
              {saveStatusTitle}
            </p>
            <p className="text-sm text-slate-500">
              {saveStatusCopy}
            </p>
          </div>
          <Button type="submit" disabled={pending || (isEditForm && !isDirty)} size="lg" className="w-full sm:w-auto sm:min-w-40">
            {pending ? 'Saving…' : isEditForm && !isDirty ? 'Saved' : submitLabel}
          </Button>
        </div>
      </div>

      {partToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-slate-950">Remove this part?</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  This removes <span className="font-semibold text-slate-900">{partToDelete.name}</span> and its questions from the setup. The change is only applied after you save the study.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPartToDelete(null)}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close remove part dialog"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-900">
              If this study already has responses, keep in mind that changing the structure can affect how older data is interpreted.
            </div>

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" tone="secondary" onClick={() => setPartToDelete(null)}>
                Cancel
              </Button>
              <Button type="button" tone="danger" onClick={confirmDeletePart}>
                Remove part
              </Button>
            </div>
          </div>
        </div>
      )}
    </form>
  )
}
