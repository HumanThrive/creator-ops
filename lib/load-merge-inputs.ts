// Loader helpers for the Combine ("merge_contacts") wizard. FR-9 #83.
//
// Builds the MergeInputs payload the wizard consumes (AC1.4 fresh-read shape:
// both contacts' full association graphs loaded from DB at wizard-open, not
// stale list data). Parallel-fetched via the browser supabase client; RLS
// scopes everything to the authed user.
//
// Per docs/engineering/learnings.md §1 Scope of the pattern: read-only
// fetches via Supabase JS client are the right pattern (no atomicity needed;
// the wizard's commit happens via the merge_contacts plpgsql RPC, which IS
// the atomic primitive).

import { createClient } from '@/lib/supabase/client'
import type {
  Contact,
  ContactBrand,
  ChannelEntry,
} from '@/lib/types/contact'
import type { Pitch } from '@/lib/types/pitch'
import type { DealStage } from '@/lib/types/deal'
import type {
  MergeInputs,
  PitchWithProvenance,
} from '@/lib/contact-merge'

// PostgREST embed shape — each pitch row carries a nested `deals` array (FK
// from deals.pitch_id). v1 UX is 1-to-1, so we extract deals[0]; multi-deal
// support deferred (no spec). Falls back to nulls when no deal row exists
// (e.g., auto-create skip-list excludes inbound spam / not_a_pitch).
type PitchWithDealEmbed = Pitch & {
  deals: Array<{
    stage: DealStage
    current_budget_amount: number | null
    current_budget_currency: string | null
  }>
}

// ============================================================================
// Email-owner lookup — for the DupEmailCallout entry point
// ============================================================================
// Per AC1.1: "default survivor = the email-owner (the record with history)."
// The callout fires after /api/contacts/update returns 409 on the
// contacts_user_primary_email_uniq partial UNIQUE; the server knows which
// Contact already holds the email, but the response shape doesn't currently
// surface the owner id. This client-side lookup is a thin shim — extract to
// the API response if/when the route is touched again.

export async function findContactByPrimaryEmail(
  email: string,
): Promise<{ id: string; slug: string | null; display_name: string | null } | null> {
  const supabase = createClient()
  // The partial UNIQUE index uses lower(<primary-email-identifier>); mirror
  // that here to find the right row regardless of input casing.
  // Slug included so the DupEmailCallout CREATE-flow "Open <name> Contact"
  // button can route to a slug-readable URL when present (Founder direction
  // 2026-06-02 mid-smoke; falls back to id at the callsite).
  const { data, error } = await supabase
    .from('contacts')
    .select('id, slug, display_name, channels')
    .limit(50)
  if (error) {
    console.error('findContactByPrimaryEmail: select failed', error)
    return null
  }
  if (!data) return null
  const lower = email.toLowerCase()
  for (const row of data) {
    const channels = (row.channels ?? []) as ChannelEntry[]
    const primaryEmail = channels.find(
      (c) =>
        c.kind === 'Email' &&
        c.primary &&
        typeof c.identifier === 'string' &&
        c.identifier.toLowerCase() === lower,
    )
    if (primaryEmail) {
      return { id: row.id, slug: row.slug ?? null, display_name: row.display_name }
    }
  }
  return null
}

// ============================================================================
// Search-by-name — for the DeleteBlockedModal entry point (typeahead pick)
// ============================================================================

export interface ContactSearchHit {
  id: string
  display_name: string | null
  slug: string | null
  primary_email: string | null
}

export async function searchContactsByName(
  query: string,
  excludeId: string,
): Promise<ContactSearchHit[]> {
  const q = query.trim()
  if (!q) return []
  const supabase = createClient()
  const { data, error } = await supabase
    .from('contacts')
    .select('id, display_name, slug, channels')
    .neq('id', excludeId)
    .ilike('display_name', `%${q}%`)
    .limit(8)
  if (error) {
    console.error('searchContactsByName: select failed', error)
    return []
  }
  return (data ?? []).map((row) => {
    const channels = (row.channels ?? []) as ChannelEntry[]
    const primaryEmail =
      channels.find((c) => c.kind === 'Email' && c.primary)?.identifier ?? null
    return {
      id: row.id,
      display_name: row.display_name,
      slug: row.slug,
      primary_email: primaryEmail,
    }
  })
}

// ============================================================================
// MergeInputs loader — full association graphs for both contacts (AC1.4)
// ============================================================================

export async function loadMergeInputs(
  survivorId: string,
  loserId: string,
): Promise<MergeInputs> {
  const supabase = createClient()

  // Parallel-fetch the four base sets. RLS scopes everything to the authed
  // user; the .in() filters narrow to the two contacts.
  // Pitches embed their `deals` row via PostgREST (FK deals.pitch_id); v1 1-to-1
  // means deals[0] or empty. Embedding avoids a separate round-trip on the
  // hundreds-of-pitches edge case (Founder direction 2026-06-02 scale guard).
  const PITCHES_SELECT =
    '*, deals(stage, current_budget_amount, current_budget_currency)'
  const [contactsRes, brandsRes, pivotsRes, pitchesByFkRes] = await Promise.all([
    supabase.from('contacts').select('*').in('id', [survivorId, loserId]),
    supabase
      .from('contact_brands')
      .select('*')
      .in('contact_id', [survivorId, loserId]),
    supabase
      .from('contact_pitches')
      .select('contact_id, pitch_id')
      .in('contact_id', [survivorId, loserId]),
    supabase
      .from('pitches')
      .select(PITCHES_SELECT)
      .in('contact_id', [survivorId, loserId]),
  ])

  if (contactsRes.error) throw contactsRes.error
  if (brandsRes.error) throw brandsRes.error
  if (pivotsRes.error) throw pivotsRes.error
  if (pitchesByFkRes.error) throw pitchesByFkRes.error

  const contacts = (contactsRes.data ?? []) as Contact[]
  const survivor = contacts.find((c) => c.id === survivorId)
  const loser = contacts.find((c) => c.id === loserId)
  if (!survivor || !loser) {
    throw new Error(
      `loadMergeInputs: missing contact(s) — survivor=${!!survivor}, loser=${!!loser}`,
    )
  }

  const allBrands = (brandsRes.data ?? []) as ContactBrand[]
  const survivor_brands = allBrands.filter((cb) => cb.contact_id === survivorId)
  const loser_brands = allBrands.filter((cb) => cb.contact_id === loserId)

  const pivots = (pivotsRes.data ?? []) as { contact_id: string; pitch_id: string }[]
  const survivorPivotPitchIds = new Set(
    pivots.filter((p) => p.contact_id === survivorId).map((p) => p.pitch_id),
  )
  const loserPivotPitchIds = new Set(
    pivots.filter((p) => p.contact_id === loserId).map((p) => p.pitch_id),
  )

  // Pitches: union of FK-linked + pivot-linked. The FK fetch covered
  // pitches.contact_id IN [...]; the pivot fetch tells us which pitches are
  // ALSO referenced via M:N — those rows we still need to fetch if they
  // weren't in the FK set.
  const pitchesByFk = (pitchesByFkRes.data ?? []) as PitchWithDealEmbed[]
  const haveById = new Map<string, PitchWithDealEmbed>()
  for (const p of pitchesByFk) haveById.set(p.id, p)

  const allPivotPitchIds = new Set([
    ...survivorPivotPitchIds,
    ...loserPivotPitchIds,
  ])
  const missingPivotPitchIds = Array.from(allPivotPitchIds).filter(
    (id) => !haveById.has(id),
  )
  if (missingPivotPitchIds.length > 0) {
    const { data: extraPitches, error: extraErr } = await supabase
      .from('pitches')
      .select(PITCHES_SELECT)
      .in('id', missingPivotPitchIds)
    if (extraErr) throw extraErr
    for (const p of (extraPitches ?? []) as PitchWithDealEmbed[])
      haveById.set(p.id, p)
  }

  // Annotate provenance + extract deal data for each pitch the wizard renders.
  // Source rules:
  //   - 'both'     — pitch is referenced from BOTH contacts (either via FK
  //                  pointing one + pivot pointing the other, or via pivots
  //                  on both, or any combination producing both-sides).
  //   - 'survivor' — pitch comes from survivor only.
  //   - 'loser'    — pitch comes from loser only.
  // FK ownership counts as one-side; pivots count as one-side.
  // Deal fields: deals[0] (v1 UX 1-to-1). Null fall-through for pitches with
  // no deal row (e.g., auto-create skip-list excludes inbound spam/not_a_pitch).
  const pitches: PitchWithProvenance[] = []
  for (const p of haveById.values()) {
    const fromSurvivor =
      p.contact_id === survivorId || survivorPivotPitchIds.has(p.id)
    const fromLoser =
      p.contact_id === loserId || loserPivotPitchIds.has(p.id)
    const source: PitchWithProvenance['source'] =
      fromSurvivor && fromLoser
        ? 'both'
        : fromSurvivor
          ? 'survivor'
          : 'loser'
    const deal = p.deals?.[0] ?? null
    // Strip the embed-only `deals` field from the spread so the resulting
    // PitchWithProvenance stays clean.
    const { deals: _deals, ...basePitch } = p
    void _deals
    pitches.push({
      ...basePitch,
      source,
      deal_stage: deal?.stage ?? null,
      deal_current_amount: deal?.current_budget_amount ?? null,
      deal_current_currency: deal?.current_budget_currency ?? null,
    })
  }

  // Brands lookup — unique brand_ids from contact_brands + pitches.brand_id.
  const brandIds = new Set<string>()
  for (const cb of allBrands) brandIds.add(cb.brand_id)
  for (const p of pitches) if (p.brand_id) brandIds.add(p.brand_id)
  const brand_lookup = new Map<string, { id: string; name: string }>()
  if (brandIds.size > 0) {
    const { data: brandsRows, error: brandsErr } = await supabase
      .from('brands')
      .select('id, name')
      .in('id', Array.from(brandIds))
    if (brandsErr) throw brandsErr
    for (const b of (brandsRows ?? []) as { id: string; name: string }[]) {
      brand_lookup.set(b.id, b)
    }
  }

  return {
    survivor,
    loser,
    survivor_brands,
    loser_brands,
    pitches,
    brand_lookup,
  }
}
