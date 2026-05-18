import type { Tag } from '@/lib/hooks/useEntityTags'
import type { PitchDirection } from '@/lib/types/pitch'

// Read-only chip array for the Tags cell in PitchDetailModal receipts grid +
// any other tag-display surface. Visual contract:
// `docs/design/design_handoff_supaspike_phase_a/crm/crm-styles.css` lines 2590–2642.
// Outbound auto-hides legitimacy. Legitimacy ≠ 'valid' auto-hides compensation
// (the compensation axis is only meaningful for real partnership offers).
// Both-empty fallback renders an "Untagged" placeholder chip.

const LEGIT_DISPLAY: Record<string, { cls: string; label: string }> = {
  valid: { cls: 'is-legit', label: 'Valid' },
  low_quality: { cls: 'is-low', label: 'Low quality' },
  spam_or_scam: { cls: 'is-spam', label: 'Spam / Scam' },
  unclear: { cls: 'is-unclear', label: 'Unclear' },
  not_a_pitch: { cls: 'is-notpitch', label: 'Not a pitch' },
}

const COMP_DISPLAY: Record<string, { cls: string; label: string }> = {
  cash: { cls: 'is-cash', label: 'Cash' },
  gifting: { cls: 'is-gift', label: 'Gifting' },
  collaboration: { cls: 'is-collab', label: 'Collab' },
  unspecified: { cls: 'is-unspec', label: 'Unspecified' },
}

interface TagBadgesProps {
  tags: Tag[]
  direction?: PitchDirection
  hideLegitimacy?: boolean
}

// Derive (legitimacy, compensation[]) from a flat Tag[] by axis.
function splitTagsByAxis(tags: Tag[]): {
  legitimacy: string | null
  compensation: string[]
} {
  let legitimacy: string | null = null
  const compensation: string[] = []
  for (const t of tags) {
    if (t.axis === 'legitimacy') legitimacy = t.slug
    else if (t.axis === 'compensation') compensation.push(t.slug)
  }
  return { legitimacy, compensation }
}

export function TagBadges({
  tags,
  direction = 'inbound',
  hideLegitimacy,
}: TagBadgesProps) {
  const { legitimacy, compensation } = splitTagsByAxis(tags)
  const isOutbound = direction === 'outbound'
  const showLegit = !isOutbound && !hideLegitimacy && !!legitimacy
  const compShown = isOutbound || legitimacy === 'valid'
  const comps = compShown ? compensation : []

  if (!showLegit && comps.length === 0) {
    return (
      <span className="tag-badges">
        <span className="tag-badge is-unspec">Untagged</span>
      </span>
    )
  }

  return (
    <span className="tag-badges">
      {showLegit && legitimacy && LEGIT_DISPLAY[legitimacy] ? (
        <span className={`tag-badge ${LEGIT_DISPLAY[legitimacy].cls}`}>
          {LEGIT_DISPLAY[legitimacy].label}
        </span>
      ) : null}
      {comps.map((c) =>
        COMP_DISPLAY[c] ? (
          <span key={c} className={`tag-badge ${COMP_DISPLAY[c].cls}`}>
            {COMP_DISPLAY[c].label}
          </span>
        ) : null,
      )}
    </span>
  )
}
