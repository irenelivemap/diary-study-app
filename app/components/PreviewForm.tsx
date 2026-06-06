'use client'
import { useRef, useState } from 'react'
import type { Question } from '@prisma/client'
import RatingInput from './RatingInput'
import { Button, TextInput } from '@/app/components/ui'
import { sanitizeHtml } from '@/app/lib/sanitize-html'

const OTHER_SENTINEL = '__OTHER__'

type Study = {
  id: string
  name: string
  questions: Question[]
}

export default function PreviewForm({ study }: { study: Study }) {
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({})
  const [selectedChoices, setSelectedChoices] = useState<Record<string, string[]>>({})
  const [otherText, setOtherText] = useState<Record<string, string>>({})
  const [currentPage, setCurrentPage] = useState(1)
  const [submitted, setSubmitted] = useState(false)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [localError, setLocalError] = useState('')
  const formRef = useRef<HTMLFormElement>(null)

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

  const pageCount = Math.max(...study.questions.map((q) => q.page ?? 1), 1)
  const pageQuestions = study.questions.filter((q) => (q.page ?? 1) === currentPage)

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
    const fields = Array.from(form.elements) as HTMLInputElement[]
    const invalid = fields.find((field) => (
      field.dataset.page === String(currentPage) &&
      field.required &&
      !field.validity.valid
    ))

    if (invalid) {
      invalid.reportValidity()
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

  function handleNext() {
    if (!validateCurrentPage()) return

    setCurrentPage((p) => p + 1)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (submitted) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
        <p className="text-emerald-600 font-medium text-lg mb-1">Entry submitted</p>
        <p className="text-slate-500 text-sm mb-4">This is what participants see after submitting.</p>
        <Button
          type="button"
          onClick={() => { setSubmitted(false); setSelectedOptions({}); setSelectedChoices({}); setOtherText({}); setCurrentPage(1) }}
          tone="secondary"
        >
          Reset preview
        </Button>
      </div>
    )
  }

  return (
    <form ref={formRef} onSubmit={(e) => { e.preventDefault(); if (validateCurrentPage()) setSubmitted(true) }} className="space-y-6">

      {pageCount > 1 && (
        <div className="flex items-center gap-2">
          {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => (
            <div key={p} className={`h-1.5 flex-1 rounded-full transition-colors ${p <= currentPage ? 'bg-indigo-600' : 'bg-slate-200'}`} />
          ))}
          <span className="text-xs text-slate-400 ml-1 whitespace-nowrap">{currentPage} / {pageCount}</span>
        </div>
      )}

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
          <div key={q.id} className="bg-white rounded-2xl border border-slate-200 p-5">
            <div
              className="font-medium text-slate-800 mb-3"
              dangerouslySetInnerHTML={{
                __html: sanitizeHtml(q.text) + (q.required ? '<span class="text-red-500 ml-1">*</span>' : ''),
              }}
            />

            {q.type === 'FREE_TEXT' && (
              <textarea required={q.required} data-page={q.page ?? 1} rows={4}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y" />
            )}

            {q.type === 'RATING' && (
              <RatingInput
                name={`q_${q.id}`}
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
                  <label key={opt} className="flex items-center gap-3 cursor-pointer group py-2 -mx-1 px-1 rounded-lg active:bg-slate-50">
                    <input type="checkbox" name={`q_${q.id}`} value={opt}
                      data-page={q.page ?? 1}
                      checked={selectedValues(q.id).includes(opt)}
                      onChange={(e) => setMultipleChoice(q, opt, e.target.checked)}
                      className="w-5 h-5 text-indigo-600 shrink-0" />
                    <span className="text-sm text-slate-700" dangerouslySetInnerHTML={{ __html: sanitizeHtml(opt) }} />
                  </label>
                ))}
                {hasOther && (
                  <div className="space-y-2">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input type="checkbox" name={`q_${q.id}`} checked={selectedOther}
                        value={`Other: ${otherText[q.id] ?? ''}`}
                        onChange={(e) => {
                          setSelectedOptions((s) => ({ ...s, [q.id]: e.target.checked ? OTHER_SENTINEL : '' }))
                          setMultipleChoice(q, `Other: ${otherText[q.id] ?? ''}`, e.target.checked)
                        }}
                        data-page={q.page ?? 1}
                        className="w-5 h-5 text-indigo-600 shrink-0" />
                      <span className="text-sm text-slate-700">Other</span>
                    </label>
                    {selectedOther && (
                      <TextInput placeholder="Please specify…"
                        value={otherText[q.id] ?? ''}
                        onChange={(e) => {
                          setOtherText((t) => ({ ...t, [q.id]: e.target.value }))
                          setMultipleChoice(q, `Other: ${e.target.value}`, true)
                        }}
                        data-page={q.page ?? 1}
                        required
                        className="ml-7" />
                    )}
                  </div>
                )}
              </div>
            )}

            {q.type === 'SINGLE_CHOICE' && (
              <div className="space-y-2">
                {regularOptions.map((opt) => (
                  <label key={opt} className="flex items-center gap-3 cursor-pointer group py-2 -mx-1 px-1 rounded-lg active:bg-slate-50">
                    <input type="radio" name={`q_${q.id}`} value={opt}
                      required={q.required && !selectedOther}
                      data-page={q.page ?? 1}
                      onChange={() => { setSelectedOptions((s) => ({ ...s, [q.id]: opt })); setAnswer(q.id, opt) }}
                      className="w-5 h-5 text-indigo-600 shrink-0" />
                    <span className="text-sm text-slate-700" dangerouslySetInnerHTML={{ __html: sanitizeHtml(opt) }} />
                  </label>
                ))}
                {hasOther && (
                  <div className="space-y-2">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input type="radio" name={`q_${q.id}`} checked={selectedOther}
                        onChange={() => setSelectedOptions((s) => ({ ...s, [q.id]: OTHER_SENTINEL }))}
                        data-page={q.page ?? 1}
                        className="w-5 h-5 text-indigo-600 shrink-0" />
                      <span className="text-sm text-slate-700">Other</span>
                    </label>
                    {selectedOther && (
                      <TextInput placeholder="Please specify…"
                        value={otherText[q.id] ?? ''}
                        onChange={(e) => {
                          setOtherText((t) => ({ ...t, [q.id]: e.target.value }))
                          setAnswer(q.id, `Other: ${e.target.value}`)
                        }}
                        data-page={q.page ?? 1}
                        required
                        className="ml-7" />
                    )}
                  </div>
                )}
              </div>
            )}

            {q.type === 'YES_NO' && (
              <div className="flex gap-3">
                {['Yes', 'No'].map((opt) => (
                  <label key={opt} className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name={`q_${q.id}`} value={opt} required={q.required} data-page={q.page ?? 1} onChange={() => setAnswer(q.id, opt)} className="w-5 h-5 text-indigo-600 shrink-0" />
                    <span className="text-sm font-medium text-slate-700">{opt}</span>
                  </label>
                ))}
              </div>
            )}

            {q.type === 'DATE_TIME' && (
              <input
                type="datetime-local"
                required={q.required}
                data-page={q.page ?? 1}
                onChange={(e) => setAnswer(q.id, e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            )}

            {q.type === 'SCREENSHOT' && (
              <input type="file" accept="image/*" required={q.required} data-page={q.page ?? 1}
                className="w-full text-sm text-slate-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100" />
            )}
          </div>
        )
      })}

      {localError && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{localError}</p>
      )}

      <div className="flex gap-3">
        {currentPage > 1 && (
          <Button type="button"
            onClick={() => { setCurrentPage((p) => p - 1); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
            tone="secondary"
            size="lg"
            className="flex-1">
            Back
          </Button>
        )}
        {currentPage < pageCount ? (
          <Button type="button"
            onClick={handleNext}
            size="lg"
            className="flex-1">
            Next
          </Button>
        ) : (
          <Button type="submit" size="lg" className="flex-1">
            Submit entry
          </Button>
        )}
      </div>
    </form>
  )
}
