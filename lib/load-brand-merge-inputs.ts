// Loader helpers for the Brand Combine ("merge_brands") wizard. FR-10 #97.
//
// Builds the BrandMergeInputs payload the wizard consumes (AC1.5 fresh-read:
// both brands' full association graphs loaded from DB at wizard-open, not stale
// list data). Brand-axis fork of lib/load-merge-inputs.ts (FR-9). Read-only via
// the browser supabase client; RLS scopes everything to the authed user (the
// merge itself commits through the merge_brands plpgsql RPC — the atomic primitive,
// per docs/engineering/learnings.md §1).

import { createClient } from '@/lib/supabase/client'
import type { Brand } from '@/lib/types/brand'
import type { ContactBrand } from '@/lib/types/contact'
import type { Pitch } from '@/lib/types/pitch'
import type { DealStage } from '@/lib/types/deal'
import type {
  BrandMergeInputs,
  BrandPitchWithProvenance,
} from '@/lib/brand-merge'

// PostgREST embed — each pitch carries its nested `deals` row (FK deals.pitch_id).
// v1 UX is 1-to-1, so deals[0] or empty (no deal row for spam / not_a_pitch).
type PitchWithDealEmbed = Pitch & {
  deals: Array<{
    stage: DealStage
    current_budget_amount: number | null
    current_budget_currency: string | null
  }>
}

// ============================================================================
// Search-by-name — for the typeahead pick entries (delete-block / create-collision)
// ============================================================================

export interface BrandSearchHit {
  id: string
  name: string
  slug: string | null
}

export async function searchBrandsByName(
  query: string,
  excludeId: string,
): Promise<BrandSearchHit[]> {
  const q = query.trim()
  if (!q) return []
  const supabase = createClient()
  // The Unknown bucket is not a brands row, so it can never appear here. The
  // anchor brand is excluded by id.
  const { data, error } = await supabase
    .from('brands')
    .select('id, name, slug')
    .neq('id', excludeId)
    .ilike('name', `%${q}%`)
    .limit(8)
  if (error) {
    console.error('searchBrandsByName: select failed', error)
    return []
  }
  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    slug: (row.slug as string | null) ?? null,
  }))
}

// ============================================================================
// BrandMergeInputs loader — full association graphs for both brands (AC1.5)
// ============================================================================

export async function loadBrandMergeInputs(
  survivorId: string,
  loserId: string,
): Promise<BrandMergeInputs> {
  const supabase = createClient()

  // Parallel-fetch the three base sets. RLS scopes to the authed user; the
  // .in() filters narrow to the two brands. Pitches embed their deal row.
  const PITCHES_SELECT =
    '*, deals(stage, current_budget_amount, current_budget_currency)'
  const [brandsRes, linksRes, pitchesRes] = await Promise.all([
    supabase.from('brands').select('*').in('id', [survivorId, loserId]),
    supabase
      .from('contact_brands')
      .select('*')
      .in('brand_id', [survivorId, loserId]),
    supabase.from('pitches').select(PITCHES_SELECT).in('brand_id', [survivorId, loserId]),
  ])

  if (brandsRes.error) throw brandsRes.error
  if (linksRes.error) throw linksRes.error
  if (pitchesRes.error) throw pitchesRes.error

  const brands = (brandsRes.data ?? []) as Brand[]
  const survivor = brands.find((b) => b.id === survivorId)
  const loser = brands.find((b) => b.id === loserId)
  if (!survivor || !loser) {
    throw new Error(
      `loadBrandMergeInputs: missing brand(s) — survivor=${!!survivor}, loser=${!!loser}`,
    )
  }

  const allLinks = (linksRes.data ?? []) as ContactBrand[]
  const survivor_contacts = allLinks.filter((cb) => cb.brand_id === survivorId)
  const loser_contacts = allLinks.filter((cb) => cb.brand_id === loserId)

  // Annotate each pitch by which brand it belongs to (single brand_id FK →
  // source is binary). Extract the embedded deal (deals[0]).
  const pitchRows = (pitchesRes.data ?? []) as PitchWithDealEmbed[]
  const pitches: BrandPitchWithProvenance[] = pitchRows.map((p) => {
    const deal = p.deals?.[0] ?? null
    const { deals: _deals, ...basePitch } = p
    void _deals
    return {
      ...basePitch,
      source: p.brand_id === survivorId ? 'survivor' : 'loser',
      deal_stage: deal?.stage ?? null,
      deal_current_amount: deal?.current_budget_amount ?? null,
      deal_current_currency: deal?.current_budget_currency ?? null,
    }
  })

  // contact_lookup — display names for every Contact linking either brand.
  const contactIds = new Set<string>()
  for (const cb of allLinks) contactIds.add(cb.contact_id)
  const contact_lookup = new Map<string, { id: string; name: string | null }>()
  if (contactIds.size > 0) {
    const { data: contactRows, error: contactsErr } = await supabase
      .from('contacts')
      .select('id, display_name')
      .in('id', Array.from(contactIds))
    if (contactsErr) throw contactsErr
    for (const c of (contactRows ?? []) as {
      id: string
      display_name: string | null
    }[]) {
      contact_lookup.set(c.id, { id: c.id, name: c.display_name })
    }
  }

  return {
    survivor,
    loser,
    survivor_contacts,
    loser_contacts,
    pitches,
    contact_lookup,
  }
}
