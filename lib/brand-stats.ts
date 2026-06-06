// Brand aggregation helpers for `/app/brands` list + detail.
//
// CR-7 S2 — brand_id-keyed aggregation over the canonical `brands` table.
// Mirrors lib/contact-stats.ts (load rows in the server component, aggregate
// deterministically here; no DB calls in this module). Replaces the pre-CR-7
// text-derived path (computeBrandSummaries / findBrandDetail in lib/pitch-stats.ts,
// which grouped pitches.brand_name per render).
//
// Spec: workspace/build-requests/CR-7-brands-replatform.md §Architecture A + AC1.x.

import type { Brand } from '@/lib/types/brand'
import type { Pitch } from '@/lib/types/pitch'
import type { Deal } from '@/lib/types/deal'
import { effectiveBudget, type CurrencyTotal } from '@/lib/pitch-stats'

// The synthetic bucket for NULL-brand_name pitches (no `brands` row exists —
// brands.name is NOT NULL). The one place the surface stays pitch-derived.
export const UNKNOWN_BRAND_SLUG = '__unknown__'

export interface BrandSummary {
  brand_id: string | null // null only for the Unknown bucket
  slug: string | null // canonical slug (null → routes by brand_id)
  // Resolved URL segment + React key: slug ?? brand_id, or '__unknown__'.
  // Always non-null + unique within the list (slug unique per user; brand_id
  // unique; Unknown is a singleton) so it doubles as the list key (AC2.3).
  routeSegment: string
  displayName: string // brands.name (or '(Unknown brand)')
  isUnknown: boolean
  pitchCount: number
  lastContactAt: string // ISO; most-recent pitch, or brands.created_at for a 0-pitch brand
  currencyTotals: CurrencyTotal[] // sorted desc by amount
}

export interface BrandSummaries {
  known: BrandSummary[] // sort is the consumer's call (Recent / By value)
  unknown: BrandSummary | null // present only when 1+ pitches have NULL brand_id
}

function buildDealMap(deals: Deal[]): Map<string, Deal> {
  const m = new Map<string, Deal>()
  for (const d of deals) m.set(d.pitch_id, d)
  return m
}

function currencyTotalsFor(
  pitches: Pitch[],
  dealMap: Map<string, Deal>,
): CurrencyTotal[] {
  const sums = new Map<string, number>()
  for (const p of pitches) {
    const eff = effectiveBudget(p, dealMap.get(p.id))
    if (!eff) continue
    sums.set(eff.currency, (sums.get(eff.currency) ?? 0) + eff.amount)
  }
  return Array.from(sums.entries())
    .map(([currency, amount]) => ({ currency, amount }))
    .sort((a, b) => b.amount - a.amount)
}

function lastContactAt(pitches: Pitch[]): string {
  return pitches.reduce(
    (max, p) => (p.created_at > max ? p.created_at : max),
    pitches[0].created_at,
  )
}

// Build per-brand summaries from canonical `brands` rows + the user's pitches/deals.
//   - Known brands: one row per `brands` row. FR-11 AC1.3 shows ALL brands incl.
//     0-pitch ones (the CR-7 §F hide is lifted) so created/empty brands are visible
//     and manageable; a 0-pitch row carries counts=0 + created_at as its last touch.
//   - Unknown bucket: NULL-brand_id pitches (≡ NULL brand_name; reconciliation
//     verified clean V1=0) aggregate into the synthetic (Unknown brand) row (AC1.3).
// Identity is brand_id, not text — no per-render text-grouping (AC1.4 / AC3.3).
export function computeBrandSummaries(
  brands: Brand[],
  pitches: Pitch[],
  deals: Deal[],
): BrandSummaries {
  const dealMap = buildDealMap(deals)

  // Bucket pitches by brand_id; NULL brand_id → Unknown bucket.
  const byBrandId = new Map<string, Pitch[]>()
  const unknownPitches: Pitch[] = []
  for (const p of pitches) {
    if (p.brand_id) {
      const bucket = byBrandId.get(p.brand_id) ?? []
      bucket.push(p)
      byBrandId.set(p.brand_id, bucket)
    } else {
      unknownPitches.push(p)
    }
  }

  const known: BrandSummary[] = []
  for (const brand of brands) {
    // FR-11 AC1.3: emit a row for every brand, incl. 0-pitch (CR-7 §F hide lifted).
    // `lastContactAt(group)` reduces over group[0], so only call it when the group
    // is non-empty; a 0-pitch brand falls back to brands.created_at.
    const group = byBrandId.get(brand.id) ?? []
    known.push({
      brand_id: brand.id,
      slug: brand.slug,
      routeSegment: brand.slug ?? brand.id,
      displayName: brand.name,
      isUnknown: false,
      pitchCount: group.length,
      lastContactAt: group.length > 0 ? lastContactAt(group) : brand.created_at,
      currencyTotals: group.length > 0 ? currencyTotalsFor(group, dealMap) : [],
    })
  }

  let unknown: BrandSummary | null = null
  if (unknownPitches.length > 0) {
    unknown = {
      brand_id: null,
      slug: UNKNOWN_BRAND_SLUG,
      routeSegment: UNKNOWN_BRAND_SLUG,
      displayName: '(Unknown brand)',
      isUnknown: true,
      pitchCount: unknownPitches.length,
      lastContactAt: lastContactAt(unknownPitches),
      currencyTotals: currencyTotalsFor(unknownPitches, dealMap),
    }
  }

  return { known, unknown }
}

export interface BrandDetail {
  pitches: Pitch[] // sorted desc by created_at
  pitchCount: number
  firstContactAt: string // ISO — oldest pitch
  lastContactAt: string // ISO — most-recent pitch
}

// CR-7 S3 — detail aggregation for one brand's already-FK-filtered pitches
// (loaded WHERE brand_id = X, or WHERE brand_id IS NULL for the Unknown bucket).
// Returns null when there are no pitches. FR-11: a real 0-pitch brand is now a
// valid destination — the page renders the empty-state panel instead of bouncing;
// only an empty Unknown bucket still bounces. Display name + isUnknown come from
// the page's canonical brand row.
export function computeBrandDetail(pitches: Pitch[]): BrandDetail | null {
  if (pitches.length === 0) return null
  const sorted = [...pitches].sort((a, b) =>
    a.created_at < b.created_at ? 1 : -1,
  )
  return {
    pitches: sorted,
    pitchCount: sorted.length,
    firstContactAt: sorted[sorted.length - 1].created_at,
    lastContactAt: sorted[0].created_at,
  }
}
