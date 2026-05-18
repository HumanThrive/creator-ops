'use client'

import { Fragment, useState } from 'react'
import type { Pitch } from '@/lib/types/pitch'
import type { Deal } from '@/lib/types/deal'
import type { Activity } from '@/lib/types/activity'
import { StageChip } from '@/components/StageChip'
import { PitchDetailModal } from '@/components/PitchDetailModal'
import { formatFullDate, formatRelativeTime } from '@/lib/format'
import { formatCurrencyAmount } from '@/lib/pitch-stats'
import { formatActivityLabel } from '@/lib/activity-format'

interface BrandHistoryTableProps {
  pitches: Pitch[]
  dealsByPitchId: Record<string, Deal | undefined>
  activitiesByPitchId: Record<string, Activity[] | undefined>
  // CR-2 — pitch tag slugs (entity_tags joined to tags) per pitch_id. Replaces
  // the pre-CR-2 `pitch.category` predicate path. Empty/missing entry treated
  // as no tags (defensive — every pitch should have at least a legitimacy tag).
  tagsByPitchId: Record<string, string[] | undefined>
}

export function BrandHistoryTable({
  pitches,
  dealsByPitchId,
  activitiesByPitchId,
  tagsByPitchId,
}: BrandHistoryTableProps) {
  const [selected, setSelected] = useState<Pitch | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  function toggleExpanded(pitchId: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(pitchId)) next.delete(pitchId)
      else next.add(pitchId)
      return next
    })
  }

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
        {pitches.map((p) => {
          const deal = dealsByPitchId[p.id]
          const activities = activitiesByPitchId[p.id] ?? []
          const isExpanded = expanded.has(p.id)
          const pitchTags = tagsByPitchId[p.id] ?? []
          const isNotPitch = pitchTags.includes('not_a_pitch')
          return (
            <Fragment key={p.id}>
              <div
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
                <span className="history-date">
                  {formatFullDate(p.created_at)}
                  <span className="history-direction">
                    {p.direction === 'outbound' ? '↗ Outbound' : '↘ Inbound'}
                  </span>
                </span>
                {deal ? (
                  <StageChip
                    stage={deal.stage}
                    direction={p.direction}
                    isNotPitch={isNotPitch}
                  />
                ) : isNotPitch ? (
                  <StageChip stage="inbox" direction={p.direction} isNotPitch />
                ) : (
                  <span className="history-amt muted">No deal</span>
                )}
                <CashCell pitch={p} />
                <span className="history-summary">{p.ai_summary ?? '—'}</span>
                <span className="history-arrow">→</span>
              </div>
              {activities.length > 0 && (
                <div className="history-activity-log">
                  <button
                    type="button"
                    className="history-activity-log-toggle"
                    onClick={() => toggleExpanded(p.id)}
                    aria-expanded={isExpanded}
                  >
                    {isExpanded ? '▼' : '▶'} {activities.length}{' '}
                    {activities.length === 1
                      ? 'activity event'
                      : 'activity events'}
                  </button>
                  {isExpanded && (
                    <ul className="history-activity-list">
                      {activities.map((a) => (
                        <li key={a.id} className="history-activity-item">
                          <span className="history-activity-time">
                            {formatRelativeTime(a.created_at)}
                          </span>
                          <span className="history-activity-label">
                            {formatActivityLabel(a)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </Fragment>
          )
        })}
      </div>
      {selected && (
        <PitchDetailModal
          pitch={selected}
          onClose={() => setSelected(null)}
        />
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

