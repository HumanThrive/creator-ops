'use client'

import { useState } from 'react'
import type { Pitch } from '@/lib/types/pitch'
import { StageChip } from '@/components/StageChip'
import { PitchDetailModal } from '@/components/PitchDetailModal'
import { formatFullDate } from '@/lib/format'
import { formatCurrencyAmount } from '@/lib/pitch-stats'

interface BrandHistoryTableProps {
  pitches: Pitch[]
}

export function BrandHistoryTable({ pitches }: BrandHistoryTableProps) {
  const [selected, setSelected] = useState<Pitch | null>(null)

  return (
    <>
      <div className="history">
        <div className="history-head">
          <span>Date</span>
          <span>Stage</span>
          <span>Cash</span>
          <span>AI summary</span>
          <span aria-hidden />
        </div>
        {pitches.map((p) => (
          <div
            key={p.id}
            role="button"
            tabIndex={0}
            className="history-row"
            onClick={() => setSelected(p)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                setSelected(p)
              }
            }}
            aria-label={`Open pitch from ${p.brand_name ?? 'unknown brand'}`}
          >
            <span className="history-date">{formatFullDate(p.created_at)}</span>
            <StageChip stage={p.pipeline_stage} category={p.category} />
            <CashCell pitch={p} />
            <span className="history-summary">{p.ai_summary ?? '—'}</span>
            <span className="history-arrow">→</span>
          </div>
        ))}
      </div>
      {selected && (
        <PitchDetailModal pitch={selected} onClose={() => setSelected(null)} />
      )}
    </>
  )
}

function CashCell({ pitch }: { pitch: Pitch }) {
  if (!pitch.budget_amount || pitch.budget_amount <= 0 || !pitch.budget_currency) {
    return <span className="history-amt muted">—</span>
  }
  const currency = pitch.budget_currency.trim().toUpperCase()
  return (
    <span className="history-amt">
      {formatCurrencyAmount(currency, pitch.budget_amount)} {currency}
    </span>
  )
}
