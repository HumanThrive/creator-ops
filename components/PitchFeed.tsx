'use client'

import type { Pitch } from '@/lib/types/pitch'
import type { Tag } from '@/lib/hooks/useEntityTags'
import type { DirectionFilter } from './Kanban'
import { TagBadges } from './TagBadges'
import { DirIndicator } from './DirIndicator'
import { formatRelativeTime } from '@/lib/format'

// Pitch joined with its entity_tags rows. Built server-side in page.tsx
// from the existing entity_tags fetch — symmetric with Kanban's
// `DealWithPitch` joined view.
export interface PitchWithTags extends Pitch {
  tags: Tag[]
}

interface PitchFeedProps {
  pitches: PitchWithTags[]
  expanded: boolean
  onToggle: () => void
  onRowClick: (pitchId: string) => void
  directionFilter: DirectionFilter
}

// Secondary surface below the Kanban — captures every pitch (any
// category, any direction) so non-deal pitches don't fall through the
// cracks after AI classification. Visual contract per
// docs/design/design_handoff_cr4_pitch_feed/.
export function PitchFeed({
  pitches,
  expanded,
  onToggle,
  onRowClick,
  directionFilter,
}: PitchFeedProps) {
  const visible = pitches.filter(
    (p) => directionFilter === 'all' || p.direction === directionFilter
  )
  const count = visible.length
  const overflow = count > 10

  return (
    <section className={'feed' + (expanded ? '' : ' is-collapsed')}>
      <header className="feed-head">
        <div className="feed-head-l">
          <span className="feed-kicker">Captured pitches</span>
          <span className="feed-title">Pitch feed</span>
          <span className="feed-n">{count}</span>
        </div>
        <div className="feed-head-r">
          <button
            className="feed-collapse"
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
          >
            {expanded ? 'Hide' : 'Show recent'}
            <span className="feed-collapse-i" aria-hidden>
              {expanded ? '▴' : '▾'}
            </span>
          </button>
        </div>
      </header>

      {expanded && (
        <>
          {count === 0 ? (
            <FeedEmpty />
          ) : (
            <>
              <div className={'feed-rows' + (overflow ? ' feed-scroll' : '')}>
                {visible.map((p) => (
                  <FeedRow
                    key={p.id}
                    pitch={p}
                    onClick={() => onRowClick(p.id)}
                  />
                ))}
              </div>
              {overflow && <FeedFoot count={count} />}
            </>
          )}
        </>
      )}
    </section>
  )
}

function FeedRow({
  pitch,
  onClick,
}: {
  pitch: PitchWithTags
  onClick: () => void
}) {
  const brandKnown = !!pitch.brand_name
  const ts = formatRelativeTime(pitch.created_at)
  // ts + dir render twice — once as direct grid children (desktop grid)
  // and once wrapped in `.feed-meta` (mobile 3-row stack via container
  // query). CSS toggles visibility per breakpoint. Design canon.
  return (
    <div className="feed-row" onClick={onClick} role="button" tabIndex={0}>
      <span className="feed-meta">
        <span className="feed-ts">{ts}</span>
        <span className="feed-dir">
          <DirIndicator direction={pitch.direction} />
        </span>
      </span>
      <span className="feed-ts">{ts}</span>
      <span className="feed-dir">
        <DirIndicator direction={pitch.direction} />
      </span>
      <div className="feed-body">
        <span className={'feed-brand' + (brandKnown ? '' : ' is-unknown')}>
          {pitch.brand_name ?? 'Unknown brand'}
        </span>
        <span className="feed-sum">{pitch.ai_summary}</span>
      </div>
      <div className="feed-tags-wrap">
        <TagBadges tags={pitch.tags} direction={pitch.direction} />
      </div>
      <span className="feed-arrow" aria-hidden>
        →
      </span>
    </div>
  )
}

function FeedEmpty() {
  return (
    <div className="feed-empty">
      <span className="feed-empty-stamp">Awaiting first capture</span>
      <h3 className="feed-empty-h">Your pitches will land here.</h3>
      <p className="feed-empty-b">
        Anything we can&apos;t auto-place on the Kanban above — spam,
        gifting feelers, &ldquo;thanks for the follow&rdquo; messages —
        drops into this feed so you can re-classify or delete.{' '}
        <b>Paste a DM in the top bar to start.</b>
      </p>
    </div>
  )
}

function FeedFoot({ count }: { count: number }) {
  return (
    <div className="feed-foot">
      <span>
        Showing 10 of <b>{count} captured</b> · scroll for more
      </span>
      <span className="feed-foot-link">View all {count} pitches ▸</span>
    </div>
  )
}
