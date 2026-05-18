'use client'

import type { Pitch } from '@/lib/types/pitch'
import type { Deal } from '@/lib/types/deal'
import { formatCurrencyAmount } from '@/lib/pitch-stats'

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

function shortDate(iso: string): string {
  const d = new Date(iso)
  return `${MONTHS[d.getMonth()]} ${String(d.getDate()).padStart(2, '0')}`
}

// CR-2 AC4.8 — compensation-tag display labels for PitchCard right-slot.
// Standalone form: `Cash` / `Gifting` / `Collab` / `Unspecified`.
// Suffix form: `+ Gift` / `+ Collab` / `+ Unspecified` (cash never appears
// in suffix form since the cash branch renders the amount itself).
const COMP_LABEL_FULL: Record<string, string> = {
  cash: 'Cash',
  gifting: 'Gifting',
  collaboration: 'Collab',
  unspecified: 'Unspecified',
}
const COMP_LABEL_SUFFIX: Record<string, string> = {
  gifting: 'Gift',
  collaboration: 'Collab',
  unspecified: 'Unspecified',
}
// Priority order for the rare cash + 2+ non-cash case (3-tag edge).
const NON_CASH_PRIORITY = ['collaboration', 'gifting', 'unspecified'] as const

function pickPriorityNonCash(nonCash: string[]): string | null {
  for (const p of NON_CASH_PRIORITY) {
    if (nonCash.includes(p)) return p
  }
  return nonCash[0] ?? null
}

interface PitchCardProps {
  pitch: Pitch
  /** Deal that anchors this card on the board. Card budget reads from
   *  `deal.current_budget_*` (the negotiated state), NOT the original
   *  `pitch.budget_*` snapshot. Per FR-4 S6 (AC6.1). */
  deal: Deal
  /** CR-2 — pitch tag slugs. Drives the AC4.8 right-slot compensation
   *  indicator. Legitimacy tags do NOT surface on PitchCard (the board is
   *  deal-sourced; legitimacy is implicit `valid` for every card).
   *  Empty/missing → renders `—` muted fallback. */
  tags: string[]
  onClick: () => void
  spotlight?: boolean
}

export function PitchCard({
  pitch,
  deal,
  tags,
  onClick,
  spotlight = false,
}: PitchCardProps) {
  const hasAmount =
    deal.current_budget_amount !== null &&
    deal.current_budget_amount > 0 &&
    deal.current_budget_currency !== null
  const amount = hasAmount
    ? `${formatCurrencyAmount(deal.current_budget_currency!.trim().toUpperCase(), deal.current_budget_amount!)} ${deal.current_budget_currency!.trim().toUpperCase()}`
    : '—'

  const hasCash = tags.includes('cash')
  const nonCash = tags.filter(
    (t) => t === 'gifting' || t === 'collaboration' || t === 'unspecified',
  )

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
      className={
        'card has-dir' + (spotlight ? ' is-spotlight' : '')
      }
      aria-label={`Open ${pitch.direction} pitch from ${pitch.brand_name ?? 'unknown brand'}`}
    >
      <span
        className={
          'card-dir' + (pitch.direction === 'outbound' ? ' is-outbound' : '')
        }
        aria-label={pitch.direction}
      >
        <span aria-hidden>{pitch.direction === 'outbound' ? '↗' : '↘'}</span>
        {pitch.direction === 'outbound' ? 'Out' : 'In'}
      </span>
      <div className="card-r1">
        <span className="card-brand">{pitch.brand_name ?? 'Unknown brand'}</span>
        <CardAmtSlot
          hasAmount={hasAmount}
          hasCash={hasCash}
          nonCash={nonCash}
          amount={amount}
        />
      </div>
      <div className="card-summary">{pitch.ai_summary ?? '—'}</div>
      <div className="card-foot">
        <span>{shortDate(pitch.created_at)}</span>
      </div>
    </div>
  )
}

// AC4.8 6-case render matrix in one place.
function CardAmtSlot({
  hasAmount,
  hasCash,
  nonCash,
  amount,
}: {
  hasAmount: boolean
  hasCash: boolean
  nonCash: string[]
  amount: string
}) {
  // Case: cash tag present + amount present
  if (hasCash && hasAmount) {
    if (nonCash.length === 0) {
      return <span className="card-amt">{amount}</span>
    }
    const suffixSlug =
      nonCash.length === 1 ? nonCash[0] : pickPriorityNonCash(nonCash)
    const suffix = suffixSlug ? COMP_LABEL_SUFFIX[suffixSlug] : null
    return (
      <span className="card-amt">
        {amount}
        {suffix && (
          <span className="comp-meta-suffix">+ {suffix}</span>
        )}
      </span>
    )
  }

  // Case: cash tag present but amount null
  if (hasCash && !hasAmount) {
    return <span className="card-amt muted">{amount}</span>
  }

  // Case: no cash tag, one or more non-cash tags
  if (nonCash.length === 1) {
    return (
      <span className="card-amt">
        <span className="comp-meta">
          {COMP_LABEL_FULL[nonCash[0]] ?? nonCash[0]}
        </span>
      </span>
    )
  }
  if (nonCash.length >= 2) {
    const labels = nonCash.map((s) => COMP_LABEL_FULL[s] ?? s).join(' + ')
    return (
      <span className="card-amt">
        <span className="comp-meta">{labels}</span>
      </span>
    )
  }

  // Fallback: no cash, no non-cash (legitimacy-only tag set, e.g., `valid`
  // alone — possible if user picks no compensation in the AddPitchModal).
  return <span className="card-amt muted">—</span>
}
