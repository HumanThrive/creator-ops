'use client'

import { useState } from 'react'
import type { Pitch, PipelineStage } from '@/lib/types/pitch'
import { PitchCard } from './PitchCard'
import { PitchDetailModal } from './PitchDetailModal'

const COLUMNS: { stage: PipelineStage; label: string }[] = [
  { stage: 'inbox', label: 'Inbox' },
  { stage: 'negotiating', label: 'Negotiating' },
  { stage: 'confirmed', label: 'Confirmed' },
  { stage: 'delivered_paid', label: 'Delivered & paid' },
]

// CEO Q8: per column, the highest-budget pitch gets the spotlight ring.
// Tie-break: most recent created_at. Skip if no pitches in column have a budget.
function spotlightId(items: Pitch[]): string | null {
  let best: Pitch | null = null
  for (const p of items) {
    if (!p.budget_amount || p.budget_amount <= 0) continue
    if (!best || p.budget_amount > best.budget_amount!) {
      best = p
      continue
    }
    if (p.budget_amount === best.budget_amount && p.created_at > best.created_at) {
      best = p
    }
  }
  return best?.id ?? null
}

export function Kanban({ pitches }: { pitches: Pitch[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = pitches.find((p) => p.id === selectedId) ?? null

  return (
    <>
      <section className="board">
        {COLUMNS.map(({ stage, label }) => {
          const items = pitches.filter((p) => p.pipeline_stage === stage)
          const spotId = spotlightId(items)
          const countStr = String(items.length).padStart(2, '0')
          return (
            <div key={stage} className="col">
              <div className="col-head">
                <div className="col-head-l">
                  <strong>{label}</strong>
                </div>
                <span className="col-n">{countStr}</span>
              </div>
              <div className="col-cards">
                {items.length === 0 && stage === 'inbox' && (
                  <p className="font-mono text-xs text-ink-4">
                    No pitches yet. Paste your first one →
                  </p>
                )}
                {items.map((pitch) => (
                  <PitchCard
                    key={pitch.id}
                    pitch={pitch}
                    spotlight={pitch.id === spotId}
                    onClick={() => setSelectedId(pitch.id)}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </section>
      {selected && (
        <PitchDetailModal pitch={selected} onClose={() => setSelectedId(null)} />
      )}
    </>
  )
}
