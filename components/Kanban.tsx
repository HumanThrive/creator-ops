'use client'

import { useEffect, useState } from 'react'
import type { Pitch } from '@/lib/types/pitch'
import type { Deal, DealStage } from '@/lib/types/deal'
import { PitchCard } from './PitchCard'
import { PitchDetailModal } from './PitchDetailModal'

const DIRECTION_STORAGE_KEY = 'supaspike.kanbanDirection'

const COLUMNS: { stage: DealStage; label: string }[] = [
  { stage: 'inbox', label: 'Inbox' },
  { stage: 'negotiating', label: 'Negotiating' },
  { stage: 'confirmed', label: 'Confirmed' },
  { stage: 'delivered', label: 'Delivered' },
]

type DirectionFilter = 'inbound' | 'outbound' | 'all'

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

export function Kanban({ items }: { items: DealWithPitch[] }) {
  const [selectedPitchId, setSelectedPitchId] = useState<string | null>(null)
  const [direction, setDirection] = useState<DirectionFilter>('inbound')
  // `hydrated` gates the first paint: SSR + initial client render show nothing
  // for the toggle bar and board, then the post-hydration effect reads the
  // persisted direction from localStorage and flips this true. Skips the flash
  // of "inbound" content before snapping to the stored filter.
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const stored = window.localStorage.getItem(DIRECTION_STORAGE_KEY)
    if (stored === 'inbound' || stored === 'outbound' || stored === 'all') {
      setDirection(stored)
    }
    setHydrated(true)
  }, [])

  function selectDirection(next: DirectionFilter) {
    setDirection(next)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(DIRECTION_STORAGE_KEY, next)
    }
  }

  const filtered = items.filter(
    (item) => direction === 'all' || item.pitch.direction === direction
  )

  // Selected pitch lookup: fall back to full `items` (not the filtered list)
  // so a modal opened from one filter survives a filter toggle.
  const selectedPitch =
    items.find((item) => item.pitch.id === selectedPitchId)?.pitch ?? null

  if (!hydrated) {
    // SSR + first client paint: render nothing for the toggle + board so the
    // user never sees the default 'inbound' state flash before the persisted
    // direction lands. The post-hydration effect flips `hydrated` true once
    // localStorage has been read.
    return null
  }

  const totalCount = filtered.length
  const countNoun = direction === 'all' ? 'DEALS' : 'PITCHES'

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
              onClick={() => selectDirection(f.value)}
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
        {COLUMNS.map(({ stage, label }) => {
          const colItems = filtered.filter((item) => item.deal.stage === stage)
          const spotId = spotlightId(colItems)
          const countStr = String(colItems.length).padStart(2, '0')
          return (
            <div key={stage} className="col">
              <div className="col-head">
                <div className="col-head-l">
                  <strong>{label}</strong>
                </div>
                <span className="col-n">{countStr}</span>
              </div>
              <div className="col-cards">
                {colItems.length === 0 && stage === 'inbox' && (
                  <p className="font-mono text-xs text-ink-4">
                    No deals yet. Add a pitch to start →
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
