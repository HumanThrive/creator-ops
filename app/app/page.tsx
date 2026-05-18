import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { AppBoard } from '@/components/AppBoard'
import type { DealWithPitch } from '@/components/Kanban'
import type { PitchWithTags } from '@/components/PitchFeed'
import { StatsStrip } from '@/components/StatsStrip'
import { computePitchStats } from '@/lib/pitch-stats'
import { isNewUser } from '@/lib/user'
import type { Pitch } from '@/lib/types/pitch'
import type { Deal } from '@/lib/types/deal'
import type { Tag } from '@/lib/hooks/useEntityTags'

export const metadata: Metadata = {
  title: 'Pitches',
}

export default async function AppPage() {
  const supabase = await createClient()

  // Fetch pitches + deals + entity_tags + user in parallel. RLS gates
  // ownership on the data queries; user.created_at drives the CR-4 pitch
  // feed differential default state (new-user expanded; returning collapsed).
  const [pitchesResult, dealsResult, tagsResult, userResult] = await Promise.all([
    supabase
      .from('pitches')
      .select('*')
      .order('created_at', { ascending: false }),
    supabase.from('deals').select('*'),
    supabase
      .from('entity_tags')
      .select('ref_id, tags(slug, display_label, axis)')
      .eq('ref_type', 'pitch'),
    supabase.auth.getUser(),
  ])

  const safePitches = (pitchesResult.data ?? []) as Pitch[]
  const safeDeals = (dealsResult.data ?? []) as Deal[]

  // CR-2 — group entity_tags by pitch_id (ref_id). Each row is { ref_id, tags }
  // where tags is the joined Tag record (single or array depending on
  // supabase-js resolution at runtime — flatten defensively).
  const tagsByPitchId: Record<string, Tag[]> = {}
  for (const row of tagsResult.data ?? []) {
    const refId = (row as { ref_id: string }).ref_id
    const tagRel = (row as { tags: Tag | Tag[] | null }).tags
    if (!tagRel) continue
    const rowTags = Array.isArray(tagRel) ? tagRel : [tagRel]
    const bucket = tagsByPitchId[refId] ?? []
    bucket.push(...rowTags)
    tagsByPitchId[refId] = bucket
  }

  // Build joined view: each deal paired with its parent pitch + tag slugs.
  // Deals whose parent pitch wasn't returned (shouldn't happen under FK + RLS
  // but defensive) are dropped — the card needs both halves for display.
  const pitchesById: Record<string, Pitch> = {}
  for (const p of safePitches) pitchesById[p.id] = p

  const items: DealWithPitch[] = []
  for (const d of safeDeals) {
    const parent = pitchesById[d.pitch_id]
    if (!parent) continue
    items.push({
      deal: d,
      pitch: parent,
      tags: (tagsByPitchId[parent.id] ?? []).map((t) => t.slug),
    })
  }

  // CR-4 — pitch-feed joined view: every pitch paired with its full Tag[]
  // (single source of truth for tag-display via existing <TagBadges>).
  // Sorted desc by created_at (already returned in that order from the
  // pitches query).
  const pitchesWithTags: PitchWithTags[] = safePitches.map((p) => ({
    ...p,
    tags: tagsByPitchId[p.id] ?? [],
  }))

  const stats = computePitchStats(safePitches, safeDeals)
  const error = pitchesResult.error ?? dealsResult.error ?? tagsResult.error

  // CR-4 AC2.1–2.3 — differential default for the pitch feed expand state.
  // user fetch is non-blocking for render; on failure we fall back to
  // expanded (safer than hidden on a transient auth blip).
  const user = userResult.data?.user
  const defaultExpanded = user
    ? isNewUser(user.created_at, safePitches.length)
    : true

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-l">
          <span className="kicker">
            Your board · {stats.pitchCount} pitches · {stats.brandCount} brands
          </span>
          <h1 className="page-h1">Pitches.</h1>
        </div>
      </div>

      {error ? (
        <p className="text-sm text-red-600">
          Failed to load board: {error.message}
        </p>
      ) : (
        <>
          <StatsStrip stats={stats} />
          <AppBoard
            items={items}
            pitchesWithTags={pitchesWithTags}
            defaultExpanded={defaultExpanded}
          />
        </>
      )}
    </div>
  )
}
