'use client'

import { useEffect, useState } from 'react'
import { Kanban, type DealWithPitch, type DirectionFilter } from './Kanban'
import { PitchFeed, type PitchWithTags } from './PitchFeed'
import { PitchDetailModal } from './PitchDetailModal'

const DIRECTION_STORAGE_KEY = 'supaspike.kanbanDirection'

interface AppBoardProps {
  items: DealWithPitch[]
  pitchesWithTags: PitchWithTags[]
  defaultExpanded: boolean
}

// Owns the direction filter state shared by Kanban and PitchFeed so both
// surfaces re-scope simultaneously when the filter toggles. `hydrated`
// gates first paint so the persisted localStorage value lands before the
// default 'inbound' state flashes.
export function AppBoard({
  items,
  pitchesWithTags,
  defaultExpanded,
}: AppBoardProps) {
  const [direction, setDirection] = useState<DirectionFilter>('inbound')
  const [hydrated, setHydrated] = useState(false)
  const [expanded, setExpanded] = useState(defaultExpanded)
  const [feedSelectedPitchId, setFeedSelectedPitchId] = useState<string | null>(
    null,
  )

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

  if (!hydrated) {
    return null
  }

  // Feed modal lookup falls back to the full unfiltered set so a modal
  // opened from one direction filter survives a filter toggle — matches
  // Kanban's own selected-pitch fallback pattern.
  const feedSelectedPitch =
    pitchesWithTags.find((p) => p.id === feedSelectedPitchId) ?? null

  return (
    <>
      <Kanban
        items={items}
        direction={direction}
        onDirectionChange={selectDirection}
      />
      <PitchFeed
        pitches={pitchesWithTags}
        expanded={expanded}
        onToggle={() => setExpanded((prev) => !prev)}
        onRowClick={setFeedSelectedPitchId}
        directionFilter={direction}
      />
      {feedSelectedPitch && (
        <PitchDetailModal
          pitch={feedSelectedPitch}
          onClose={() => setFeedSelectedPitchId(null)}
        />
      )}
    </>
  )
}
