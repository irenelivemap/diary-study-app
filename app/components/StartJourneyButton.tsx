'use client'

import { useFormStatus } from 'react-dom'
import type { ReactNode } from 'react'
import { Button } from '@/app/components/ui'

export default function StartJourneyButton({
  children,
  pendingLabel = 'Opening...',
  tone = 'primary',
  size = 'lg',
  className = '',
}: {
  children: ReactNode
  pendingLabel?: string
  tone?: 'primary' | 'secondary'
  size?: 'md' | 'lg'
  className?: string
}) {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" tone={tone} size={size} disabled={pending} className={className}>
      {pending ? pendingLabel : children}
    </Button>
  )
}
