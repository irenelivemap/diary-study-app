export const PHASE_COLORS = [
  {
    solid: 'bg-blue-500 text-white',
    soft: 'bg-blue-50 text-blue-700 ring-blue-100',
    border: 'border-blue-200',
  },
  {
    solid: 'bg-violet-500 text-white',
    soft: 'bg-violet-50 text-violet-700 ring-violet-100',
    border: 'border-violet-200',
  },
  {
    solid: 'bg-teal-600 text-white',
    soft: 'bg-teal-50 text-teal-700 ring-teal-100',
    border: 'border-teal-200',
  },
  {
    solid: 'bg-amber-500 text-white',
    soft: 'bg-amber-50 text-amber-800 ring-amber-100',
    border: 'border-amber-200',
  },
  {
    solid: 'bg-rose-500 text-white',
    soft: 'bg-rose-50 text-rose-700 ring-rose-100',
    border: 'border-rose-200',
  },
  {
    solid: 'bg-cyan-600 text-white',
    soft: 'bg-cyan-50 text-cyan-700 ring-cyan-100',
    border: 'border-cyan-200',
  },
  {
    solid: 'bg-slate-600 text-white',
    soft: 'bg-slate-100 text-slate-700 ring-slate-200',
    border: 'border-slate-300',
  },
  {
    solid: 'bg-purple-600 text-white',
    soft: 'bg-purple-50 text-purple-700 ring-purple-100',
    border: 'border-purple-200',
  },
] as const

export function phaseColor(index: number) {
  return PHASE_COLORS[index % PHASE_COLORS.length]
}

export function phaseBadgeClass(index: number) {
  return phaseColor(index).solid
}

export function phaseSoftBadgeClass(index: number) {
  const color = phaseColor(index)
  return `${color.soft} ring-1`
}
