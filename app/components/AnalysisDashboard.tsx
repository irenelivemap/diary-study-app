'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Badge, Card, SwitchVisual, TextInput } from '@/app/components/ui'
import SelectMenu from '@/app/components/SelectMenu'
import { createQuestionTag, deleteQuestionTag, updateAnswerTags, updateQuestionTag } from '@/app/actions/analysis'
import { phaseSoftBadgeClass } from '@/app/lib/phase-colors'
import { entryQualityLabel } from '@/app/lib/entry-state'
import { answerValue as normalizedAnswerValue, answerWasShown, parseMultipleChoiceAnswer } from '@/app/lib/answer-dataset'

type Question = {
  id: string
  partId: string
  partName: string
  text: string
  type: string
  scaleType: string
  options: string[]
  min: number | null
  max: number | null
  tagDefinitions: TagDefinition[]
}
type Part = { id: string; name: string; flow?: string }
type Participant = { id: string; name: string; email: string }
type TagDefinition = { id: string; label: string; color: string }
type AnswerCell = { id: string; value: string; wasShown: boolean; tags: TagDefinition[] }
type Row = {
  entryId: string
  partId: string
  partName: string
  participantId: string
  participantName: string
  participantEmail: string
  journeyId?: string | null
  journeyLabel?: string | null
  journeyCompletedAt?: string | null
  journeyCreatedAt?: string | null
  date: string
  submittedAt: string
  timezone: string | null
  isPilot?: boolean
  qualityFlags: string[]
  answers: Record<string, AnswerCell>
}

type Props = {
  studyId: string
  studyName: string
  parts: Part[]
  participants: Participant[]
  questions: Question[]
  rows: Row[]
}

type DataPoint = { label: string; value: number }
type ScalePoint = { score: number; label: string; count: number }
type ScaleBin = { label: string; start: number; end: number; count: number }
type AnalysisResult = ReturnType<typeof buildAnalysis>

function ExportMenu({
  onPng,
  onSvg,
  onCsv,
}: {
  onPng?: () => void
  onSvg?: () => void
  onCsv?: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const items = [
    onPng ? { label: 'PNG image', action: onPng } : null,
    onSvg ? { label: 'SVG vector', action: onSvg } : null,
    onCsv ? { label: 'CSV data', action: onCsv } : null,
  ].filter(Boolean) as { label: string; action: () => void }[]

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [])

  function run(action: () => void) {
    action()
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="Export plot"
        title="Export plot"
        onClick={() => setOpen((current) => !current)}
        className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border text-slate-700 transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
          open ? 'border-indigo-500 bg-white' : 'border-slate-300 bg-white'
        }`}
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 3v12" />
          <path d="m7 10 5 5 5-5" />
          <path d="M5 21h14" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-40 mt-1 w-44 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
          {items.map(({ label, action }) => (
            <button
              key={label}
              type="button"
              onClick={() => run(action)}
              className="flex min-h-10 w-full items-center rounded-lg px-3 py-2 text-left text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/<[^>]*>/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 70) || 'plot'
}

function questionTypeLabel(type: string, scaleType?: string) {
  if (type === 'RATING' && scaleType === 'vas') return 'VAS scale'
  const labels: Record<string, string> = {
    FREE_TEXT: 'Free text',
    RATING: 'Rating scale',
    SINGLE_CHOICE: 'Single choice',
    MULTIPLE_CHOICE: 'Multiple choice',
    YES_NO: 'Yes / No',
    SCREENSHOT: 'Upload',
    DATE_TIME: 'Date / time',
  }
  return labels[type] ?? type
}

function topCounts(values: string[]) {
  const counts = new Map<string, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  return Array.from(counts.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
}

function multipleChoiceStats(question: Question, points: DataPoint[], respondentDenominator: number) {
  const sorted = [...points].sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
  const top = sorted[0] ?? null
  const runnerUp = sorted[1] ?? null
  const topPct = respondentDenominator && top ? Math.round((top.value / respondentDenominator) * 100) : 0
  const runnerUpPct = respondentDenominator && runnerUp ? Math.round((runnerUp.value / respondentDenominator) * 100) : 0
  const tiedTopCount = top?.value ? sorted.filter((point) => point.value === top.value).length : 0
  const optionCount = Math.max(
    points.length,
    question.options.filter((option) => option.trim() && option !== '__OTHER__').length
  )

  return {
    topLabel: top?.label ?? '-',
    topPct,
    hasTie: tiedTopCount > 1,
    tiedTopCount,
    gapPct: Math.max(0, topPct - runnerUpPct),
    usedOptions: points.filter((point) => point.value > 0).length,
    optionCount,
  }
}

function singleChoiceStats(points: DataPoint[]) {
  const total = points.reduce((sum, point) => sum + point.value, 0)
  const sorted = [...points]
    .filter((point) => point.value > 0)
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
  const top = sorted[0] ?? null
  const runnerUp = sorted[1] ?? null
  const topPct = total && top ? Math.round((top.value / total) * 100) : 0
  const runnerUpPct = total && runnerUp ? Math.round((runnerUp.value / total) * 100) : 0
  const tiedTopCount = top?.value ? sorted.filter((point) => point.value === top.value).length : 0

  return {
    topLabel: top?.label ?? '-',
    topPct,
    hasTie: tiedTopCount > 1,
    tiedTopCount,
    gapPct: Math.max(0, topPct - runnerUpPct),
    hasRunnerUp: !!runnerUp,
  }
}

function average(values: number[]) {
  if (!values.length) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function median(values: number[]) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function observedQuantile(values: number[], q: number) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.round((sorted.length - 1) * q)]
}

function formatNumber(value: number | null | undefined, digits = 1) {
  if (value == null || !Number.isFinite(value)) return '-'
  return Number.isInteger(value) ? String(value) : value.toFixed(digits)
}

function mostCommon(points: ScalePoint[]) {
  const max = Math.max(...points.map((point) => point.count), 0)
  if (!max) return '-'
  return points.filter((point) => point.count === max).map((point) => String(point.score)).join(', ')
}

function buildScaleBins(values: number[], min: number, max: number, targetBins = 8): ScaleBin[] {
  const range = max - min
  if (range <= 0) return [{ label: String(min), start: min, end: max, count: values.length }]
  const binCount = Math.min(targetBins, Math.max(1, Math.ceil(range + 1)))
  const width = (range + 1) / binCount
  return Array.from({ length: binCount }, (_, index) => {
    const start = min + index * width
    const end = index === binCount - 1 ? max : min + (index + 1) * width
    const count = values.filter((value) => value >= start && (index === binCount - 1 ? value <= end : value < end)).length
    const label = width <= 1
      ? String(Math.round(start))
      : `${formatNumber(start, 0)}-${formatNumber(end, 0)}`
    return { label, start, end, count }
  })
}

function scaleBand(score: number, min: number, max: number) {
  const range = max - min + 1
  const lowEnd = min + Math.floor(range / 3) - 1
  const highStart = max - Math.floor(range / 3) + 1
  if (score <= lowEnd) return 'low'
  if (score >= highStart) return 'high'
  return 'middle'
}

function shortText(value: string, max = 150) {
  return value.length > max ? `${value.slice(0, max).trim()}...` : value
}

function csvEscape(value: string | number) {
  return `"${String(value).replace(/"/g, '""')}"`
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function serializeSvg(svg: SVGSVGElement) {
  const clone = svg.cloneNode(true) as SVGSVGElement
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  return new XMLSerializer().serializeToString(clone)
}

function exportSvg(svg: SVGSVGElement | null, filename: string) {
  if (!svg) return
  downloadBlob(new Blob([serializeSvg(svg)], { type: 'image/svg+xml;charset=utf-8' }), `${filename}.svg`)
}

function exportPng(svg: SVGSVGElement | null, filename: string) {
  if (!svg) return
  const viewBox = svg.getAttribute('viewBox')?.split(' ').map(Number)
  const width = viewBox?.[2] || 760
  const height = viewBox?.[3] || 320
  const svgBlob = new Blob([serializeSvg(svg)], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(svgBlob)
  const image = new Image()
  image.onload = () => {
    const canvas = document.createElement('canvas')
    canvas.width = width * 2
    canvas.height = height * 2
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(2, 2)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(image, 0, 0, width, height)
    canvas.toBlob((blob) => {
      if (blob) downloadBlob(blob, `${filename}.png`)
      URL.revokeObjectURL(url)
    }, 'image/png')
  }
  image.src = url
}

function eligibleRowsForQuestion(question: Question, rows: Row[]) {
  return rows.filter((row) => {
    if (row.partId !== question.partId) return false
    return answerWasShown(row.answers[question.id])
  })
}

function buildAnalysis(question: Question, rows: Row[]) {
  const eligibleRows = eligibleRowsForQuestion(question, rows)
  const notShown = rows.filter((row) => row.partId === question.partId && row.answers[question.id]?.wasShown === false).length
  const values = eligibleRows.map((row) => normalizedAnswerValue(row.answers[question.id])).filter(Boolean)
  const answered = values.length
  const eligible = eligibleRows.length
  const missing = Math.max(0, eligible - answered)
  const numeric = values.map(Number).filter((value) => Number.isFinite(value))
  const min = question.min ?? (numeric.length ? Math.min(...numeric) : 1)
  const max = question.max ?? (numeric.length ? Math.max(...numeric) : 7)

  if (question.type === 'RATING') {
    const scaleLength = max - min + 1
    const shouldBin = question.scaleType === 'vas' || scaleLength > 9
    const scalePoints = Array.from({ length: max - min + 1 }, (_, index) => {
      const value = min + index
      const usesScaleLabels = question.scaleType === 'numbers_labeled' || question.scaleType === 'labels_only'
      const label = usesScaleLabels ? question.options[index]?.trim() || 'No label' : String(value)
      return { score: value, label, count: numeric.filter((answer) => answer === value).length }
    })
    const ratingBins = shouldBin ? buildScaleBins(numeric, min, max) : []
    const peakBin = ratingBins.slice().sort((a, b) => b.count - a.count)[0]
    const low = numeric.filter((value) => scaleBand(value, min, max) === 'low').length
    const middle = numeric.filter((value) => scaleBand(value, min, max) === 'middle').length
    const high = numeric.filter((value) => scaleBand(value, min, max) === 'high').length
    return {
      values,
      eligible,
      answered,
      missing,
      notShown,
      numeric,
      points: scalePoints.map((point) => ({ label: String(point.score), value: point.count })),
      scalePoints,
      ratingBins,
      shouldBin,
      mean: average(numeric),
      median: median(numeric),
      q1: observedQuantile(numeric, 0.25),
      q3: observedQuantile(numeric, 0.75),
      mode: shouldBin ? (peakBin?.count ? peakBin.label : '-') : mostCommon(scalePoints),
      polarity: { low, middle, high },
      minScale: min,
      maxScale: max,
      examples: [] as string[],
    }
  }

  if (question.type === 'YES_NO') {
    const points = ['Yes', 'No'].map((label) => ({ label, value: values.filter((value) => value === label).length }))
    return { values, eligible, answered, missing, notShown, numeric, points, mean: null, median: null, examples: [] as string[] }
  }

  if (question.type === 'SCREENSHOT') {
    const points = [
      { label: 'Uploaded', value: answered },
    ]
    return { values, eligible, answered, missing, notShown, numeric, points, mean: null, median: null, examples: [] as string[] }
  }

  if (question.type === 'DATE_TIME') {
    const localHours = values.flatMap((value) => {
      const match = value.match(/T(\d{2}):\d{2}/)
      return match ? [`${match[1]}:00`] : []
    })
    const points = topCounts(localHours)
      .sort((a, b) => a.label.localeCompare(b.label))
    return { values, eligible, answered, missing, notShown, numeric, points, mean: null, median: null, examples: [] as string[] }
  }

  if (question.type === 'FREE_TEXT') {
    const points = [
      { label: 'Answered', value: answered },
    ]
    return { values, eligible, answered, missing, notShown, numeric, points, mean: null, median: null, examples: values.slice(0, 5) }
  }

  const points = question.type === 'MULTIPLE_CHOICE'
    ? topCounts(values.flatMap(parseMultipleChoiceAnswer))
    : topCounts(values)
  return { values, eligible, answered, missing, notShown, numeric, points, mean: null, median: null, examples: [] as string[] }
}

function freeTextAnswers(question: Question, rows: Row[]) {
  return eligibleRowsForQuestion(question, rows)
    .map((row) => ({
      entryId: row.entryId,
      participantName: row.participantName,
      participantEmail: row.participantEmail,
      date: row.date,
      submittedAt: row.submittedAt,
      answerId: row.answers[question.id]?.id ?? '',
      answer: normalizedAnswerValue(row.answers[question.id]),
      tags: row.answers[question.id]?.tags ?? [],
    }))
    .filter((row) => row.answer)
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
}

function formatSubmittedAt(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function normalizeTagLabel(tag: string) {
  return tag.trim().replace(/\s+/g, ' ').slice(0, 40)
}

function readableTextColor(hex: string) {
  const fallback = '#0f172a'
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return fallback
  const r = Number.parseInt(hex.slice(1, 3), 16)
  const g = Number.parseInt(hex.slice(3, 5), 16)
  const b = Number.parseInt(hex.slice(5, 7), 16)
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#0f172a' : '#ffffff'
}

function RatingScaleSvg({
  question,
  analysis,
  svgRef,
  title,
  subtitle,
  yAxisMax,
  yAxisStep,
}: {
  question: Question
  analysis: AnalysisResult
  svgRef: React.RefObject<SVGSVGElement | null>
  title: string
  subtitle: string
  yAxisMax: number | null
  yAxisStep: number | null
}) {
  const clipPrefix = useId().replace(/:/g, '')
  const points = analysis.scalePoints ?? []
  const bins = analysis.ratingBins ?? []
  const displayPoints = analysis.shouldBin
    ? bins.map((bin) => ({ key: bin.label, label: bin.label, sublabel: '', count: bin.count }))
    : points.map((point) => ({ key: String(point.score), label: String(point.score), sublabel: point.label === String(point.score) ? '' : point.label, count: point.count }))
  const width = 760
  const height = 260
  const left = 86
  const right = 34
  const chartTop = 66
  const baseline = 188
  const chartWidth = width - left - right
  const plotLeft = left + 34
  const plotWidth = chartWidth - 48
  const min = analysis.minScale ?? question.min ?? 1
  const max = analysis.maxScale ?? question.max ?? 7
  const step = displayPoints.length > 1 ? plotWidth / (displayPoints.length - 1) : plotWidth
  const xForScore = (score: number) => plotLeft + ((score - min) / Math.max(max - min, 1)) * plotWidth
  const meanX = analysis.mean == null ? null : xForScore(analysis.mean)
  const q1X = analysis.q1 == null ? null : xForScore(analysis.q1)
  const q3X = analysis.q3 == null ? null : xForScore(analysis.q3)
  const total = Math.max(analysis.answered, 1)
  const maxPct = Math.max(...displayPoints.map((point) => point.count / total), 0)
  const topCount = Math.max(...displayPoints.map((point) => point.count), 0)
  const stepPct = yAxisStep == null ? null : Math.min(100, Math.max(1, yAxisStep)) / 100
  const autoYMax = Math.max(0.25, Math.ceil(maxPct * 10) / 10)
  const requestedYMax = yAxisMax == null ? autoYMax : Math.max(0.05, yAxisMax / 100)
  const dataSafeYMax = stepPct == null ? Math.ceil(maxPct * 20) / 20 : Math.ceil(maxPct / stepPct) * stepPct
  const yMax = Math.min(1, Math.max(requestedYMax, dataSafeYMax, stepPct ?? 0))
  const ticks = stepPct == null
    ? [0, yMax / 2, yMax]
    : Array.from({ length: Math.floor(yMax / stepPct) + 1 }, (_, index) => Number((index * stepPct).toFixed(4)))
        .filter((tick) => tick <= yMax + 0.0001)
  const chartHeight = baseline - chartTop
  const yForPct = (pct: number) => baseline - (pct / yMax) * chartHeight

  return (
    <svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={question.text} className="w-full rounded-xl border border-slate-100 bg-white">
      <rect width={width} height={height} fill="#ffffff" />
      <defs>
        {displayPoints.map((point, index) => {
          const x = plotLeft + index * step
          const clipWidth = Math.max(30, Math.min(96, step - 4))
          return (
            <clipPath key={`${point.key}-rating-label-clip`} id={`${clipPrefix}-rating-label-clip-${index}`}>
              <rect x={x - clipWidth / 2} y={baseline + 30} width={clipWidth} height="18" />
            </clipPath>
          )
        })}
      </defs>
      {title && <text x="20" y="28" fill="#0f172a" fontSize="16" fontWeight="700">{title}</text>}
      {title && subtitle && <text x="20" y="50" fill="#64748b" fontSize="12">{subtitle}</text>}
      {!title && subtitle && (
        <text
          x={-((chartTop + baseline) / 2)}
          y="18"
          transform="rotate(-90)"
          textAnchor="middle"
          fill="#64748b"
          fontSize="11"
          fontWeight="700"
        >
          {subtitle}
        </text>
      )}

      {ticks.map((tick) => {
        const y = yForPct(tick)
        return (
          <g key={tick}>
            <line x1={left} y1={y} x2={left + chartWidth} y2={y} stroke="#e2e8f0" strokeWidth="1" />
            <text x={left - 30} y={y + 4} textAnchor="end" fill="#64748b" fontSize="11">{Math.round(tick * 100)}%</text>
          </g>
        )
      })}
      <line x1={left} y1={baseline} x2={left + chartWidth} y2={baseline} stroke="#cbd5e1" strokeWidth="2" />
      {q1X != null && q3X != null && (
        <rect x={Math.min(q1X, q3X)} y={chartTop} width={Math.abs(q3X - q1X)} height={chartHeight} fill="#eef2ff" opacity="0.75" />
      )}

      {displayPoints.map((point, index) => {
        const x = plotLeft + index * step
        const pct = point.count / total
        const isTop = topCount > 0 && point.count === topCount
        const clampedPct = Math.min(pct, yMax)
        const unclampedBarHeight = baseline - yForPct(clampedPct)
        const barHeight = point.count ? Math.min(chartHeight, Math.max(28, unclampedBarHeight)) : 0
        const labelPct = Math.round(pct * 100)
        const barWidth = analysis.shouldBin ? Math.min(44, Math.max(18, step - 8)) : 34
        const labelY = point.count ? baseline - barHeight + 17 : baseline - 10
        const showSublabel = Boolean(point.sublabel) && (displayPoints.length <= 7 || index === 0 || index === displayPoints.length - 1)
        return (
          <g key={point.key}>
            <title>{`${point.count}`}</title>
            <rect
              x={x - barWidth / 2}
              y={baseline - barHeight}
              width={barWidth}
              height={barHeight}
              rx="7"
              fill={point.count ? (isTop ? '#0f766e' : '#4f46e5') : '#e2e8f0'}
              stroke={isTop ? '#99f6e4' : 'transparent'}
              strokeWidth={isTop ? '2' : '0'}
            />
            <text x={x} y={labelY} textAnchor="middle" fill={point.count ? '#ffffff' : '#0f172a'} fontSize="11" fontWeight="800">{labelPct}%</text>
            <line x1={x} y1={baseline} x2={x} y2={baseline + 7} stroke={isTop ? '#0f766e' : '#94a3b8'} strokeWidth={isTop ? '3' : '2'} />
            <text x={x} y={baseline + 25} textAnchor="middle" fill={isTop ? '#0f766e' : '#0f172a'} fontSize="13" fontWeight="800">{point.label}</text>
            {showSublabel && (
              <text
                x={x}
                y={baseline + 42}
                textAnchor="middle"
                clipPath={`url(#${clipPrefix}-rating-label-clip-${index})`}
                fill={isTop ? '#0f766e' : '#64748b'}
                fontSize="10"
              >
                {point.sublabel.length > 12 ? `${point.sublabel.slice(0, 12)}...` : point.sublabel}
              </text>
            )}
          </g>
        )
      })}

      {meanX != null && (
        <g>
          <line x1={meanX} y1={chartTop - 4} x2={meanX} y2={baseline + 10} stroke="#ef4444" strokeWidth="2" strokeDasharray="5 5" opacity="0.8" />
        </g>
      )}

      <text x={left + chartWidth / 2} y={height - 10} textAnchor="middle" fill="#64748b" fontSize="11" fontWeight="700">Scale value</text>
    </svg>
  )
}

function YesNoPieSvg({
  analysis,
  svgRef,
  title,
  subtitle,
}: {
  analysis: AnalysisResult
  svgRef: React.RefObject<SVGSVGElement | null>
  title: string
  subtitle: string
}) {
  const yes = analysis.points.find((point) => point.label === 'Yes')?.value ?? 0
  const no = analysis.points.find((point) => point.label === 'No')?.value ?? 0
  const total = yes + no
  const yesPct = total ? Math.round((yes / total) * 100) : 0
  const noPct = total ? 100 - yesPct : 0
  const width = 760
  const height = 240
  const cx = 116
  const cy = 132
  const radius = 78
  const labelRadius = 58
  const pointOnArc = (angle: number) => ({
    x: cx + Math.cos((angle * Math.PI) / 180) * labelRadius,
    y: cy + Math.sin((angle * Math.PI) / 180) * labelRadius,
  })
  const yesAngle = total ? (yes / total) * 360 : 0
  const noAngle = total ? (no / total) * 360 : 0
  const yesMidAngle = -90 + yesAngle / 2
  const noMidAngle = -90 + yesAngle + noAngle / 2
  const yesLabel = pointOnArc(yesMidAngle)
  const noLabel = pointOnArc(noMidAngle)
  const polarPoint = (angle: number, radius: number) => ({
    x: cx + Math.cos((angle * Math.PI) / 180) * radius,
    y: cy + Math.sin((angle * Math.PI) / 180) * radius,
  })
  const piePath = (startAngle: number, endAngle: number) => {
    const largeArc = endAngle - startAngle > 180 ? 1 : 0
    const start = polarPoint(startAngle, radius)
    const end = polarPoint(endAngle, radius)
    return [
      `M ${cx} ${cy}`,
      `L ${start.x} ${start.y}`,
      `A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`,
      'Z',
    ].join(' ')
  }
  const labelBadge = (x: number, y: number, label: string) => (
    <g>
      <rect x={x - 24} y={y - 15} width="48" height="30" rx="15" fill="#ffffff" opacity="0.94" />
      <text x={x} y={y + 5} textAnchor="middle" fill="#0f172a" fontSize="14" fontWeight="800">
        {label}
      </text>
    </g>
  )

  return (
    <svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Yes / No distribution" className="w-full rounded-xl border border-slate-100 bg-white">
      <rect width={width} height={height} fill="#ffffff" />
      {title && <text x="20" y="28" fill="#0f172a" fontSize="16" fontWeight="700">{title}</text>}
      {subtitle && <text x="20" y={title ? 50 : 28} fill="#64748b" fontSize="12">{subtitle}</text>}

      <circle cx={cx} cy={cy} r={radius} fill="#f8fafc" />
      {total > 0 && (
        <>
          {yes > 0 && yesAngle >= 359.99 ? (
            <circle cx={cx} cy={cy} r={radius} fill="#4f46e5">
              <title>{`${yes}`}</title>
            </circle>
          ) : yes > 0 && (
            <path d={piePath(-90, -90 + yesAngle)} fill="#4f46e5">
              <title>{`${yes}`}</title>
            </path>
          )}
          {no > 0 && noAngle >= 359.99 ? (
            <circle cx={cx} cy={cy} r={radius} fill="#94a3b8">
              <title>{`${no}`}</title>
            </circle>
          ) : no > 0 && (
            <path d={piePath(-90 + yesAngle, -90 + yesAngle + noAngle)} fill="#94a3b8">
              <title>{`${no}`}</title>
            </path>
          )}
        </>
      )}
      {total === 0 && (
        <text x={cx} y={cy + 5} textAnchor="middle" fill="#64748b" fontSize="13" fontWeight="700">No data</text>
      )}
      {total > 0 && yes > 0 && labelBadge(yesLabel.x, yesLabel.y, `${yesPct}%`)}
      {total > 0 && no > 0 && labelBadge(noLabel.x, noLabel.y, `${noPct}%`)}

      <g transform="translate(270 104)">
        <circle cx="0" cy="0" r="7" fill="#4f46e5" />
        <text x="20" y="5" fill="#0f172a" fontSize="15" fontWeight="700">Yes</text>
      </g>
      <g transform="translate(270 154)">
        <circle cx="0" cy="0" r="7" fill="#94a3b8" />
        <text x="20" y="5" fill="#0f172a" fontSize="15" fontWeight="700">No</text>
      </g>
    </svg>
  )
}

function wrapPlotLabel(label: string, maxChars: number) {
  const words = label.trim().split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ''

  for (const word of words) {
    if (word.length > maxChars) {
      if (current) {
        lines.push(current)
        current = ''
      }
      for (let i = 0; i < word.length; i += maxChars) {
        lines.push(word.slice(i, i + maxChars))
      }
      continue
    }
    const next = current ? `${current} ${word}` : word
    if (next.length > maxChars && current) {
      lines.push(current)
      current = word
    } else {
      current = next
    }
  }

  if (current) lines.push(current)
  return lines.length ? lines : ['-']
}

function PlotSvg({
  title,
  subtitle,
  points,
  mean,
  svgRef,
  denominator,
}: {
  title: string
  subtitle: string
  points: DataPoint[]
  mean?: number | null
  svgRef: React.RefObject<SVGSVGElement | null>
  denominator?: number
}) {
  const width = 760
  const safeLeft = 22
  const labelWidth = 164
  const labelToBarGap = 18
  const valueColumnWidth = 54
  const safeRight = 20
  const hasTitle = Boolean(title)
  const hasSubtitle = Boolean(subtitle)
  const top = hasSubtitle ? 62 : hasTitle ? 48 : 18
  const maxLabelChars = Math.max(10, Math.floor(labelWidth / 7.3))
  const labelLines = points.map((point) => wrapPlotLabel(point.label, maxLabelChars))
  const rowHeights = labelLines.map((lines) => Math.max(38, lines.length * 15 + 10))
  const rowStarts = rowHeights.map((_, index) => top + rowHeights.slice(0, index).reduce((sum, height) => sum + height, 0))
  const left = safeLeft + labelWidth + labelToBarGap
  const valueX = width - safeRight
  const chartRight = valueX - valueColumnWidth
  const chartBodyHeight = rowHeights.reduce((sum, rowHeight) => sum + rowHeight, 0)
  const height = Math.max(hasTitle || hasSubtitle ? 220 : 170, top + chartBodyHeight + (mean != null ? 38 : 20))
  const total = denominator ?? points.reduce((sum, point) => sum + point.value, 0)
  const percentages = points.map((point) => total ? Math.round((point.value / total) * 100) : 0)
  const topCount = Math.max(...points.map((point) => point.value), 0)
  const chartWidth = Math.max(120, chartRight - left)

  return (
    <svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title || 'Categorical response distribution'} className="w-full rounded-xl border border-slate-100 bg-white">
      <rect width={width} height={height} fill="#ffffff" />
      {title && <text x="20" y="28" fill="#0f172a" fontSize="16" fontWeight="700">{title}</text>}
      {subtitle && <text x="20" y={title ? 50 : 28} fill="#64748b" fontSize="13">{subtitle}</text>}
      {points.length === 0 && (
        <text x="20" y={top + 22} fill="#64748b" fontSize="14">No answers yet.</text>
      )}
      {points.map((point, index) => {
        const y = rowStarts[index]
        const rowHeight = rowHeights[index]
        const barY = y + Math.max(0, (rowHeight - 20) / 2)
        const centerY = y + rowHeight / 2
        const pct = percentages[index] ?? 0
        const barWidth = (pct / 100) * chartWidth
        const isTop = topCount > 0 && point.value === topCount
        return (
          <g key={`${point.label}-${index}`}>
            <title>{`${point.value}`}</title>
            <text
              x={safeLeft}
              y={centerY - ((labelLines[index].length - 1) * 15) / 2 + 5}
              textAnchor="start"
              fill={isTop ? '#0f766e' : '#334155'}
              fontSize="13"
              fontWeight={isTop ? '800' : '600'}
            >
              {labelLines[index].map((line, lineIndex) => (
                <tspan key={lineIndex} x={safeLeft} dy={lineIndex === 0 ? 0 : 15}>
                  {line}
                </tspan>
              ))}
            </text>
            <rect x={left} y={barY} width={chartWidth} height="20" rx="10" fill={isTop ? '#ccfbf1' : '#eef2ff'} />
            <rect
              x={left}
              y={barY}
              width={Math.max(barWidth, pct > 0 ? 8 : 0)}
              height="20"
              rx="10"
              fill={isTop ? '#0f766e' : '#4f46e5'}
            />
            <text x={valueX} y={centerY + 5} textAnchor="end" fill={isTop ? '#0f766e' : '#0f172a'} fontSize="13" fontWeight="800">{pct}%</text>
          </g>
        )
      })}
      {mean != null && Number.isFinite(mean) && (
        <text x="24" y={height - 18} fill="#475569" fontSize="13" fontWeight="600">
          Mean: {mean.toFixed(1)}
        </text>
      )}
    </svg>
  )
}



function FreeTextAnswerList({
  studyId,
  questionId,
  initialTags,
  answers,
}: {
  studyId: string
  questionId: string
  initialTags: TagDefinition[]
  answers: ReturnType<typeof freeTextAnswers>
}) {
  const router = useRouter()
  const [tagDefinitions, setTagDefinitions] = useState<TagDefinition[]>(initialTags)
  const [newTagLabel, setNewTagLabel] = useState('')
  const [newTagColor, setNewTagColor] = useState('#4f46e5')
  const [savingTagId, setSavingTagId] = useState<string | null>(null)
  const [tagIdsByAnswer, setTagIdsByAnswer] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(answers.map((answer) => [answer.answerId, answer.tags.map((tag) => tag.id)]))
  )
  const [savingAnswerId, setSavingAnswerId] = useState<string | null>(null)
  const [tagFilter, setTagFilter] = useState('all')
  const [visibleCount, setVisibleCount] = useState(10)

  const tagById = useMemo(
    () => new Map(tagDefinitions.map((tag) => [tag.id, tag])),
    [tagDefinitions]
  )
  const tagCounts = tagDefinitions.map((tag) => ({
    tag,
    count: answers.filter((answer) => (tagIdsByAnswer[answer.answerId] ?? []).includes(tag.id)).length,
  }))
  const untaggedCount = answers.filter((answer) => (tagIdsByAnswer[answer.answerId] ?? []).length === 0).length
  const maxTagCount = Math.max(...tagCounts.map((tag) => tag.count), 1)
  const filteredAnswers = tagFilter === 'all'
    ? answers
    : answers.filter((answer) => (tagIdsByAnswer[answer.answerId] ?? []).includes(tagFilter))
  const visibleAnswers = filteredAnswers.slice(0, visibleCount)
  const hasHiddenAnswers = visibleCount < filteredAnswers.length

  function selectTagFilter(nextTagFilter: string) {
    setTagFilter(nextTagFilter)
    setVisibleCount(10)
  }

  async function saveTags(answerId: string, nextTagIds: string[]) {
    const finalTagIds = Array.from(new Set(nextTagIds)).filter((tagId) => tagById.has(tagId)).slice(0, 12)
    setTagIdsByAnswer((current) => ({ ...current, [answerId]: finalTagIds }))
    setSavingAnswerId(answerId)
    const result = await updateAnswerTags(studyId, answerId, finalTagIds)
    setSavingAnswerId(null)
    if (result?.tagIds) {
      setTagIdsByAnswer((current) => ({ ...current, [answerId]: result.tagIds }))
      router.refresh()
    }
  }

  async function createTagDefinition(label: string, color: string) {
    const finalLabel = normalizeTagLabel(label)
    if (!finalLabel) return
    setSavingTagId('new')
    const result = await createQuestionTag(studyId, questionId, finalLabel, color)
    setSavingTagId(null)
    if (result?.tag) {
      setTagDefinitions((current) => {
        const withoutDuplicate = current.filter((tag) => tag.id !== result.tag.id && tag.label !== result.tag.label)
        return [...withoutDuplicate, result.tag].sort((a, b) => a.label.localeCompare(b.label))
      })
      setNewTagLabel('')
      router.refresh()
    }
  }

  async function updateTagDefinition(tag: TagDefinition, patch: Partial<Pick<TagDefinition, 'label' | 'color'>>) {
    setSavingTagId(tag.id)
    const result = await updateQuestionTag(studyId, tag.id, patch)
    setSavingTagId(null)
    if (result?.tag) {
      setTagDefinitions((current) => current.map((item) => item.id === tag.id ? result.tag : item).sort((a, b) => a.label.localeCompare(b.label)))
      router.refresh()
    }
  }

  async function removeTagDefinition(tagId: string) {
    setSavingTagId(tagId)
    const result = await deleteQuestionTag(studyId, tagId)
    setSavingTagId(null)
    if (result?.success) {
      setTagDefinitions((current) => current.filter((tag) => tag.id !== tagId))
      setTagIdsByAnswer((current) => Object.fromEntries(Object.entries(current).map(([answerId, tagIds]) => [
        answerId,
        tagIds.filter((id) => id !== tagId),
      ])))
      if (tagFilter === tagId) selectTagFilter('all')
      router.refresh()
    }
  }

  function addTag(answerId: string, tagId: string) {
    if (!tagById.has(tagId)) return
    void saveTags(answerId, [...(tagIdsByAnswer[answerId] ?? []), tagId])
  }

  function removeTag(answerId: string, tagId: string) {
    void saveTags(answerId, (tagIdsByAnswer[answerId] ?? []).filter((currentTagId) => currentTagId !== tagId))
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-[var(--bg-sunken)] p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h4 className="text-sm font-semibold text-slate-700">Question tags</h4>
            <p className="mt-1 text-sm text-slate-600">Create tags for this question, then apply them to answers below.</p>
          </div>
          <div className="flex flex-col gap-2 sm:min-w-80">
            <div className="flex gap-2">
              <TextInput
                value={newTagLabel}
                onChange={(event) => setNewTagLabel(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    void createTagDefinition(newTagLabel, newTagColor)
                  }
                }}
                placeholder="Create tag"
                className="bg-white"
              />
              <input
                type="color"
                value={newTagColor}
                onChange={(event) => setNewTagColor(event.target.value)}
                className="h-10 w-12 cursor-pointer rounded-xl border border-slate-300 bg-white p-1"
                aria-label="Tag color"
              />
              <button
                type="button"
                onClick={() => void createTagDefinition(newTagLabel, newTagColor)}
                className="h-10 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold whitespace-nowrap text-slate-700 hover:bg-slate-50"
              >
                Add tag
              </button>
            </div>
            {savingTagId === 'new' && <p className="text-sm text-slate-500">Saving tag...</p>}
          </div>
        </div>
        {tagDefinitions.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {tagDefinitions.map((tag) => (
              <span key={tag.id} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-2 py-1">
                <input
                  type="color"
                  value={tag.color}
                  onChange={(event) => void updateTagDefinition(tag, { color: event.target.value })}
                  className="h-6 w-7 cursor-pointer rounded border border-slate-200 bg-white p-0.5"
                  aria-label={`${tag.label} color`}
                />
                <input
                  value={tag.label}
                  onChange={(event) => {
                    const nextLabel = event.target.value
                    setTagDefinitions((current) => current.map((item) => item.id === tag.id ? { ...item, label: nextLabel } : item))
                  }}
                  onBlur={(event) => void updateTagDefinition(tag, { label: event.target.value })}
                  className="w-28 bg-transparent text-sm font-semibold text-slate-700 outline-none"
                  aria-label={`${tag.label} label`}
                />
                <button
                  type="button"
                  onClick={() => void removeTagDefinition(tag.id)}
                  className="rounded-full p-0.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  aria-label={`Delete ${tag.label}`}
                  title="Delete tag"
                >
                  <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {tagDefinitions.length > 0 && (
        <div className="rounded-xl bg-[var(--bg-sunken)] p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h4 className="text-sm font-semibold text-slate-700">Tag summary</h4>
              <p className="mt-1 text-sm text-slate-600">Tags can overlap, so percentages may add to more than 100%.</p>
            </div>
            <div className="w-full sm:w-56">
              <SelectMenu
                label="Filter by tag"
                value={tagFilter}
                onChange={selectTagFilter}
                options={[
                  { value: 'all', label: 'All tags' },
                  ...tagDefinitions.map((tag) => ({ value: tag.id, label: tag.label })),
                ]}
              />
            </div>
          </div>
          <div className="mt-4 space-y-3">
            <div className="grid w-full grid-cols-[minmax(120px,180px)_minmax(0,1fr)_48px] items-center gap-3 rounded-xl px-2 py-1 text-left">
              <span className="truncate text-sm font-semibold text-slate-700">Untagged</span>
              <span className="h-3 overflow-hidden rounded-full bg-slate-100">
                <span
                  className="block h-full rounded-full bg-slate-400"
                  style={{ width: `${answers.length ? Math.max(6, (untaggedCount / answers.length) * 100) : 0}%` }}
                />
              </span>
              <span className="text-right text-sm font-bold text-slate-900">{answers.length ? Math.round((untaggedCount / answers.length) * 100) : 0}%</span>
            </div>
            {tagCounts.map(({ tag, count }) => {
              const pct = answers.length ? Math.round((count / answers.length) * 100) : 0
              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => selectTagFilter(tag.id)}
                  className={`grid w-full grid-cols-[minmax(120px,180px)_minmax(0,1fr)_48px] items-center gap-3 rounded-xl px-2 py-1 text-left transition-colors hover:bg-slate-50 ${tagFilter === tag.id ? 'bg-indigo-50' : ''}`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: tag.color }} />
                    <span className="truncate text-sm font-semibold text-slate-700">{tag.label}</span>
                  </span>
                  <span className="h-3 overflow-hidden rounded-full bg-slate-100">
                    <span
                      className="block h-full rounded-full bg-indigo-600"
                      style={{ width: `${Math.max(6, (count / maxTagCount) * 100)}%`, backgroundColor: tag.color }}
                    />
                  </span>
                  <span className="text-right text-sm font-bold text-slate-900">{pct}%</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold text-slate-700">{tagFilter === 'all' ? 'All answers' : `Answers tagged "${tagById.get(tagFilter)?.label ?? 'tag'}"`}</h4>
              {filteredAnswers.length > 0 && (
                <p className="mt-0.5 text-sm text-slate-600">
                  Showing {Math.min(visibleCount, filteredAnswers.length)} of {filteredAnswers.length}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {filteredAnswers.length > 10 && visibleCount < filteredAnswers.length && (
                <button type="button" onClick={() => setVisibleCount(filteredAnswers.length)} className="text-sm font-semibold text-indigo-700">
                  Load all
                </button>
              )}
              {visibleCount > 10 && (
                <button type="button" onClick={() => setVisibleCount(10)} className="text-sm font-semibold text-slate-700">
                  Hide
                </button>
              )}
              {tagFilter !== 'all' && (
                <button type="button" onClick={() => selectTagFilter('all')} className="text-sm font-semibold text-indigo-700">
                  Clear filter
                </button>
              )}
            </div>
          </div>
        </div>
        {filteredAnswers.length === 0 ? (
          <p className="px-4 py-5 text-sm text-slate-600">No answers yet.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {visibleAnswers.map((answer) => {
              const currentTagIds = tagIdsByAnswer[answer.answerId] ?? []
              const currentTags = currentTagIds.map((tagId) => tagById.get(tagId)).filter(Boolean) as TagDefinition[]
              const reusableTags = tagDefinitions.filter((tag) => !currentTagIds.includes(tag.id))
              return (
              <article key={`${answer.entryId}-${answer.answer}`} className="space-y-3 px-4 py-4">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <span className="font-semibold text-slate-950">{answer.participantName}</span>
                  <span className="text-slate-600">{answer.participantEmail}</span>
                  <span className="text-slate-500">{formatSubmittedAt(answer.submittedAt)}</span>
                  {savingAnswerId === answer.answerId && <span className="text-slate-500">Saving tags...</span>}
                </div>
                <p className="whitespace-pre-wrap rounded-xl bg-slate-50 px-4 py-3 text-base leading-relaxed text-slate-900">
                  {answer.answer}
                </p>
                <div className="space-y-2">
                  {currentTags.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {currentTags.map((tag) => (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => removeTag(answer.answerId, tag.id)}
                        className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-semibold hover:opacity-80"
                        style={{ backgroundColor: tag.color, color: readableTextColor(tag.color) }}
                        title="Remove tag"
                      >
                        {tag.label}
                        <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>
                      </button>
                      ))}
                    </div>
                  )}
                  {reusableTags.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {reusableTags.slice(0, 8).map((tag) => (
                        <button
                          key={tag.id}
                          type="button"
                          onClick={() => addTag(answer.answerId, tag.id)}
                          className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-medium text-slate-600 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
                        >
                          <span className="mr-1 inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: tag.color }} />
                          + {tag.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </article>
            )})}
            {(hasHiddenAnswers || visibleCount > 10) && (
              <div className="flex flex-wrap items-center justify-center gap-3 px-4 py-4">
                {hasHiddenAnswers && (
                  <button
                    type="button"
                    onClick={() => setVisibleCount((count) => Math.min(count + 10, filteredAnswers.length))}
                    className="h-10 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Load 10 more
                  </button>
                )}
                {hasHiddenAnswers && (
                  <button
                    type="button"
                    onClick={() => setVisibleCount(filteredAnswers.length)}
                    className="h-10 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Load all
                  </button>
                )}
                {visibleCount > 10 && (
                  <button
                    type="button"
                    onClick={() => setVisibleCount(10)}
                    className="h-10 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Hide
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function InlineBarChart({
  points,
  denominator,
}: {
  points: DataPoint[]
  denominator?: number
}) {
  const total = denominator ?? points.reduce((sum, p) => sum + p.value, 0)
  const maxCount = Math.max(...points.map((p) => p.value), 1)
  const topCount = Math.max(...points.map((p) => p.value), 0)

  if (points.length === 0) return <p className="text-sm text-slate-500">No answers yet.</p>

  return (
    <div className="space-y-2">
      {points.map((point, i) => {
        const pct = total ? Math.round((point.value / total) * 100) : 0
        const barWidth = pct
        const isTop = topCount > 0 && point.value === topCount
        return (
          <div
            key={`${point.label}-${i}`}
            className="grid items-center gap-3"
            style={{ gridTemplateColumns: 'minmax(80px, 220px) 1fr 52px' }}
          >
            <span className={`truncate text-sm ${isTop ? 'font-semibold text-slate-900' : 'text-slate-600'}`} title={point.label}>
              {point.label}
            </span>
            <div
              className="relative h-5 overflow-hidden rounded bg-[var(--bg-sunken)]"
              title={point.value > 0 ? String(point.value) : undefined}
            >
              <div
                className={`absolute inset-y-0 left-0 rounded transition-all ${isTop ? 'bg-indigo-600' : 'bg-indigo-200'}`}
                style={{ width: `${Math.max(barWidth, point.value > 0 ? 1 : 0)}%` }}
              />
            </div>
            <div className="text-right tabular-nums">
              {pct > 0 && (
                <div className={`text-sm ${isTop ? 'font-bold text-slate-900' : 'text-slate-500'}`}>{pct}%</div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function StackedBarChart({
  points,
  denominator,
}: {
  points: DataPoint[]
  denominator?: number
}) {
  const total = denominator ?? points.reduce((sum, p) => sum + p.value, 0)

  if (points.length === 0 || total === 0) return <p className="text-sm text-slate-500">No answers yet.</p>

  const colorStops = ['#c7d2fe', '#a5b4fc', '#818cf8', '#6366f1', '#4f46e5', '#4338ca', '#3730a3']
  const getColor = (index: number, n: number) => {
    if (n <= 1) return colorStops[3]
    const pos = (index / (n - 1)) * (colorStops.length - 1)
    return colorStops[Math.round(pos)] ?? colorStops[colorStops.length - 1]
  }

  const pcts = points.map((p) => (p.value / total) * 100)
  const ZERO_SLIVER = 3
  const zeroCount = points.filter((p) => p.value === 0).length
  const scale = zeroCount > 0 ? (100 - zeroCount * ZERO_SLIVER) / 100 : 1
  const displayPcts = pcts.map((pct) => pct === 0 ? ZERO_SLIVER : pct * scale)

  return (
    <div className="space-y-3">
      <div className="flex h-9 w-full gap-0.5 overflow-hidden rounded-xl">
        {points.map((point, i) => {
          const pct = pcts[i]
          const displayPct = displayPcts[i]
          const roundedPct = Math.round(pct)
          const color = getColor(i, points.length)
          return (
            <div
              key={`${point.label}-${i}`}
              style={{ width: `${displayPct}%`, backgroundColor: color }}
              title={String(point.value)}
              className="relative flex shrink-0 items-center justify-center overflow-hidden"
            >
              {pct >= 8 && (
                <span className="text-xs font-bold" style={{ color: readableTextColor(color) }}>{roundedPct}%</span>
              )}
            </div>
          )
        })}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {points.map((point, i) => {
          const color = getColor(i, points.length)
          return (
            <div key={`${point.label}-${i}`} className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
              <span className="text-xs text-slate-600">{point.label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function QuestionAnalysisCard({
  studyId,
  question,
  rows,
  index,
}: {
  studyId: string
  question: Question
  rows: Row[]
  index: number
}) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const analysis = useMemo(() => buildAnalysis(question, rows), [question, rows])
  const textAnswers = useMemo(() => question.type === 'FREE_TEXT' ? freeTextAnswers(question, rows) : [], [question, rows])
  const freeTextStateKey = useMemo(() => {
    if (question.type !== 'FREE_TEXT') return question.id
    const tagSignature = (question.tagDefinitions ?? []).map((tag) => `${tag.id}:${tag.label}:${tag.color}`).join('|')
    const answerSignature = textAnswers.map((answer) => `${answer.answerId}:${answer.tags.map((tag) => tag.id).join('.')}`).join('|')
    return `${question.id}:${tagSignature}:${answerSignature}`
  }, [question, textAnswers])
  const filename = `${String(index + 1).padStart(2, '0')}_${slugify(question.text)}`
  const plotSubtitle =
    question.type === 'MULTIPLE_CHOICE'
      ? 'Percent of respondents selecting each option'
      : question.type === 'SINGLE_CHOICE' || question.type === 'RATING' || question.type === 'YES_NO' || question.type === 'DATE_TIME'
        ? 'Percent of answered responses'
        : ''
  const barPoints: DataPoint[] = question.type === 'RATING'
    ? (analysis.shouldBin
        ? (analysis.ratingBins ?? []).map((b) => ({ label: b.label, value: b.count }))
        : (analysis.scalePoints ?? []).map((p) => ({ label: p.label, value: p.count }))) as DataPoint[]
    : analysis.points

  function exportCsv() {
    const metadataHeader = ['study_exported_at', 'question_id', 'part', 'eligible_n', 'answered_n', 'missing_n', 'not_shown_n']
    const metadataValues = [
      new Date().toISOString(),
      question.id,
      question.partName,
      String(analysis.eligible),
      String(analysis.answered),
      String(analysis.missing),
      String(analysis.notShown),
    ]
    if (question.type === 'FREE_TEXT') {
      const header = [...metadataHeader, 'question', 'participant_name', 'participant_email', 'entry_date', 'submitted_at', 'answer', 'tags']
      const rows = textAnswers.map((answer) => [
        ...metadataValues.map(csvEscape),
        csvEscape(question.text),
        csvEscape(answer.participantName),
        csvEscape(answer.participantEmail),
        csvEscape(answer.date),
        csvEscape(answer.submittedAt),
        csvEscape(answer.answer),
        csvEscape((answer.tags ?? []).map((tag) => tag.label).join('; ')),
      ].join(','))
      downloadBlob(new Blob([[header.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8' }), `${filename}.csv`)
      return
    }

    const header = question.type === 'RATING'
      ? [...metadataHeader, 'question', 'type', 'scale_value_or_bin', 'label', 'count', 'percent', 'mean', 'median', 'q1', 'q3', 'peak', 'low_count', 'middle_count', 'high_count']
      : [...metadataHeader, 'question', 'type', 'label', 'count', 'percent']
    const rows = question.type === 'RATING'
      ? (analysis.shouldBin
        ? (analysis.ratingBins ?? []).map((bin) => ({
          value: bin.label,
          label: `${formatNumber(bin.start)} to ${formatNumber(bin.end)}`,
          count: bin.count,
        }))
        : (analysis.scalePoints ?? []).map((point) => ({
          value: String(point.score),
          label: point.label,
          count: point.count,
        }))
      ).map((point) => [
        ...metadataValues.map(csvEscape),
        csvEscape(question.text),
        csvEscape(questionTypeLabel(question.type, question.scaleType)),
        csvEscape(point.value),
        csvEscape(point.label),
        String(point.count),
        analysis.answered ? String(Math.round((point.count / analysis.answered) * 100)) : '0',
        formatNumber(analysis.mean),
        formatNumber(analysis.median),
        formatNumber(analysis.q1),
        formatNumber(analysis.q3),
        csvEscape(analysis.mode ?? ''),
        String(analysis.polarity?.low ?? 0),
        String(analysis.polarity?.middle ?? 0),
        String(analysis.polarity?.high ?? 0),
      ].join(','))
      : analysis.points.map((point) => [
        ...metadataValues.map(csvEscape),
        csvEscape(question.text),
        csvEscape(questionTypeLabel(question.type, question.scaleType)),
        csvEscape(point.label),
        String(point.value),
        String(Math.round((point.value / Math.max(question.type === 'MULTIPLE_CHOICE' ? analysis.answered : analysis.points.reduce((sum, current) => sum + current.value, 0), 1)) * 100)),
      ].join(','))
    downloadBlob(new Blob([[header.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8' }), `${filename}.csv`)
  }

  return (
    <div className="border-t border-[var(--border)] py-6">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold leading-snug text-slate-900">{question.text}</h3>
          <p className="mt-1 text-xs text-slate-400">
            {analysis.answered} answered · {analysis.eligible} eligible
            {analysis.missing > 0 && ` · ${analysis.missing} missing`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ExportMenu
            onPng={question.type === 'FREE_TEXT' ? undefined : () => exportPng(svgRef.current, filename)}
            onSvg={question.type === 'FREE_TEXT' ? undefined : () => exportSvg(svgRef.current, filename)}
            onCsv={exportCsv}
          />
        </div>
      </div>

      {question.type === 'FREE_TEXT' ? (
        <FreeTextAnswerList key={freeTextStateKey} studyId={studyId} questionId={question.id} initialTags={question.tagDefinitions ?? []} answers={textAnswers} />
      ) : question.type === 'YES_NO' ? (
        <YesNoPieSvg analysis={analysis} svgRef={svgRef} title="" subtitle={plotSubtitle} />
      ) : (
        <div className="space-y-3">
          {question.type === 'RATING' ? (
            <StackedBarChart points={barPoints} denominator={analysis.answered} />
          ) : (
            <InlineBarChart
              points={barPoints}
              denominator={question.type === 'MULTIPLE_CHOICE' ? analysis.answered : undefined}
            />
          )}
          {question.type === 'RATING' && analysis.answered > 0 && (
            <p className="text-xs text-slate-400">
              Mean {formatNumber(analysis.mean)} · Median {formatNumber(analysis.median)} · Range {question.min ?? 1}–{question.max ?? 7}
            </p>
          )}
        </div>
      )}

      <div hidden>
        {question.type === 'RATING' ? (
          <RatingScaleSvg
            question={question}
            analysis={analysis}
            svgRef={svgRef}
            title=""
            subtitle={plotSubtitle}
            yAxisMax={null}
            yAxisStep={null}
          />
        ) : question.type !== 'FREE_TEXT' && question.type !== 'YES_NO' ? (
          <PlotSvg
            svgRef={svgRef}
            title=""
            subtitle={plotSubtitle}
            points={analysis.points}
            denominator={analysis.answered}
          />
        ) : null}
      </div>
    </div>
  )
}

export default function AnalysisDashboard({ studyId, parts, participants, questions, rows }: Props) {
  const answerQuestions = useMemo(
    () => questions.filter((question) => question.type !== 'CONTENT' && question.type !== 'SCREENSHOT'),
    [questions]
  )
const [partId, setPartId] = useState('all')
  const [participantId, setParticipantId] = useState('all')
  const [questionType, setQuestionType] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [includePilotData, setIncludePilotData] = useState(false)

  const questionTypes = Array.from(new Set(answerQuestions.map((question) => question.type)))
  const pilotRowCount = useMemo(() => rows.filter((row) => row.isPilot).length, [rows])
  const filteredRows = useMemo(() => rows.filter((row) => {
    if (!includePilotData && row.isPilot) return false
    if (partId !== 'all' && row.partId !== partId) return false
    if (participantId !== 'all' && row.participantId !== participantId) return false
    if (dateFrom && row.date < dateFrom) return false
    if (dateTo && row.date > dateTo) return false
    return true
  }), [rows, includePilotData, partId, participantId, dateFrom, dateTo])

  const filteredQuestions = useMemo(() => answerQuestions.filter((question) => {
    if (partId !== 'all' && question.partId !== partId) return false
    if (questionType !== 'all' && question.type !== questionType) return false
    return true
  }), [answerQuestions, partId, questionType])

  const coverageTotals = filteredQuestions.reduce((totals, question) => {
    const analysis = buildAnalysis(question, filteredRows)
    return {
      answered: totals.answered + analysis.answered,
      eligible: totals.eligible + analysis.eligible,
      missing: totals.missing + analysis.missing,
      notShown: totals.notShown + analysis.notShown,
    }
  }, { answered: 0, eligible: 0, missing: 0, notShown: 0 })
  const answeredValues = coverageTotals.answered
  const possibleValues = coverageTotals.eligible
  const coverage = possibleValues ? Math.round((answeredValues / possibleValues) * 100) : 0
  const qualityFlagCounts = filteredRows.reduce((counts, row) => {
    for (const flag of row.qualityFlags) counts.set(flag, (counts.get(flag) ?? 0) + 1)
    return counts
  }, new Map<string, number>())
  const qualityFlagEntries = Array.from(qualityFlagCounts.entries()).sort((a, b) => b[1] - a[1])

  const questionGroups = useMemo(() => {
    let globalIndex = 0
    return parts
      .map((part) => {
        const partQuestions = filteredQuestions
          .filter((q) => q.partId === part.id)
          .map((question) => ({ question, index: globalIndex++ }))
        return { part, partQuestions }
      })
      .filter((group) => group.partQuestions.length > 0)
  }, [parts, filteredQuestions])

  return (
    <div className="space-y-5">
      <div className="border-b border-[var(--border)] pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <SelectMenu
            className="w-full sm:w-auto sm:min-w-[140px]"
            value={partId}
            onChange={setPartId}
            options={[
              { value: 'all', label: 'All parts' },
              ...parts.map((part) => ({ value: part.id, label: part.name })),
            ]}
          />
          <SelectMenu
            className="w-full sm:w-auto sm:min-w-[160px]"
            value={participantId}
            onChange={setParticipantId}
            options={[
              { value: 'all', label: 'All participants' },
              ...participants.map((participant) => ({ value: participant.id, label: participant.name })),
            ]}
          />
          <SelectMenu
            className="w-full sm:w-auto sm:min-w-[130px]"
            value={questionType}
            onChange={setQuestionType}
            options={[
              { value: 'all', label: 'All types' },
              ...questionTypes.map((type) => ({ value: type, label: questionTypeLabel(type) })),
            ]}
          />
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <TextInput type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="flex-1 sm:w-36 sm:flex-none" />
            <span className="text-xs text-slate-400">–</span>
            <TextInput type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="flex-1 sm:w-36 sm:flex-none" />
          </div>
          <button
            type="button"
            onClick={() => setIncludePilotData((current) => !current)}
            disabled={pilotRowCount === 0}
            className="flex w-full items-center gap-2 transition-opacity disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto sm:ml-1"
            aria-pressed={includePilotData}
            title={pilotRowCount === 0 ? 'No pilot data to include yet.' : undefined}
          >
            <SwitchVisual checked={includePilotData} />
            <span className="text-sm text-slate-600">
              Pilot{pilotRowCount > 0 && <span className="ml-1 text-slate-400">({pilotRowCount})</span>}
            </span>
          </button>
        </div>
        <p className="mt-3 text-sm text-slate-500">
          {filteredRows.length} entries · {new Set(filteredRows.map((r) => r.participantId)).size} participants · {coverage}% completion
          {coverageTotals.missing > 0 && ` · ${coverageTotals.missing} missing`}
        </p>
      </div>

{qualityFlagEntries.length > 0 && (
        <Card>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="text-base font-semibold text-slate-900">Data quality notes</h3>
              <p className="mt-1 text-sm text-slate-600">
                These entries are included in analysis, but should be reviewed before reporting.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {qualityFlagEntries.map(([flag, count]) => (
                <span key={flag} className="rounded-full bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-900">
                  {entryQualityLabel(flag)} · {count}
                </span>
              ))}
            </div>
          </div>
        </Card>
      )}

      {questionGroups.length === 0 ? (
        <p className="py-6 text-sm text-slate-500">No questions match these filters.</p>
      ) : (
        <div>
          {questionGroups.map(({ part, partQuestions }) => (
            <div key={part.id}>
              {parts.length > 1 && partId === 'all' && (
                <p className="pb-2 pt-6 text-xs font-semibold uppercase tracking-widest text-slate-400">{part.name}</p>
              )}
              {partQuestions.map(({ question, index }) => (
                <QuestionAnalysisCard
                  key={question.id}
                  studyId={studyId}
                  question={question}
                  rows={filteredRows}
                  index={index}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
