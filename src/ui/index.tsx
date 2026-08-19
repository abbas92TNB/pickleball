import type { ButtonHTMLAttributes, ReactNode } from 'react'

// ---------------------------------------------------------------------------
// Shared visual primitives. Everything is dark, high-contrast and big-thumbed:
// this gets used one-handed, outdoors, on a phone, by someone out of breath.
// ---------------------------------------------------------------------------

export function PageShell({
  children,
  wide = false,
}: {
  children: ReactNode
  wide?: boolean
}) {
  return (
    <div className={`mx-auto w-full px-4 pt-4 safe-b ${wide ? 'max-w-6xl' : 'max-w-2xl'}`}>
      {children}
    </div>
  )
}

export function Card({
  children,
  className = '',
  glow = false,
}: {
  children: ReactNode
  className?: string
  glow?: boolean
}) {
  return (
    <div
      className={`rounded-2xl border bg-court-900/80 backdrop-blur shadow-card ${
        glow ? 'border-lime/50 shadow-glow' : 'border-court-700/70'
      } ${className}`}
    >
      {children}
    </div>
  )
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'danger' | 'subtle'
  size?: 'sm' | 'md' | 'lg'
}

export function Btn({ variant = 'primary', size = 'md', className = '', ...rest }: BtnProps) {
  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2.5 text-sm',
    lg: 'px-5 py-3.5 text-base',
  }[size]
  const variants = {
    primary: 'bg-lime text-court-950 hover:bg-lime-soft active:scale-[.98] font-bold',
    subtle: 'bg-court-700 text-slate-100 hover:bg-court-600 active:scale-[.98] font-semibold',
    ghost:
      'bg-transparent border border-court-700 text-slate-300 hover:border-court-600 hover:text-slate-100 font-semibold',
    danger: 'bg-flame/15 border border-flame/40 text-flame hover:bg-flame/25 font-semibold',
  }[variant]
  return (
    <button
      {...rest}
      className={`rounded-xl transition disabled:opacity-40 disabled:pointer-events-none ${sizes} ${variants} ${className}`}
    />
  )
}

export function Pill({
  children,
  tone = 'slate',
  className = '',
}: {
  children: ReactNode
  tone?: 'slate' | 'lime' | 'aqua' | 'flame' | 'grape' | 'gold'
  className?: string
}) {
  const tones = {
    slate: 'bg-court-700/60 text-slate-300 border-court-600',
    lime: 'bg-lime/15 text-lime border-lime/40',
    aqua: 'bg-aqua/15 text-aqua border-aqua/40',
    flame: 'bg-flame/15 text-flame border-flame/40',
    grape: 'bg-grape/15 text-grape border-grape/40',
    gold: 'bg-gold/15 text-gold border-gold/40',
  }[tone]
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide ${tones} ${className}`}
    >
      {children}
    </span>
  )
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-3 mt-6 flex items-end justify-between gap-3">
      <h2 className="font-display text-xs uppercase tracking-[0.18em] text-slate-400">{children}</h2>
      {right}
    </div>
  )
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-12 text-slate-400">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-court-600 border-t-lime" />
      {label && <span className="text-sm">{label}</span>}
    </div>
  )
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <Card className="p-8 text-center">
      <p className="font-display text-base text-slate-300">{title}</p>
      {hint && <p className="mt-2 text-sm text-slate-500">{hint}</p>}
    </Card>
  )
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-400">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  )
}

/** Big number + caption, used on the plan summary and the stats page. */
export function Stat({
  value,
  label,
  tone = 'slate',
}: {
  value: ReactNode
  label: string
  tone?: 'slate' | 'lime' | 'aqua' | 'flame'
}) {
  const colour = {
    slate: 'text-slate-100',
    lime: 'text-lime',
    aqua: 'text-aqua',
    flame: 'text-flame',
  }[tone]
  return (
    <div className="rounded-xl border border-court-700/60 bg-court-850/60 px-3 py-2.5">
      <div className={`font-display text-xl tabnum leading-tight ${colour}`}>{value}</div>
      <div className="mt-0.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </div>
    </div>
  )
}

/** Coloured initial disc. No photo uploads in this app - names only. */
export function Dot({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  const palette = ['#c8ff3c', '#38e1ff', '#a78bfa', '#ff7a45', '#ffc93c', '#5eead4', '#f472b6']
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 9973
  const colour = palette[h % palette.length]
  const dim = { sm: 'h-6 w-6 text-[10px]', md: 'h-8 w-8 text-xs', lg: 'h-11 w-11 text-sm' }[size]
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-display text-court-950 ${dim}`}
      style={{ backgroundColor: colour }}
      aria-hidden
    >
      {name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  )
}
