'use client'
/**
 * Date/time input with a quick action for using the current time.
 */

import { useState } from 'react'
import { Button } from '@/app/components/ui'

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function localDateTimeValue(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export default function DateTimeNowInput({
  name,
  required,
  dataPage,
  onValueChange,
}: {
  name?: string
  required?: boolean
  dataPage?: number
  onValueChange: (value: string) => void
}) {
  const [value, setValue] = useState('')

  function updateValue(nextValue: string) {
    setValue(nextValue)
    onValueChange(nextValue)
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <input
        type="datetime-local"
        name={name}
        value={value}
        required={required}
        data-page={dataPage}
        onChange={(event) => updateValue(event.target.value)}
        className="min-h-12 w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-3 text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
      <Button
        type="button"
        tone="secondary"
        size="lg"
        className="shrink-0 sm:w-auto"
        onClick={() => updateValue(localDateTimeValue())}
      >
        Now
      </Button>
    </div>
  )
}
