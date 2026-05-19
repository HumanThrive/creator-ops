'use client'

import { useState } from 'react'
import type { Pitch, PitchDirection } from '@/lib/types/pitch'
import type { Deal, DealStage } from '@/lib/types/deal'
import { getStageLabel } from '@/lib/stage-labels'
import { PitchCard } from './PitchCard'
import { PitchDetailModal } from './PitchDetailModal'

// CR-4 Q3 Lock — `rejected` stage stays out of Kanban (reachable only via
// DealEditModal). Column labels derive from getStageLabel at render time.
const COLUMNS: DealStage[] = ['inbox', 'negotiating', 'confirmed', 'delivered']

export type DirectionFilter = 'inbound' | 'outbound' | 'all'

const FILTERS: { value: DirectionFilter; label: string; arrow: string | null }[] = [
  { value: 'inbound', label: 'Inbound', arrow: '↘' },
  { value: 'outbound', label: 'Outbound', arrow: '↗' },
  { value: 'all', label: 'All', arrow: null },
]

const FILTER_COUNT_LABEL: Record<DirectionFilter, string> = {
  inbound: 'INBOUND',
  outbound: 'OUTBOUND',
  all: 'INBOUND + OUTBOUND',
}

/** Joined view: a deal paired with its parent pitch. Built in the server
 *  component (page.tsx) and passed into Kanban so this client component
 *  doesn't need to issue its own queries.
 *  CR-2: `tags` carries the pitch's entity_tags slug array — drives
 *  PitchCard's AC4.8 compensation indicator. */
export interface DealWithPitch {
  deal: Deal
  pitch: Pitch
  tags: string[]
}

// CEO Q8: per column, the highest-budget deal gets the spotlight ring.
// Tie-break: most recent created_at on the parent pitch. Skip if no deals in
// column have a budget.
function spotlightId(items: DealWithPitch[]): string | null {
  let best: DealWithPitch | null = null
  for (const item of items) {
    const amt = item.deal.current_budget_amount
    if (!amt || amt <= 0) continue
    const bestAmt = best?.deal.current_budget_amount
    if (!best || (bestAmt !== null && bestAmt !== undefined && amt > bestAmt)) {
      best = item
      continue
    }
    if (amt === bestAmt && item.pitch.created_at > best.pitch.created_at) {
      best = item
    }
  }
  return best?.deal.id ?? null
}

interface KanbanProps {
  items: DealWithPitch[]
  direction: DirectionFilter
  onDirectionChange: (next: DirectionFilter) => void
}

export function Kanban({ items, direction, onDirectionChange }: KanbanProps) {
  const [selectedPitchId, setSelectedPitchId] = useState<string | null>(null)

  const filtered = items.filter(
    (item) => direction === 'all' || item.pitch.direction === direction
  )

  // Selected pitch lookup: fall back to full `items` (not the filtered list)
  // so a modal opened from one filter survives a filter toggle.
  const selectedPitch =
    items.find((item) => item.pitch.id === selectedPitchId)?.pitch ?? null

  const totalCount = filtered.length
  const countNoun = direction === 'all' ? 'DEALS' : 'PITCHES'
  // AC3.3 — `all` filter resolves to inbound-canonical for column headers
  // (Phase A is inbound-dominant; cards carry their own direction).
  const headerDirection: PitchDirection =
    direction === 'all' ? 'inbound' : direction

  return (
    <>
      <div className="board-tools">
        <span className="board-tools-l">
          <b>{String(totalCount).padStart(2, '0')}</b> {countNoun} ·{' '}
          {FILTER_COUNT_LABEL[direction]}
        </span>
        <div
          className="dir-filter"
          role="tablist"
          aria-label="Direction filter"
        >
          <span className="dir-filter-l">Direction</span>
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              role="tab"
              onClick={() => onDirectionChange(f.value)}
              className={
                'dir-filter-btn' + (direction === f.value ? ' is-active' : '')
              }
              aria-pressed={direction === f.value}
            >
              {f.arrow && (
                <span className="dir-arrow" aria-hidden>
                  {f.arrow}
                </span>
              )}
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <section className="board">
        {COLUMNS.map((stage) => {
          const colItems = filtered.filter((item) => item.deal.stage === stage)
          const spotId = spotlightId(colItems)
          const countStr = String(colItems.length).padStart(2, '0')
          return (
            <div key={stage} className="col">
              <div className="col-head">
                <div className="col-head-l">
                  <strong>{getStageLabel(stage, headerDirection)}</strong>
                </div>
                <span className="col-n">{countStr}</span>
              </div>
              <div className="col-cards">
                {colItems.length === 0 && stage === 'inbox' && (
                  <p className="font-mono text-xs text-ink-4">
                    {/* CR-6 2026-05-19 — split inbox empty state. Onboarding
                        message stays when there are zero deals in the active
                        direction filter. Once any other column has a deal,
                        the inbox-empty state is a positive signal (you've
                        processed incoming) — soften to "Inbox clear". */}
                    {filtered.length === 0
                      ? 'No deals yet. Add a pitch to start →'
                      : 'Inbox clear.'}
                  </p>
                )}
                {colItems.map((item) => (
                  <PitchCard
                    key={item.deal.id}
                    pitch={item.pitch}
                    deal={item.deal}
                    tags={item.tags}
                    spotlight={item.deal.id === spotId}
                    onClick={() => setSelectedPitchId(item.pitch.id)}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </section>
      {selectedPitch && (
        <PitchDetailModal
          pitch={selectedPitch}
          onClose={() => setSelectedPitchId(null)}
        />
      )}
    </>
  )
}
