import Link from 'next/link'
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'

type ButtonTone = 'primary' | 'secondary' | 'ghost' | 'danger' | 'trash'
type ButtonSize = 'sm' | 'md' | 'lg'

const BUTTON_TONES: Record<ButtonTone, string> = {
  primary: 'bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700 hover:border-indigo-700 shadow-sm',
  secondary: 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50 hover:border-slate-400',
  ghost: 'bg-transparent text-slate-600 border-transparent hover:bg-slate-100 hover:text-slate-900',
  danger: 'bg-red-50 text-red-700 border-red-100 hover:bg-red-100 hover:border-red-200',
  trash: 'bg-white text-slate-600 border-slate-200 hover:bg-red-50 hover:text-red-700 hover:border-red-200',
}

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-sm rounded-lg',
  md: 'h-10 px-4 text-sm rounded-xl',
  lg: 'h-12 px-5 text-base rounded-xl',
}

export function Button({
  children,
  tone = 'primary',
  size = 'md',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: ButtonTone; size?: ButtonSize }) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 border font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${BUTTON_TONES[tone]} ${BUTTON_SIZES[size]} ${className}`}
    >
      {children}
    </button>
  )
}

export function ButtonLink({
  children,
  href,
  tone = 'primary',
  size = 'md',
  className = '',
}: {
  children: ReactNode
  href: string
  tone?: ButtonTone
  size?: ButtonSize
  className?: string
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center justify-center gap-2 border font-semibold transition-colors ${BUTTON_TONES[tone]} ${BUTTON_SIZES[size]} ${className}`}
    >
      {children}
    </Link>
  )
}

export function IconButton({
  children,
  label,
  tone = 'ghost',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; tone?: ButtonTone }) {
  return (
    <button
      {...props}
      type={props.type ?? 'button'}
      aria-label={label}
      title={label}
      className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${BUTTON_TONES[tone]} ${className}`}
    >
      {children}
    </button>
  )
}

export function TrashIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v5" />
      <path d="M14 11v5" />
    </svg>
  )
}

type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'bg-slate-100 text-slate-700',
  info: 'bg-indigo-50 text-indigo-700',
  success: 'bg-emerald-50 text-emerald-700',
  warning: 'bg-amber-50 text-amber-800',
  danger: 'bg-red-50 text-red-700',
}

export function Badge({ children, tone = 'neutral', className = '' }: {
  children: ReactNode
  tone?: BadgeTone
  className?: string
}) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-medium ${BADGE_TONES[tone]} ${className}`}>
      {children}
    </span>
  )
}

export function SwitchButton({
  checked,
  children,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { checked: boolean }) {
  return (
    <button
      {...props}
      type={props.type ?? 'button'}
      aria-pressed={checked}
      className={`inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-sm font-medium transition-colors ${
        checked
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
      } ${className}`}
    >
      <span className={`h-2.5 w-2.5 rounded-full ${checked ? 'bg-emerald-500' : 'bg-slate-400'}`} />
      {children}
    </button>
  )
}

export function SwitchVisual({ checked }: { checked: boolean }) {
  return (
    <span className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${checked ? 'bg-indigo-600' : 'bg-slate-300'}`}>
      <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </span>
  )
}

export function TextInput({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 placeholder-slate-500 transition-colors focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 ${className}`}
    />
  )
}

// ── Eyebrow ──────────────────────────────────────────────
export function Eyebrow({ children, wide, tight, className = '' }: {
  children: ReactNode
  wide?: boolean
  tight?: boolean
  className?: string
}) {
  const cls = tight ? 'eyebrow-tight' : wide ? 'eyebrow-wide' : 'eyebrow'
  return <p className={`${cls} ${className}`}>{children}</p>
}

// ── Editorial headline ───────────────────────────────────
// Pipe-delimited sections render in serif italic: "Lit all the |way| home."
export function EditorialHeadline({ template, size = 'md', className = '' }: {
  template: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}) {
  const sizeMap = { sm: 'text-xl', md: 'text-2xl', lg: 'text-3xl', xl: 'text-4xl' }
  const parts = template.split('|')
  return (
    <p className={`editorial ${sizeMap[size]} ${className}`}>
      {parts.map((part, i) =>
        i % 2 === 1 ? <em key={i}>{part}</em> : part
      )}
    </p>
  )
}

// ── Stat strip ───────────────────────────────────────────
export function StatStrip({ stats, className = '' }: {
  stats: { value: string | number; caption: string }[]
  className?: string
}) {
  return (
    <div className={`flex items-end gap-5 ${className}`}>
      {stats.map(({ value, caption }, i) => (
        <div key={i} className="flex flex-col gap-0.5">
          <span className="stat-value text-lg">{value}</span>
          <span className="stat-caption">{caption}</span>
        </div>
      ))}
    </div>
  )
}

// ── Chip ─────────────────────────────────────────────────
const TONE_MAP: Record<string, string> = {
  default: 'bg-slate-100 text-slate-600',
  indigo:  'bg-indigo-50 text-indigo-600',
  emerald: 'bg-emerald-50 text-emerald-600',
  amber:   'bg-amber-50 text-amber-700',
  red:     'bg-red-50 text-red-500',
  slate:   'bg-slate-100 text-slate-500',
}

export function Chip({ children, tone = 'default', className = '' }: {
  children: ReactNode
  tone?: keyof typeof TONE_MAP
  className?: string
}) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold tracking-wide uppercase px-2 py-0.5 rounded-full ${TONE_MAP[tone] ?? TONE_MAP.default} ${className}`}>
      {children}
    </span>
  )
}

// ── Tile header ──────────────────────────────────────────
export function TileHeader({ eyebrow, meta, headline, lead }: {
  eyebrow?: ReactNode
  meta?: ReactNode
  headline: ReactNode
  lead?: ReactNode
}) {
  return (
    <div className="space-y-1.5">
      {(eyebrow || meta) && (
        <div className="flex items-center justify-between">
          {eyebrow && <span className="eyebrow">{eyebrow}</span>}
          {meta && <span className="fine">{meta}</span>}
        </div>
      )}
      {headline}
      {lead && <p className="fine leading-relaxed">{lead}</p>}
    </div>
  )
}

// ── Card surface ─────────────────────────────────────────
export function Card({ children, className = '', padded = true }: {
  children: ReactNode
  className?: string
  padded?: boolean
}) {
  return (
    <div className={`bg-white rounded-2xl border border-slate-100 shadow-sm ${padded ? 'p-5' : ''} ${className}`}>
      {children}
    </div>
  )
}

// ── CTA footer ───────────────────────────────────────────
export function CTA({ children, href, className = '' }: {
  children: ReactNode
  href?: string
  className?: string
}) {
  const base = `flex items-center w-full text-sm font-semibold text-[var(--color-accent)] pt-3 mt-3 border-t border-slate-100 group ${className}`
  if (href) {
    return (
      <a href={href} className={base}>
        <span>{children}</span>
      </a>
    )
  }
  return (
    <div className={base}>
      <span>{children}</span>
    </div>
  )
}
