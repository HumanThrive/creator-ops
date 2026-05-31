// Contact aggregation helpers for `/app/people` list + PeopleStatsStrip.
//
// Mirrors lib/pitch-stats.ts shape (computeBrandSummaries / PitchStats).
// All math is deterministic from rows loaded by the server component;
// no DB calls inside this module.
//
// FR-8 S1 (slice #75) per spec §Architecture + Delta 2.

import type {
  ChannelEntry,
  Contact,
  ContactBrand,
  ContactRole,
} from '@/lib/types/contact'
import type { Pitch } from '@/lib/types/pitch'

// Window used by FR-7's "current vs prior" derivation. Per FR-7 [person]/page.tsx
// CURRENT_BRAND_WINDOW_DAYS = 90. Match exactly.
const CURRENT_BRAND_WINDOW_DAYS = 90

export interface BrandLinkSummary {
  brand_id: string
  brand_name: string
  role: ContactRole | null
  is_current: boolean
  // `is_concurrent` = recent activity AND ≥2 brands have recent activity for
  // this contact (Connector / overlapping-client case).
  is_concurrent: boolean
  // `is_prior` = brand has pitches but none within the recent-90d window.
  is_prior: boolean
  pitch_count: number
  last_pitch_at: string | null
  ended_at: string | null
}

export interface ContactSummary {
  id: string
  slug: string | null
  display_name: string
  // Brand-chain rendered as a comma-list sub-line ("currently at X · previously at Y").
  // First entry = "current" when present, ordered most-recent-pitch first.
  brand_links: BrandLinkSummary[]
  current_brand: BrandLinkSummary | null
  // Role at the current brand. Null when no current brand OR role unspecified.
  current_role: ContactRole | null
  // True when the contact's roles differ across brands (multi-role +N affix trigger).
  has_multi_roles: boolean
  // All channels on the Contact, in JSONB array order.
  channels: ChannelEntry[]
  // Primary channel for the dot-strip primary line (first Primary=true; falls back to first channel).
  primary_channel: ChannelEntry | null
  brand_count: number  // total brand_links length (incl. ended? — see below)
  pitch_count: number  // sum of brand_links.pitch_count
  last_touch_at: string | null  // most-recent pitch across all brands
  is_connector: boolean  // 2+ brands with recent activity
}

export interface PeopleStats {
  total: number
  new_this_month: number
  most_touched_brand: { brand_id: string; brand_name: string; count: number } | null
}

// Compute per-contact summaries from loaded rows. Pre-conditions:
//   - `contact_brands` includes `brands(id, name)` joined; sender provides as
//     a normalized BrandLink shape via the `brand_lookup` map.
//   - `contact_pitches` provides (contact_id, pitch_id) pairs; matched against
//     `pitches` map for created_at + brand_id lookups.
//   - All inputs scoped to the authed user already (server-side fetch is
//     RLS-protected; no further per-user filtering here).
export function computeContactSummaries(
  contacts: Contact[],
  contactBrands: ContactBrand[],
  contactPitches: { contact_id: string; pitch_id: string }[],
  pitches: Pitch[],
  brandLookup: Map<string, { id: string; name: string }>,
): ContactSummary[] {
  const now = Date.now()
  const DAY_MS = 24 * 60 * 60 * 1000

  // Build (contact_id -> Pitch[]) map via the pivot.
  const pitchById = new Map<string, Pitch>()
  for (const p of pitches) pitchById.set(p.id, p)

  const pitchesByContact = new Map<string, Pitch[]>()
  for (const cp of contactPitches) {
    const p = pitchById.get(cp.pitch_id)
    if (!p) continue
    const bucket = pitchesByContact.get(cp.contact_id) ?? []
    bucket.push(p)
    pitchesByContact.set(cp.contact_id, bucket)
  }

  // Bucket contact_brands by contact (filter out ended ones from active view
  // per AC5.6 — they'd render under a "Prior" branch on detail page, not on
  // the index row's chain sub-line for v1).
  const brandsByContact = new Map<string, ContactBrand[]>()
  for (const cb of contactBrands) {
    if (cb.ended_at !== null) continue // AC5.6 active-derivation filter
    const bucket = brandsByContact.get(cb.contact_id) ?? []
    bucket.push(cb)
    brandsByContact.set(cb.contact_id, bucket)
  }

  return contacts.map((c) => {
    const cbs = brandsByContact.get(c.id) ?? []
    const cps = (pitchesByContact.get(c.id) ?? []).slice().sort(
      (a, b) => b.created_at.localeCompare(a.created_at),
    )

    // Per-brand pitch buckets for THIS contact.
    const recentByBrandId = new Map<string, number>()
    const allByBrandId = new Map<string, Pitch[]>()
    for (const p of cps) {
      if (!p.brand_id) continue
      const bucket = allByBrandId.get(p.brand_id) ?? []
      bucket.push(p)
      allByBrandId.set(p.brand_id, bucket)
      if (now - new Date(p.created_at).getTime() < CURRENT_BRAND_WINDOW_DAYS * DAY_MS) {
        recentByBrandId.set(p.brand_id, (recentByBrandId.get(p.brand_id) ?? 0) + 1)
      }
    }

    const isConnector = recentByBrandId.size > 1

    // "Current brand" heuristic (mirrors FR-7 [person]/page.tsx):
    //   - If exactly one brand has recent pitches, it's current.
    //   - If 2+ brands have recent pitches (Connector case), no single "current" —
    //     leave null; brand_links carry the picture.
    //   - If no brand has recent pitches but contact has brand associations, pick
    //     the brand whose last_pitch_at is most recent (still expressed as the
    //     "primary association" for chain rendering).
    let currentBrandId: string | null = null
    if (recentByBrandId.size === 1) {
      currentBrandId = Array.from(recentByBrandId.keys())[0] ?? null
    }

    // Build sorted brand_links: most-recent-pitch first; no-pitch brands by name.
    const brandLinks: BrandLinkSummary[] = cbs
      .map((cb) => {
        const lookup = brandLookup.get(cb.brand_id)
        const brandPitches = allByBrandId.get(cb.brand_id) ?? []
        const lastPitch = brandPitches[0]?.created_at ?? null
        const isRecent = (recentByBrandId.get(cb.brand_id) ?? 0) > 0
        return {
          brand_id: cb.brand_id,
          brand_name: lookup?.name ?? '(unknown brand)',
          role: cb.role,
          is_current: cb.brand_id === currentBrandId,
          is_concurrent: isConnector && isRecent,
          is_prior: !isRecent && brandPitches.length > 0,
          pitch_count: brandPitches.length,
          last_pitch_at: lastPitch,
          ended_at: cb.ended_at,
        }
      })
      .sort((a, b) => {
        if (a.last_pitch_at && b.last_pitch_at) {
          return b.last_pitch_at.localeCompare(a.last_pitch_at)
        }
        if (a.last_pitch_at && !b.last_pitch_at) return -1
        if (!a.last_pitch_at && b.last_pitch_at) return 1
        return a.brand_name.localeCompare(b.brand_name)
      })

    const currentBrand =
      brandLinks.find((bl) => bl.is_current) ?? brandLinks[0] ?? null

    // Detect multi-role state: any two non-null roles that differ across brand_links.
    const roles = brandLinks
      .map((bl) => bl.role)
      .filter((r): r is ContactRole => r !== null)
    const uniqueRoles = new Set(roles)
    const hasMultiRoles = uniqueRoles.size > 1

    const primaryChannel: ChannelEntry | null =
      c.channels.find((ch) => ch.primary) ?? c.channels[0] ?? null

    return {
      id: c.id,
      slug: c.slug,
      display_name: c.display_name ?? '(no name)',
      brand_links: brandLinks,
      current_brand: currentBrand,
      current_role: currentBrand?.role ?? null,
      has_multi_roles: hasMultiRoles,
      channels: c.channels,
      primary_channel: primaryChannel,
      brand_count: brandLinks.length,
      pitch_count: cps.length,
      last_touch_at: cps[0]?.created_at ?? null,
      is_connector: isConnector,
    }
  })
}

// Aggregate stats for PeopleStatsStrip. `now` injectable for tests / SSR determinism.
export function computePeopleStats(
  summaries: ContactSummary[],
  contactBrands: ContactBrand[],
  brandLookup: Map<string, { id: string; name: string }>,
  now: Date = new Date(),
): PeopleStats {
  const total = summaries.length

  // "New this month" = contacts whose oldest associated pitch (proxy for
  // first-contact moment) is in the current calendar month. For contacts
  // with no pitches, fall back to created_at (which we don't carry on the
  // summary; for v1 use the last_touch_at as a coarse proxy + skip
  // no-pitch contacts from the count).
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  let newThisMonth = 0
  for (const s of summaries) {
    if (s.last_touch_at && s.last_touch_at >= startOfMonth) newThisMonth += 1
  }

  // Most-touched brand: across all contact_brands (active OR ended — informational),
  // pick the brand with the highest contact count.
  const brandTouchCount = new Map<string, number>()
  for (const cb of contactBrands) {
    brandTouchCount.set(cb.brand_id, (brandTouchCount.get(cb.brand_id) ?? 0) + 1)
  }
  let topBrandId: string | null = null
  let topCount = 0
  for (const [brandId, count] of brandTouchCount.entries()) {
    if (count > topCount) {
      topCount = count
      topBrandId = brandId
    }
  }
  const lookup = topBrandId ? brandLookup.get(topBrandId) : null
  const mostTouchedBrand =
    topBrandId && lookup
      ? { brand_id: topBrandId, brand_name: lookup.name, count: topCount }
      : null

  return { total, new_this_month: newThisMonth, most_touched_brand: mostTouchedBrand }
}

// Search predicate — matches against display_name, brand_links names, and
// channel identifiers. Case-insensitive. Per Delta 2 + Founder Q1 lock.
export function contactMatchesQuery(
  summary: ContactSummary,
  query: string,
): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  if (summary.display_name.toLowerCase().includes(q)) return true
  for (const bl of summary.brand_links) {
    if (bl.brand_name.toLowerCase().includes(q)) return true
  }
  for (const ch of summary.channels) {
    if (ch.identifier.toLowerCase().includes(q)) return true
  }
  return false
}
