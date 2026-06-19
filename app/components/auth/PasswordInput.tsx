'use client'

import { useState } from 'react'
import type { InputHTMLAttributes, ReactNode } from 'react'
import { EyeIcon, EyeOffIcon, TextInput } from '@/app/components/ui'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  label: string
  labelAction?: ReactNode
}

export default function PasswordInput({ label, labelAction, id, className = '', ...props }: Props) {
  const [visible, setVisible] = useState(false)
  const inputId = id ?? props.name
  const toggleLabel = visible ? 'Hide typed characters' : 'Show typed characters'

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <label htmlFor={inputId} className="block text-sm font-medium text-slate-700">{label}</label>
        {labelAction}
      </div>
      <div className="relative">
        <TextInput
          {...props}
          id={inputId}
          type={visible ? 'text' : 'password'}
          className={`pr-12 ${className}`}
        />
        <button
          type="button"
          aria-label={toggleLabel}
          title={toggleLabel}
          aria-pressed={visible}
          onClick={() => setVisible((current) => !current)}
          className="interactive-press absolute right-1.5 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--bg-surface)] hover:text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-ring)]"
        >
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
    </div>
  )
}
