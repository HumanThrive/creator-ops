'use client'

import type { Pitch } from '@/lib/types/pitch'
import { formatCurrencyAmount } from '@/lib/pitch-stats'

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

function shortDate(iso: string): string {
  const d = new Date(iso)
  return `${MONTHS[d.getMonth()]} ${String(d.getDate()).padStart(2, '0')}`
}

interface PitchCardProps {
  pitch: Pitch
  onClick: () => void
  spotlight?: boolean
}

export function PitchCard({ pitch, onClick, spotlight = false }: PitchCardProps) {
  const hasAmount =
    pitch.budget_amount !== null && pitch.budget_amount > 0 && pitch.budget_currency !== null
  const amount = hasAmount
    ? `${formatCurrencyAmount(pitch.budget_currency!.trim().toUpperCase(), pitch.budget_amount!)} ${pitch.budget_currency!.trim().toUpperCase()}`
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
      className={'card' + (spotlight ? ' is-spotlight' : '')}
      aria-label={`Open pitch from ${pitch.brand_name ?? 'unknown brand'}`}
    >
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
