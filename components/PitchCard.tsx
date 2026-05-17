'use client'

import type { Pitch } from '@/lib/types/pitch'
import type { Deal } from '@/lib/types/deal'
import { formatCurrencyAmount } from '@/lib/pitch-stats'

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

function shortDate(iso: string): string {
  const d = new Date(iso)
  return `${MONTHS[d.getMonth()]} ${String(d.getDate()).padStart(2, '0')}`
}

interface PitchCardProps {
  pitch: Pitch
  /** Deal that anchors this card on the board. Card budget reads from
   *  `deal.current_budget_*` (the negotiated state), NOT the original
   *  `pitch.budget_*` snapshot. Per FR-4 S6 (AC6.1). */
  deal: Deal
  onClick: () => void
  spotlight?: boolean
}

export function PitchCard({ pitch, deal, onClick, spotlight = false }: PitchCardProps) {
  const hasAmount =
    deal.current_budget_amount !== null &&
    deal.current_budget_amount > 0 &&
    deal.current_budget_currency !== null
  const amount = hasAmount
    ? `${formatCurrencyAmount(deal.current_budget_currency!.trim().toUpperCase(), deal.current_budget_amount!)} ${deal.current_budget_currency!.trim().toUpperCase()}`
    : '—'

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
        <span className={'card-amt' + (hasAmount ? '' : ' muted')}>{amount}</span>
      </div>
      <div className="card-summary">{pitch.ai_summary ?? '—'}</div>
      <div className="card-foot">
        <span>{shortDate(pitch.created_at)}</span>
      </div>
    </div>
  )
}
