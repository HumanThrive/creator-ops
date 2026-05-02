'use client'

import { useState } from 'react'
import type { Pitch, PipelineStage } from '@/lib/types/pitch'
import { PitchCard } from './PitchCard'
import { PitchDetailModal } from './PitchDetailModal'

const COLUMNS: { stage: PipelineStage; label: string }[] = [
  { stage: 'inbox', label: 'Inbox' },
  { stage: 'negotiating', label: 'Negotiating' },
  { stage: 'confirmed', label: 'Confirmed' },
  { stage: 'delivered_paid', label: 'Delivered & Paid' },
]

export function Kanban({ pitches }: { pitches: Pitch[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = pitches.find((p) => p.id === selectedId) ?? null

  const grouped = COLUMNS.map(({ stage, label }) => ({
    stage,
    label,
    items: pitches.filter((p) => p.pipeline_stage === stage),
  }))

  return (
    <>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        {grouped.map(({ stage, label, items }) => (
          <section key={stage} className="rounded-lg bg-gray-50 p-3">
            <header className="mb-3 flex items-center justify-between text-sm font-medium text-gray-700">
              <span>{label}</span>
              <span className="text-gray-500">{items.length}</span>
            </header>
            <div className="space-y-2">
              {items.length === 0 ? (
                stage === 'inbox' ? (
                  <p className="text-xs text-gray-500">
                    No pitches yet. Paste your first one →
                  </p>
                ) : (
                  <p className="text-xs text-gray-400">—</p>
                )
              ) : (
                items.map((pitch) => (
                  <PitchCard
                    key={pitch.id}
                    pitch={pitch}
                    onClick={() => setSelectedId(pitch.id)}
                  />
                ))
              )}
            </div>
          </section>
        ))}
      </div>
      {selected && (
        <PitchDetailModal
          pitch={selected}
          onClose={() => setSelectedId(null)}
        />
      )}
    </>
  )
}
