/**
 * Orders choice options, including deterministic randomization for participant-facing question choices.
 */
export const OTHER_SENTINEL = '__OTHER__'

function hashString(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function seededRandom(seed: number) {
  let state = seed
  return () => {
    state += 0x6D2B79F5
    let next = state
    next = Math.imul(next ^ (next >>> 15), next | 1)
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61)
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296
  }
}

export function regularChoiceOptions(options: string[]) {
  return options.filter((option) => option !== OTHER_SENTINEL)
}

export function orderedChoiceOptions({
  options,
  randomize,
  seed,
}: {
  options: string[]
  randomize?: boolean
  seed: string
}) {
  const regularOptions = regularChoiceOptions(options)
  if (!randomize || regularOptions.length < 2) return regularOptions

  const shuffled = [...regularOptions]
  const random = seededRandom(hashString(`${seed}:${regularOptions.join('|')}`))
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    ;[shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]]
  }
  return shuffled
}
