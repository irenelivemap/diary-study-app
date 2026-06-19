'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

const STOP_WORDS = new Set([
  'i', 'me', 'my', 'myself', 'we', 'our', 'ours', 'ourselves',
  'you', 'your', 'yours', 'yourself', 'yourselves',
  'he', 'him', 'his', 'himself', 'she', 'her', 'hers', 'herself',
  'it', 'its', 'itself', 'they', 'them', 'their', 'theirs', 'themselves',
  'what', 'which', 'who', 'whom', 'this', 'that', 'these', 'those',
  'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'having', 'do', 'does', 'did', 'doing',
  'a', 'an', 'the', 'and', 'but', 'if', 'or', 'because', 'as', 'until', 'while',
  'of', 'at', 'by', 'for', 'with', 'about', 'against', 'between', 'into',
  'through', 'during', 'before', 'after', 'above', 'below', 'to', 'from', 'up', 'down',
  'in', 'out', 'on', 'off', 'over', 'under', 'again', 'further', 'then', 'once',
  'here', 'there', 'when', 'where', 'why', 'how', 'all', 'both', 'each', 'few',
  'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same',
  'so', 'than', 'too', 'very', 'can', 'will', 'just', 'should', 'now',
  'would', 'could', 'also', 'like', 'really', 'get', 'got', 'go', 'going',
  'think', 'know', 'make', 'see', 'use', 'one', 'two', 'way', 'time', 'day',
  'lot', 'bit', 'quite', 'every', 'always', 'never', 'still', 'come', 'came',
  'want', 'need', 'something', 'anything', 'nothing', 'everything', 'someone',
  'anyone', 'thing', 'things', 'well', 'feel', 'felt', 'said', 'say', 'look',
  'take', 'give', 'put', 'seem', 'seemed', 'seems', 'back', 'around', 'much',
  'many', 'even', 'first', 'second', 'new', 'old', 'long', 'big', 'high',
  'last', 'next', 'often', 'right', 'left', 'might', 'must', 'shall', 'used',
  'using', 'made', 'makes', 'making', 'getting', 'looking', 'coming', 'taking',
  'let', 'try', 'tried', 'trying', 'keep', 'kept', 'start', 'started',
  'find', 'found', 'help', 'helped', 'different', 'another', 'place', 'since',
  'although', 'though', 'however',
])

type POSFilter = 'all' | 'nouns' | 'verbs' | 'adjectives' | 'adverbs'

// Each category has 3 readable shades: low → mid → high frequency
// All pass AA contrast (≥3:1) against white.
const POS_PALETTE: Record<POSFilter, [string, string, string]> = {
  nouns:      ['#818cf8', '#4f46e5', '#3730a3'], // indigo
  verbs:      ['#14b8a6', '#0d9488', '#0f766e'], // teal
  adjectives: ['#d97706', '#b45309', '#92400e'], // amber
  adverbs:    ['#a78bfa', '#7c3aed', '#6d28d9'], // violet
  all:        ['#818cf8', '#4f46e5', '#3730a3'], // indigo fallback for unclassified
}

// Dot colors for the legend (mid-tier of each palette)
const POS_LABEL_COLOR: Record<Exclude<POSFilter, 'all'>, string> = {
  nouns:      '#4f46e5',
  verbs:      '#0d9488',
  adjectives: '#b45309',
  adverbs:    '#7c3aed',
}

function posStroke(pos: POSFilter, ratio: number): string {
  const [light, mid, dark] = POS_PALETTE[pos]
  if (ratio > 0.6) return dark
  if (ratio > 0.3) return mid
  return light
}

interface CloudWord { text: string; count: number; ratio: number; pos: POSFilter }
interface Placement { x: number; y: number; r: number }
type WordAnswer = { answer: string; index: number; matches: number }

// Greedy tangent-placement packing: each new circle is placed tangent to an
// existing circle at whichever angle keeps the cluster closest to the origin.
function packCircles(radii: number[], gap = 4): Placement[] {
  const placed: Placement[] = []
  if (!radii.length) return placed
  placed.push({ x: 0, y: 0, r: radii[0] })

  for (let i = 1; i < radii.length; i++) {
    const r = radii[i]
    let best: { x: number; y: number } | null = null
    let bestDist = Infinity

    for (const anchor of placed) {
      const D = r + anchor.r + gap
      for (let a = 0; a < 72; a++) {
        const theta = (a / 72) * 2 * Math.PI
        const x = anchor.x + D * Math.cos(theta)
        const y = anchor.y + D * Math.sin(theta)
        const valid = placed.every((q) => {
          const dx = x - q.x, dy = y - q.y
          return dx * dx + dy * dy >= (r + q.r + gap) ** 2 - 0.1
        })
        if (valid) {
          const dist = x * x + y * y
          if (dist < bestDist) { bestDist = dist; best = { x, y } }
        }
      }
    }

    placed.push(best ? { ...best, r } : { x: placed[0].r + r + gap, y: 0, r })
  }

  return placed
}

export default function WordCloudChart({
  answers,
  questionId,
}: {
  answers: string[]
  questionId: string
}) {
  const [posFilter, setPosFilter] = useState<POSFilter>('all')
  const [topN, setTopN] = useState(10)
  const [excludedWords, setExcludedWords] = useState<string[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      const stored = window.localStorage.getItem(`wc-ex-${questionId}`)
      return stored ? JSON.parse(stored) as string[] : []
    } catch {
      return []
    }
  })
  const [words, setWords] = useState<CloudWord[]>([])
  const [loading, setLoading] = useState(true)
  const [hovered, setHovered] = useState<string | null>(null)
  const [selectedWord, setSelectedWord] = useState<string | null>(null)

  const processWords = useCallback(async () => {
    setLoading(true)
    const { default: nlp } = await import('compromise')

    const allTerms: string[] = []
    // When showing all POS, build a per-word POS map so bubbles can be coloured.
    const posTagMap = new Map<string, POSFilter>()

    for (const answer of answers) {
      if (!answer.trim()) continue
      const doc = nlp(answer)

      if (posFilter === 'all') {
        allTerms.push(...(doc.terms().out('array') as string[]))

        const posExtractors: [Exclude<POSFilter, 'all'>, string[]][] = [
          ['nouns',      doc.nouns().out('array')      as string[]],
          ['verbs',      doc.verbs().out('array')      as string[]],
          ['adjectives', doc.adjectives().out('array') as string[]],
          ['adverbs',    doc.adverbs().out('array')    as string[]],
        ]
        for (const [pos, phrases] of posExtractors) {
          for (const phrase of phrases) {
            for (const raw of phrase.toLowerCase().split(/\s+/)) {
              const w = raw.replace(/[^a-z]/g, '')
              if (w && !posTagMap.has(w)) posTagMap.set(w, pos)
            }
          }
        }
      } else {
        const terms =
          posFilter === 'nouns'      ? doc.nouns().out('array')      as string[] :
          posFilter === 'verbs'      ? doc.verbs().out('array')      as string[] :
          posFilter === 'adjectives' ? doc.adjectives().out('array') as string[] :
                                       doc.adverbs().out('array')    as string[]
        allTerms.push(...terms)
      }
    }

    const counts = new Map<string, number>()
    for (const phrase of allTerms) {
      for (const raw of phrase.toLowerCase().split(/\s+/)) {
        const word = raw.replace(/[^a-z]/g, '')
        if (word.length < 3 || STOP_WORDS.has(word) || excludedWords.includes(word)) continue
        counts.set(word, (counts.get(word) ?? 0) + 1)
      }
    }

    const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, topN)
    if (!sorted.length) { setWords([]); setLoading(false); return }

    const maxCount = sorted[0][1]
    const minCount = sorted[sorted.length - 1][1]
    const range = maxCount - minCount || 1

    setWords(sorted.map(([text, count]) => ({
      text,
      count,
      ratio: (count - minCount) / range,
      pos: posFilter === 'all' ? (posTagMap.get(text) ?? 'all') : posFilter,
    })))
    setLoading(false)
  }, [answers, posFilter, topN, excludedWords])

  useEffect(() => {
    // Word classification is async because compromise is loaded only when needed.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void processWords()
  }, [processWords])

  useEffect(() => {
    if (selectedWord && !words.some((word) => word.text === selectedWord)) setSelectedWord(null)
  }, [selectedWord, words])

  const placements = useMemo(() => {
    if (!words.length) return []
    const baseRadius = topN <= 10 ? 34 : topN <= 25 ? 26 : 20
    const radiusRange = topN <= 10 ? 58 : topN <= 25 ? 44 : 34
    const radii = words.map((w) => Math.round(baseRadius + w.ratio * radiusRange))
    return packCircles(radii, topN <= 10 ? 7 : 5)
  }, [topN, words])

  const viewBox = useMemo(() => {
    if (!placements.length) return '0 0 400 300'
    const pad = 12
    const minX = Math.min(...placements.map((p) => p.x - p.r)) - pad
    const maxX = Math.max(...placements.map((p) => p.x + p.r)) + pad
    const minY = Math.min(...placements.map((p) => p.y - p.r)) - pad
    const maxY = Math.max(...placements.map((p) => p.y + p.r)) + pad
    return `${minX} ${minY} ${maxX - minX} ${maxY - minY}`
  }, [placements])

  // Which POS categories are present in the current words (for legend)
  const activePOS = useMemo(() => {
    const seen = new Set(words.map((w) => w.pos).filter((p) => p !== 'all'))
    return (['nouns', 'verbs', 'adjectives', 'adverbs'] as const).filter((p) => seen.has(p))
  }, [words])

  const selectedWordAnswers = useMemo<WordAnswer[]>(() => {
    if (!selectedWord) return []
    const pattern = new RegExp(`\\b${selectedWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi')
    return answers.flatMap((answer, index) => {
      const matches = answer.match(pattern)?.length ?? 0
      return matches > 0 ? [{ answer, index, matches }] : []
    })
  }, [answers, selectedWord])

  const selectedWordData = useMemo(
    () => selectedWord ? words.find((word) => word.text === selectedWord) ?? null : null,
    [selectedWord, words]
  )

  const excludeWord = (word: string) => {
    const next = [...excludedWords, word]
    setExcludedWords(next)
    try { localStorage.setItem(`wc-ex-${questionId}`, JSON.stringify(next)) } catch {}
  }

  const restoreWord = (word: string) => {
    const next = excludedWords.filter((w) => w !== word)
    setExcludedWords(next)
    try { localStorage.setItem(`wc-ex-${questionId}`, JSON.stringify(next)) } catch {}
  }

  const highlightedAnswerParts = (answer: string, word: string) => {
    const pattern = new RegExp(`(\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b)`, 'gi')
    return answer.split(pattern).map((part, index) => (
      part.toLowerCase() === word.toLowerCase()
        ? <mark key={index} className="rounded bg-indigo-100 px-0.5 font-semibold text-indigo-900">{part}</mark>
        : <span key={index}>{part}</span>
    ))
  }

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-lg border border-[var(--border)]">
          {([10, 25, 50] as const).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setTopN(n)}
              className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                topN === n
                  ? 'bg-[var(--accent)] text-[var(--text-on-accent)]'
                  : 'bg-white text-[var(--text-secondary)] hover:bg-[var(--bg-sunken)]'
              }`}
            >
              Top {n}
            </button>
          ))}
        </div>
        <div className="flex overflow-hidden rounded-lg border border-[var(--border)]">
          {(['all', 'nouns', 'verbs', 'adjectives', 'adverbs'] as const).map((pos) => (
            <button
              key={pos}
              type="button"
              onClick={() => setPosFilter(pos)}
              className={`px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
                posFilter === pos
                  ? 'bg-[var(--accent)] text-[var(--text-on-accent)]'
                  : 'bg-white text-[var(--text-secondary)] hover:bg-[var(--bg-sunken)]'
              }`}
            >
              {pos}
            </button>
          ))}
        </div>
      </div>

      {/* Bubble chart */}
      <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-white">
        {loading ? (
          <div className="flex h-48 items-center justify-center">
            <p className="text-sm text-[var(--text-tertiary)]">Analysing…</p>
          </div>
        ) : words.length === 0 ? (
          <div className="flex h-32 items-center justify-center">
            <p className="text-sm text-[var(--text-tertiary)]">No words to display for this filter.</p>
          </div>
        ) : (
          <>
            <svg
              viewBox={viewBox}
              className="w-full"
              style={{ height: topN <= 10 ? '360px' : '400px', maxHeight: '44vh', minHeight: '300px' }}
            >
              {words.map((word, i) => {
                const p = placements[i]
                if (!p) return null
                const stroke = posStroke(word.pos, word.ratio)
                const isHovered = hovered === word.text || selectedWord === word.text
                const textSize = Math.min(14, Math.max(8, (p.r * 1.55) / Math.max(3, word.text.length)))
                return (
                  <g
                    key={word.text}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setSelectedWord((current) => current === word.text ? null : word.text)}
                    onMouseEnter={() => setHovered(word.text)}
                    onMouseLeave={() => setHovered(null)}
                  >
                    <title>{word.text} · {word.count} {word.count === 1 ? 'mention' : 'mentions'} — click to inspect answers</title>
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r={p.r}
                      fill={selectedWord === word.text ? '#eef2ff' : isHovered ? '#f8fafc' : 'white'}
                      stroke={stroke}
                      strokeWidth={selectedWord === word.text ? 3 : isHovered ? 2.5 : 1.5}
                    />
                    <text
                      x={p.x}
                      y={p.y}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill={stroke}
                      fontSize={textSize}
                      fontWeight="500"
                      fontFamily="inherit"
                      style={{ userSelect: 'none', pointerEvents: 'none' }}
                    >
                      {word.text}
                    </text>
                  </g>
                )
              })}
            </svg>

            {/* POS legend — only shown in All mode when multiple categories present */}
            {posFilter === 'all' && activePOS.length > 1 && (
              <div className="flex flex-wrap gap-3 border-t border-[var(--border-subtle)] px-5 py-3">
                {activePOS.map((pos) => (
                  <span key={pos} className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full border-2"
                      style={{ borderColor: POS_LABEL_COLOR[pos] }}
                    />
                    <span className="capitalize">{pos}</span>
                  </span>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {selectedWord && selectedWordData && (
        <div className="rounded-xl border border-[var(--border)] bg-white">
          <div className="flex flex-col gap-3 border-b border-[var(--border-subtle)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-[var(--text)]">
                “{selectedWord}”
                <span className="ml-2 font-normal text-[var(--text-tertiary)]">
                  {selectedWordData.count} {selectedWordData.count === 1 ? 'mention' : 'mentions'} in {selectedWordAnswers.length} {selectedWordAnswers.length === 1 ? 'answer' : 'answers'}
                </span>
              </p>
              <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">
                Use this as a path into the raw responses, not as a conclusion by itself.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                excludeWord(selectedWord)
                setSelectedWord(null)
              }}
              className="inline-flex h-9 items-center justify-center rounded-xl border border-[var(--border)] bg-white px-3 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-sunken)]"
            >
              Hide word
            </button>
          </div>
          <div className="max-h-64 divide-y divide-[var(--border-subtle)] overflow-y-auto">
            {selectedWordAnswers.map(({ answer, index, matches }) => (
              <div key={`${selectedWord}-${index}`} className="px-4 py-3">
                <div className="mb-1 flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold text-[var(--text-tertiary)]">Answer {index + 1}</p>
                  {matches > 1 && <p className="text-xs text-[var(--text-muted)]">{matches} mentions</p>}
                </div>
                <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
                  {highlightedAnswerParts(answer, selectedWord)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Excluded words */}
      {excludedWords.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs text-[var(--text-tertiary)]">Excluded — click to restore</p>
          <div className="flex flex-wrap gap-1.5">
            {excludedWords.map((word) => (
              <button
                key={word}
                type="button"
                onClick={() => restoreWord(word)}
                className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--bg-sunken)] px-2.5 py-1 text-xs text-[var(--text-tertiary)] transition-colors hover:border-[var(--accent-muted)] hover:text-[var(--text-link)]"
              >
                {word}
                <span aria-hidden className="text-[var(--text-muted)]">+</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
