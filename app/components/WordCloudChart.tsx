'use client'

import { useCallback, useEffect, useState } from 'react'

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
  'although', 'though', 'however', 'that', 'those', 'its',
])

type POSFilter = 'all' | 'nouns' | 'verbs' | 'adjectives' | 'adverbs'
interface CloudWord { text: string; count: number; fontSize: number }

// 5-tier indigo palette mapped to frequency ratio (0–1)
function bubbleStyle(ratio: number): { backgroundColor: string; color: string } {
  if (ratio > 0.8) return { backgroundColor: '#4338ca', color: '#ffffff' }
  if (ratio > 0.6) return { backgroundColor: '#4f46e5', color: '#ffffff' }
  if (ratio > 0.4) return { backgroundColor: '#818cf8', color: '#ffffff' }
  if (ratio > 0.2) return { backgroundColor: '#a5b4fc', color: '#3730a3' }
  return { backgroundColor: '#c7d2fe', color: '#3730a3' }
}

export default function WordCloudChart({
  answers,
  questionId,
}: {
  answers: string[]
  questionId: string
}) {
  const [posFilter, setPosFilter] = useState<POSFilter>('all')
  const [topN, setTopN] = useState(25)
  const [excludedWords, setExcludedWords] = useState<string[]>([])
  const [words, setWords] = useState<CloudWord[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(`wc-ex-${questionId}`)
      if (stored) setExcludedWords(JSON.parse(stored) as string[])
    } catch {}
  }, [questionId])

  const processWords = useCallback(async () => {
    setLoading(true)
    const { default: nlp } = await import('compromise')

    const allTerms: string[] = []
    for (const answer of answers) {
      if (!answer.trim()) continue
      const doc = nlp(answer)
      let terms: string[]
      if (posFilter === 'nouns') {
        terms = doc.nouns().out('array') as string[]
      } else if (posFilter === 'verbs') {
        terms = doc.verbs().out('array') as string[]
      } else if (posFilter === 'adjectives') {
        terms = doc.adjectives().out('array') as string[]
      } else if (posFilter === 'adverbs') {
        terms = doc.adverbs().out('array') as string[]
      } else {
        terms = doc.terms().out('array') as string[]
      }
      allTerms.push(...terms)
    }

    const counts = new Map<string, number>()
    for (const phrase of allTerms) {
      for (const raw of phrase.toLowerCase().split(/\s+/)) {
        const word = raw.replace(/[^a-z]/g, '')
        if (word.length < 3) continue
        if (STOP_WORDS.has(word)) continue
        if (excludedWords.includes(word)) continue
        counts.set(word, (counts.get(word) ?? 0) + 1)
      }
    }

    const sorted = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, topN)

    if (!sorted.length) {
      setWords([])
      setLoading(false)
      return
    }

    const maxCount = sorted[0][1]
    const minCount = sorted[sorted.length - 1][1]
    const range = maxCount - minCount || 1

    setWords(
      sorted.map(([text, count]) => ({
        text,
        count,
        fontSize: 12 + ((count - minCount) / range) * 24,
      }))
    )
    setLoading(false)
  }, [answers, posFilter, topN, excludedWords])

  useEffect(() => { void processWords() }, [processWords])

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

  return (
    <div className="space-y-3">
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

      <div className="min-h-36 rounded-xl border border-[var(--border)] bg-white p-5">
        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <p className="text-sm text-[var(--text-tertiary)]">Analysing…</p>
          </div>
        ) : words.length === 0 ? (
          <p className="text-sm text-[var(--text-tertiary)]">No words to display for this filter.</p>
        ) : (
          <div className="flex flex-wrap items-center justify-center gap-3">
            {words.map((word) => {
              const ratio = (word.fontSize - 12) / 24
              const size = Math.round(52 + ratio * 64)
              const charFactor = word.text.length <= 4 ? 0.22 : word.text.length <= 7 ? 0.17 : 0.13
              const textSize = Math.round(Math.min(15, Math.max(8, size * charFactor)))
              return (
                <button
                  key={word.text}
                  type="button"
                  onClick={() => excludeWord(word.text)}
                  title={`${word.count} ${word.count === 1 ? 'occurrence' : 'occurrences'} — click to remove`}
                  className="shrink-0 overflow-hidden rounded-full font-semibold transition-transform hover:scale-95"
                  style={{
                    width: `${size}px`,
                    height: `${size}px`,
                    fontSize: `${textSize}px`,
                    lineHeight: 1.2,
                    padding: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textAlign: 'center',
                    overflowWrap: 'break-word',
                    ...bubbleStyle(ratio),
                  }}
                >
                  {word.text}
                </button>
              )
            })}
          </div>
        )}
      </div>

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
