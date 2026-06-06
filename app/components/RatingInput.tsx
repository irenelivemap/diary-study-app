'use client'
import { useState } from 'react'

type Props = {
  name: string
  min: number
  max: number
  scaleType: string
  labels: string[]
  required?: boolean
  onChange?: (val: string) => void
  dataPage?: number
}

export default function RatingInput({ name, min, max, scaleType, labels, required, onChange, dataPage }: Props) {
  const [vasValue, setVasValue] = useState<number | null>(null)
  const steps = Array.from({ length: max - min + 1 }, (_, i) => i + min)

  if (scaleType === 'vas') {
    const leftLabel = labels[0] ?? ''
    const rightLabel = labels[1] ?? ''
    return (
      <div className="space-y-3">
        <div className="flex justify-between text-xs text-slate-500 px-1">
          <span>{leftLabel}</span>
          <span>{rightLabel}</span>
        </div>
        <input
          type="range"
          name={name}
          min={min}
          max={max}
          required={required}
          data-page={dataPage}
          defaultValue={Math.round((min + max) / 2)}
          onChange={(e) => { setVasValue(Number(e.target.value)); onChange?.(e.target.value) }}
          className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
        />
        <div className="flex justify-between text-xs text-slate-400 px-1">
          <span>{min}</span>
          {vasValue !== null && (
            <span className="text-indigo-600 font-medium">{vasValue}</span>
          )}
          <span>{max}</span>
        </div>
      </div>
    )
  }

  if (scaleType === 'labels_only') {
    return (
      <div className="flex flex-wrap gap-2">
        {steps.map((val, i) => {
          const label = labels[i] ?? String(val)
          return (
            <label key={val} className="cursor-pointer">
              <input type="radio" name={name} value={String(val)} required={required} data-page={dataPage} onChange={(e) => onChange?.(e.target.value)} className="sr-only peer" />
              <span className="inline-flex items-center justify-center px-4 py-2 rounded-lg border border-slate-300 text-sm text-slate-700 peer-checked:bg-indigo-600 peer-checked:text-white peer-checked:border-indigo-600 hover:border-indigo-400 transition-colors cursor-pointer">
                {label}
              </span>
            </label>
          )
        })}
      </div>
    )
  }

  if (scaleType === 'numbers_labeled') {
    return (
      <div className="flex flex-wrap gap-3">
        {steps.map((val, i) => {
          const label = labels[i] ?? ''
          return (
            <label key={val} className="flex flex-col items-center gap-1 cursor-pointer">
              <input type="radio" name={name} value={String(val)} required={required} data-page={dataPage} onChange={(e) => onChange?.(e.target.value)} className="sr-only peer" />
              <span className="w-12 h-12 flex items-center justify-center rounded-xl border border-slate-300 text-sm font-medium text-slate-700 peer-checked:bg-indigo-600 peer-checked:text-white peer-checked:border-indigo-600 hover:border-indigo-400 transition-colors cursor-pointer">
                {val}
              </span>
              {label && (
                <span className="text-xs text-slate-500 text-center max-w-[4rem] leading-tight">{label}</span>
              )}
            </label>
          )
        })}
      </div>
    )
  }

  // default: numbers only
  return (
    <div>
      <div className="flex gap-2 flex-wrap">
        {steps.map((val) => (
          <label key={val} className="cursor-pointer">
            <input type="radio" name={name} value={String(val)} required={required} data-page={dataPage} onChange={(e) => onChange?.(e.target.value)} className="sr-only peer" />
            <span className="w-12 h-12 flex items-center justify-center rounded-xl border border-slate-300 text-sm font-medium text-slate-700 peer-checked:bg-indigo-600 peer-checked:text-white peer-checked:border-indigo-600 hover:border-indigo-400 transition-colors cursor-pointer">
              {val}
            </span>
          </label>
        ))}
      </div>
      <div className="flex justify-between text-xs text-slate-400 mt-1 px-1">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  )
}
