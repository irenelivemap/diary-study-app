'use client'
import { useActionState, useEffect, useRef, useState } from 'react'
import { submitEntry } from '@/app/actions/entries'
import type { Question } from '@prisma/client'
import RatingInput from './RatingInput'
import { Button } from '@/app/components/ui'
import { sanitizeHtml } from '@/app/lib/sanitize-html'
import DateTimeNowInput from './DateTimeNowInput'

const OTHER_SENTINEL = '__OTHER__'

function detectedTimezone() {
  if (typeof Intl === 'undefined') return ''
  return Intl.DateTimeFormat().resolvedOptions().timeZone || ''
}

type Study = {
  id: string
  partId: string
  journeyId?: string
  name: string
  questions: Question[]
}

export default function EntryForm({ study, today }: { study: Study; today: string }) {
  const [state, action, pending] = useActionState(submitEntry, null)
  const [uploading, setUploading] = useState<Record<string, boolean>>({})
  const [uploadedUrls, setUploadedUrls] = useState<Record<string, string>>({})
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({})
  const [selectedChoices, setSelectedChoices] = useState<Record<string, string[]>>({})
  const [otherText, setOtherText] = useState<Record<string, string>>({})
  const [currentPage, setCurrentPage] = useState(1)
  // Track all answers for conditional logic
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [localError, setLocalError] = useState('')
  const [timezone] = useState(detectedTimezone)
  const formRef = useRef<HTMLFormElement>(null)
  const draftKey = `diari-draft-${study.journeyId ?? study.partId}-${today}`

  function setAnswer(qId: string, value: string) {
    setAnswers((a) => ({ ...a, [qId]: value }))
  }

  function isVisible(q: Question) {
    if (!q.showIfQuestionId || !q.showIfValue) return true
    const sourceAnswer = answers[q.showIfQuestionId]
    if (!sourceAnswer) return false
    try {
      const parsed = JSON.parse(sourceAnswer)
      if (Array.isArray(parsed)) return parsed.includes(q.showIfValue)
    } catch {}
    return sourceAnswer === q.showIfValue
  }

  function selectedValues(qId: string) {
    return selectedChoices[qId] ?? []
  }

  function setMultipleChoice(q: Question, value: string, checked: boolean) {
    const max = q.max ?? q.options.filter((option) => option !== OTHER_SENTINEL).length
    setSelectedChoices((current) => {
      const existing = current[q.id] ?? []
      const withoutValue = existing.filter((item) => item !== value && !(value.startsWith('Other:') && item.startsWith('Other:')))
      const next = checked ? [...withoutValue, value].slice(0, Math.max(max, 1)) : withoutValue
      setAnswer(q.id, JSON.stringify(next))
      return { ...current, [q.id]: next }
    })
  }

  function validateCurrentPage() {
    const form = formRef.current
    if (!form) return false
    const inputs = Array.from(form.elements) as HTMLElement[]
    const invalid = inputs.find((el) => {
      const input = el as HTMLInputElement
      return input.required && !input.validity?.valid && input.dataset.page === String(currentPage)
    })
    if (invalid) {
      ;(invalid as HTMLInputElement).reportValidity()
      return false
    }

    for (const q of pageQuestions) {
      if (!isVisible(q) || q.type !== 'MULTIPLE_CHOICE') continue
      const values = selectedValues(q.id)
      const min = q.min ?? (q.required ? 1 : 0)
      const max = q.max ?? q.options.filter((option) => option !== OTHER_SENTINEL).length
      if (q.required && values.length < min) {
        setLocalError(`Please select at least ${min} option${min === 1 ? '' : 's'}.`)
        return false
      }
      if (values.length > max) {
        setLocalError(`Please select no more than ${max} option${max === 1 ? '' : 's'}.`)
        return false
      }
    }
    setLocalError('')
    return true
  }

  const pageCount = Math.max(...study.questions.map((q) => q.page ?? 1), 1)
  const pageQuestions = study.questions.filter((q) => (q.page ?? 1) === currentPage)
  const visibleQuestionIds = study.questions.filter((q) => q.type !== 'CONTENT' && isVisible(q)).map((q) => q.id)

  useEffect(() => {
    const raw = localStorage.getItem(draftKey)
    if (!raw) return
    try {
        const saved = JSON.parse(raw) as Record<string, string | string[]>
        const nextAnswers: Record<string, string> = {}
        const nextChoices: Record<string, string[]> = {}
        requestAnimationFrame(() => {
          const form = formRef.current
          if (!form) return
          for (const [name, value] of Object.entries(saved)) {
            const values = Array.isArray(value) ? value : [value]
            const fields = Array.from(form.elements).filter((el) => (el as HTMLInputElement).name === name) as HTMLInputElement[]
            for (const field of fields) {
              if (field.type === 'radio') field.checked = values.includes(field.value)
              else if (field.type === 'checkbox') field.checked = values.includes(field.value)
              else if (field.type !== 'file') field.value = String(values[0] ?? '')
            }
            if (name.startsWith('question_')) {
              const qId = name.replace('question_', '')
              nextAnswers[qId] = Array.isArray(value) ? JSON.stringify(value) : String(value)
              if (Array.isArray(value)) nextChoices[qId] = value
            }
        }
        setSelectedChoices(nextChoices)
        setAnswers((a) => ({ ...nextAnswers, ...a }))
      })
    } catch {
      localStorage.removeItem(draftKey)
    }
  }, [draftKey])

  function saveDraft() {
    const form = formRef.current
    if (!form) return
    const data: Record<string, string | string[]> = {}
    for (const el of Array.from(form.elements) as HTMLInputElement[]) {
      if (!el.name || el.type === 'file' || el.name === 'visibleQuestionIds') continue
      if (el.type === 'radio' && !el.checked) continue
      if (el.type === 'checkbox' && !el.checked) continue
      if (data[el.name]) {
        data[el.name] = [...(Array.isArray(data[el.name]) ? data[el.name] as string[] : [data[el.name] as string]), el.value]
      } else {
        data[el.name] = el.value
      }
    }
    localStorage.setItem(draftKey, JSON.stringify(data))
  }

  async function handleFileChange(questionId: string, file: File) {
    setUploading((u) => ({ ...u, [questionId]: true }))
    setLocalError('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('studyId', study.id)
      fd.append('partId', study.partId)
      fd.append('questionId', questionId)
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok || !data.url) throw new Error(data.error || 'Upload failed.')
      setUploadedUrls((u) => ({ ...u, [questionId]: data.url }))
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'Upload failed.')
    } finally {
      setUploading((u) => ({ ...u, [questionId]: false }))
    }
  }

  function handleNext(e: React.FormEvent) {
    e.preventDefault()
    if (!validateCurrentPage()) return
    setCurrentPage((p) => p + 1)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <form
      ref={formRef}
      action={action}
      onInput={saveDraft}
      onChange={saveDraft}
      onSubmit={(event) => {
        if (!validateCurrentPage()) event.preventDefault()
        else localStorage.removeItem(draftKey)
      }}
      className="space-y-6"
    >
      <input type="hidden" name="studyId" value={study.id} />
      <input type="hidden" name="partId" value={study.partId} />
      {study.journeyId && <input type="hidden" name="journeyId" value={study.journeyId} />}
      <input type="hidden" name="date" value={today} />
      <input type="hidden" name="timezone" value={timezone} />
      <input type="hidden" name="visibleQuestionIds" value={JSON.stringify(visibleQuestionIds)} />

      {/* hidden fields for all pages so they're submitted together */}
      {Object.entries(uploadedUrls).map(([qId, url]) => (
        <input key={qId} type="hidden" name={`question_${qId}`} value={url} />
      ))}
      {study.questions
        .filter((q) => (q.page ?? 1) !== currentPage && visibleQuestionIds.includes(q.id) && q.type !== 'SCREENSHOT' && q.type !== 'CONTENT' && answers[q.id] != null)
        .flatMap((q) => {
          if (q.type !== 'MULTIPLE_CHOICE') {
            return [<input key={q.id} type="hidden" name={`question_${q.id}`} value={answers[q.id]} />]
          }
          let values: string[] = []
          try {
            const parsed = JSON.parse(answers[q.id])
            values = Array.isArray(parsed) ? parsed.map(String) : []
          } catch {}
          return values.map((value, index) => (
            <input key={`${q.id}-${index}`} type="hidden" name={`question_${q.id}`} value={value} />
          ))
        })}

      {/* Page indicator */}
      {pageCount > 1 && (
        <div className="flex items-center gap-2">
          {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => (
            <div
              key={p}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                p <= currentPage ? 'bg-indigo-600' : 'bg-slate-200'
              }`}
            />
          ))}
          <span className="text-xs text-slate-400 ml-1 whitespace-nowrap">
            {currentPage} / {pageCount}
          </span>
        </div>
      )}

      {/* Questions for current page */}
      {pageQuestions.map((q) => {
        if (!isVisible(q)) return null

        const regularOptions = q.options.filter((o) => o !== OTHER_SENTINEL)
        const hasOther = q.options.includes(OTHER_SENTINEL)
        const selectedOther = selectedOptions[q.id] === OTHER_SENTINEL

        if (q.type === 'CONTENT') {
          return (
            <div key={q.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              {q.text && (
                <div
                  className="prose prose-sm max-w-none text-slate-700"
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(q.text) }}
                />
              )}
              {q.options?.[0] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={q.options[0]} alt="" className="mt-4 max-h-80 rounded-xl border border-slate-200 object-contain" />
              )}
            </div>
          )
        }

        return (
          <div key={q.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 sm:p-6">
            <div
              className="mb-4 text-base font-semibold leading-relaxed text-slate-900 sm:text-lg"
              dangerouslySetInnerHTML={{
                __html: sanitizeHtml(q.text) + (q.required ? '<span class="text-red-500 ml-1">*</span>' : ''),
              }}
            />

            {q.type === 'FREE_TEXT' && (
              <textarea
                name={`question_${q.id}`}
                required={q.required}
                data-page={q.page ?? 1}
                rows={4}
                onChange={(e) => setAnswer(q.id, e.target.value)}
                className="w-full resize-y rounded-xl border border-slate-300 px-4 py-3 text-base leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            )}

            {q.type === 'RATING' && (
              <RatingInput
                name={`question_${q.id}`}
                min={q.min ?? 1}
                max={q.max ?? 7}
                scaleType={q.scaleType ?? 'numbers'}
                labels={q.options}
                required={q.required}
                dataPage={q.page ?? 1}
                onChange={(val) => setAnswer(q.id, val)}
              />
            )}

            {q.type === 'MULTIPLE_CHOICE' && (
              <div className="space-y-2">
                <p className="text-sm text-slate-600">
                  Select {q.min ?? (q.required ? 1 : 0)}-{q.max ?? regularOptions.length} option{(q.max ?? regularOptions.length) === 1 ? '' : 's'}.
                </p>
                {regularOptions.map((opt) => (
                  <label key={opt} className="group -mx-1 flex cursor-pointer items-center gap-3 rounded-xl px-1 py-3 active:bg-slate-50">
                    <input
                      type="checkbox"
                      name={`question_${q.id}`}
                      value={opt}
                      data-page={q.page ?? 1}
                      checked={selectedValues(q.id).includes(opt)}
                      onChange={(e) => setMultipleChoice(q, opt, e.target.checked)}
                      className="w-5 h-5 text-indigo-600 shrink-0"
                    />
                    <span className="text-base text-slate-800 group-hover:text-slate-900"
                      dangerouslySetInnerHTML={{ __html: sanitizeHtml(opt) }} />
                  </label>
                ))}
                {hasOther && (
                  <div className="space-y-2">
                    <label className="group -mx-1 flex cursor-pointer items-center gap-3 rounded-xl px-1 py-3 active:bg-slate-50">
                      <input
                        type="checkbox"
                        name={`question_${q.id}`}
                        value={`Other: ${otherText[q.id] ?? ''}`}
                        checked={selectedOther}
                        data-page={q.page ?? 1}
                        onChange={(e) => {
                          setSelectedOptions((s) => ({ ...s, [q.id]: e.target.checked ? OTHER_SENTINEL : '' }))
                          setMultipleChoice(q, `Other: ${otherText[q.id] ?? ''}`, e.target.checked)
                        }}
                        className="w-5 h-5 text-indigo-600 shrink-0"
                      />
                      <span className="text-base text-slate-800">Other</span>
                    </label>
                    {selectedOther && (
                      <>
                        <input
                          type="text"
                          placeholder="Please specify…"
                          value={otherText[q.id] ?? ''}
                          onChange={(e) => {
                            setOtherText((t) => ({ ...t, [q.id]: e.target.value }))
                            setMultipleChoice(q, `Other: ${e.target.value}`, true)
                          }}
                          required
                          className="ml-7 w-[calc(100%-1.75rem)] rounded-xl border border-slate-300 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {q.type === 'SINGLE_CHOICE' && (
              <div className="space-y-2">
                {regularOptions.map((opt) => (
                  <label key={opt} className="group -mx-1 flex cursor-pointer items-center gap-3 rounded-xl px-1 py-3 active:bg-slate-50">
                    <input
                      type="radio"
                      name={`question_${q.id}`}
                      value={opt}
                      required={q.required && !selectedOther}
                      data-page={q.page ?? 1}
                      onChange={() => { setSelectedOptions((s) => ({ ...s, [q.id]: opt })); setAnswer(q.id, opt) }}
                      className="w-5 h-5 text-indigo-600 shrink-0"
                    />
                    <span className="text-base text-slate-800 group-hover:text-slate-900"
                      dangerouslySetInnerHTML={{ __html: sanitizeHtml(opt) }} />
                  </label>
                ))}
                {hasOther && (
                  <div className="space-y-2">
                    <label className="group -mx-1 flex cursor-pointer items-center gap-3 rounded-xl px-1 py-3 active:bg-slate-50">
                      <input
                        type="radio"
                        name={`question_${q.id}`}
                        value={`Other: ${otherText[q.id] ?? ''}`}
                        required={q.required && !selectedOptions[q.id]}
                        checked={selectedOther}
                        data-page={q.page ?? 1}
                        onChange={() => { setSelectedOptions((s) => ({ ...s, [q.id]: OTHER_SENTINEL })); setAnswer(q.id, `Other: ${otherText[q.id] ?? ''}`) }}
                        className="w-5 h-5 text-indigo-600 shrink-0"
                      />
                      <span className="text-base text-slate-800">Other</span>
                    </label>
                    {selectedOther && (
                      <>
                        <input
                          type="text"
                          placeholder="Please specify…"
                          value={otherText[q.id] ?? ''}
                          onChange={(e) => {
                            setOtherText((t) => ({ ...t, [q.id]: e.target.value }))
                            setAnswer(q.id, `Other: ${e.target.value}`)
                          }}
                          required
                          className="ml-7 w-[calc(100%-1.75rem)] rounded-xl border border-slate-300 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                        <input type="hidden" name={`question_${q.id}`} value={`Other: ${otherText[q.id] ?? ''}`} />
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {q.type === 'YES_NO' && (
              <div className="grid grid-cols-2 gap-3">
                {['Yes', 'No'].map((opt) => (
                  <label key={opt} className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3">
                    <input
                      type="radio"
                      name={`question_${q.id}`}
                      value={opt}
                      required={q.required}
                      data-page={q.page ?? 1}
                      onChange={() => setAnswer(q.id, opt)}
                      className="w-5 h-5 text-indigo-600 shrink-0"
                    />
                    <span className="text-base font-medium text-slate-800">{opt}</span>
                  </label>
                ))}
              </div>
            )}

            {q.type === 'DATE_TIME' && (
              <DateTimeNowInput
                name={`question_${q.id}`}
                required={q.required}
                dataPage={q.page ?? 1}
                onValueChange={(value) => setAnswer(q.id, value)}
              />
            )}

            {q.type === 'SCREENSHOT' && (
              <div>
                <input
                  type="file"
                  accept="image/*"
                  required={q.required && !uploadedUrls[q.id]}
                  data-page={q.page ?? 1}
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleFileChange(q.id, file)
                  }}
                  className="w-full text-base text-slate-700 file:mr-3 file:rounded-xl file:border-0 file:bg-indigo-50 file:px-4 file:py-3 file:text-sm file:font-semibold file:text-indigo-700 hover:file:bg-indigo-100"
                />
                {uploading[q.id] && <p className="text-xs text-slate-400 mt-1">Uploading…</p>}
                {uploadedUrls[q.id] && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={uploadedUrls[q.id]} alt="Uploaded screenshot"
                    className="mt-2 rounded-lg max-h-48 object-contain border border-slate-200" />
                )}
              </div>
            )}
          </div>
        )
      })}

      {(state?.error || localError) && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{(state?.error as string) || localError}</p>
      )}

      <div className="flex gap-3">
        {currentPage > 1 && (
          <Button
            type="button"
            onClick={() => { setCurrentPage((p) => p - 1); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
            tone="secondary"
            size="lg"
            className="flex-1"
          >
            Back
          </Button>
        )}

        {currentPage < pageCount ? (
          <Button
            type="button"
            onClick={handleNext}
            size="lg"
            className="flex-1"
          >
            Next
          </Button>
        ) : (
          <Button
            type="submit"
            disabled={pending || Object.values(uploading).some(Boolean)}
            size="lg"
            className="flex-1"
          >
            {pending ? 'Submitting…' : 'Submit entry'}
          </Button>
        )}
      </div>
    </form>
  )
}
