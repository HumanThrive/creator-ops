import { createClient } from '@/lib/supabase/server'
import { Kanban, type DealWithPitch } from '@/components/Kanban'
import { StatsStrip } from '@/components/StatsStrip'
import { computePitchStats } from '@/lib/pitch-stats'
import type { Pitch } from '@/lib/types/pitch'
import type { Deal } from '@/lib/types/deal'

export default async function AppPage() {
  const supabase = await createClient()

  // Fetch pitches + deals + entity_tags (joined to tags) in parallel.
  // RLS gates ownership on all three.
  const [pitchesResult, dealsResult, tagsResult] = await Promise.all([
    supabase
      .from('pitches')
      .select('*')
      .order('created_at', { ascending: false }),
    supabase.from('deals').select('*'),
    supabase
      .from('entity_tags')
      .select('ref_id, tags(slug)')
      .eq('ref_type', 'pitch'),
  ])

  const safePitches = (pitchesResult.data ?? []) as Pitch[]
  const safeDeals = (dealsResult.data ?? []) as Deal[]

  // CR-2 — group entity_tags by pitch_id (ref_id). Each row is { ref_id, tags }
  // where tags is the joined { slug } record (single or array depending on
  // supabase-js resolution at runtime — flatten defensively).
  const tagsByPitchId: Record<string, string[]> = {}
  for (const row of tagsResult.data ?? []) {
    const refId = (row as { ref_id: string }).ref_id
    const tagRel = (row as { tags: { slug: string } | { slug: string }[] | null }).tags
    if (!tagRel) continue
    const slugs = Array.isArray(tagRel) ? tagRel.map((t) => t.slug) : [tagRel.slug]
    const bucket = tagsByPitchId[refId] ?? []
    bucket.push(...slugs)
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
      tags: tagsByPitchId[parent.id] ?? [],
    })
  }

  const stats = computePitchStats(safePitches, safeDeals)
  const error = pitchesResult.error ?? dealsResult.error ?? tagsResult.error

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
          <Kanban items={items} />
        </>
      )}
    </div>
  )
}
