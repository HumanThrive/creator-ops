// Shared resolution module for the Combine ("merge_contacts") wizard.
//
// Produces BOTH the wizard preview render AND the `merge_contacts` RPC payload
// from a single computation pass — the **preview == commit invariant** (R8 +
// AC3.2). One function source-of-truth ensures the user can't see one state in
// preview and end up with another after commit.
//
// Spec: workspace/build-requests/FR-9-contact-merge.md
//   §Architecture · Preview computation (R8) + Conflict-resolution matrix
//   §Acceptance Criteria — AC1.4 (fresh read), AC2.1-2.7 (review + resolve),
//     AC3.1 (preview shape), AC3.2 (preview == commit), AC-M1 (same-pitch dedup)
//   §Governing interaction principle — default-resolved + user-overridable
//
// Used by:
//   - CombineWizard (FR-9 #82 — Review/Resolve/Preview steps): both the
//     preview render AND the commit POST consume the same MergeResult.
//   - Future merge-style flows (Brand merge FR-10) may lift this pattern.
//
// Engineering canon: docs/engineering/learnings.md §1 atomic RPC pattern
//   (this module IS the TS-side counterpart that builds the payload for the
//    plpgsql merge_contacts atomic RPC).

import type {
  ChannelEntry,
  ChannelKind,
  Contact,
  ContactBrand,
  ContactRole,
} from '@/lib/types/contact'
import type { Pitch, PitchDirection } from '@/lib/types/pitch'
import type { DealStage } from '@/lib/types/deal'

// ============================================================================
// INPUT TYPES
// ============================================================================

// A pitch with provenance — the page-level loader annotates each pitch by
// which contact it pre-merge belongs to. AC-M1 same-pitch dedup case
// (a pitch linked to BOTH contacts via the contact_pitches pivot) is
// represented as `source: 'both'` and renders once in the unified history.
// Deal fields embed-extracted by the loader (1-to-1 v1 UX); null when the
// pitch has no deal row (e.g., auto-create skip-list excludes inbound
// spam / not_a_pitch). Per Founder direction 2026-06-02 Step-3 history rows
// render stage chip + current amount per canon.
export interface PitchWithProvenance extends Pitch {
  source: 'survivor' | 'loser' | 'both'
  deal_stage: DealStage | null
  deal_current_amount: number | null
  deal_current_currency: string | null
}

// All inputs the module needs. The page-level loader fetches these fresh at
// wizard-open (AC1.4) — no stale list data. Server-side fetch is RLS-scoped;
// no further per-user filtering inside this module.
export interface MergeInputs {
  survivor: Contact
  loser: Contact
  survivor_brands: ContactBrand[]
  loser_brands: ContactBrand[]
  // Pitches linked to either contact (via pitches.contact_id OR
  // contact_pitches pivot), deduped + annotated by the loader.
  pitches: PitchWithProvenance[]
  // brand_id → { id, name } lookup for both contacts' brand_links.
  brand_lookup: Map<string, { id: string; name: string }>
}

// ============================================================================
// USER RESOLUTION TYPES
// ============================================================================

// A channel identified by its (kind, identifier) pair. The wizard's Primary
// pick references one specific channel in the union.
export interface ChannelKey {
  kind: ChannelKind
  identifier: string
}

// Per-Brand resolution for brands where BOTH contacts have a contact_brands
// row (conflicting in the DB-write sense, regardless of whether values differ).
// `role` reflects the user's pick (default = survivor's role).
// `ended_at` / `ended_reason` reflect the user's pick for both-ended cells;
// the RPC ignores these for mixed-state (active+ended) cells per AC2.6
// (deterministic active-wins applied server-side regardless of payload).
export interface BrandResolution {
  role: ContactRole | null
  ended_at: string | null
  ended_reason: string | null
}

// Final user-resolved picks across the wizard. `computeDefaultResolutions`
// seeds this from survivor's values + deterministic rules; the wizard
// updates entries on user override; the wizard passes the final shape to
// `computeMergeResult` for both preview and commit.
export interface MergeResolutions {
  display_name: string | null
  // Resolved Primary channel reference. The wizard pre-selects survivor's
  // Primary; user can pick a different channel from the union. Null only
  // when neither contact has a Primary AND the user didn't promote one.
  primary_channel: ChannelKey | null
  // Per-brand resolution keyed by brand_id. Only entries for
  // CONFLICTING brands (both contacts have a row for that brand_id).
  // Survivor-only and loser-only brands aren't in this map — the RPC
  // re-points loser-only via simple UPDATE; survivor-only stays as-is.
  per_brand: Record<string, BrandResolution>
}

// ============================================================================
// OUTPUT TYPES — preview side
// ============================================================================

// "from <dup>" provenance tag per AC3.1 — drives the `--pick` tint on the
// preview's brand cards + pitch-history rows (D4 visual contract).
export type Provenance = 'survivor' | 'loser' | 'merged'

export interface BrandCardPreview {
  brand_id: string
  brand_name: string
  role: ContactRole | null
  ended_at: string | null
  ended_reason: string | null
  // Earliest created_at across both contacts' rows for this brand (R6/RPC
  // deterministic rule); drives "linked since" rendering.
  created_at: string
  provenance: Provenance
  // Total pitch count for this brand across both contacts post-merge.
  pitch_count: number
  // Most-recent pitch timestamp on this brand (for sort + "last pitch on
  // <date>" copy).
  last_pitch_at: string | null
}

export interface PitchHistoryItem {
  pitch_id: string
  brand_id: string | null
  brand_name: string | null
  // Brief pitch summary for the row's middle column (canon row format:
  // `<date> <brand> · <summary> <stage> <amount>`). Falls back to empty
  // when AI summary unavailable.
  summary: string
  created_at: string
  // "from <dup>" tag — true when this pitch was linked ONLY to the loser
  // pre-merge. Same-pitch dedup (AC-M1, source='both') renders without
  // the tag — neither side gets "from <dup>" credit for a shared pitch.
  from_loser: boolean
  // Deal state — drives the stage chip + current amount columns per canon
  // (Stress-Test line 624–628). Null when the pitch has no deal row.
  direction: PitchDirection
  stage: DealStage | null
  current_amount: number | null
  current_currency: string | null
}

export interface SurvivorPreview {
  survivor_id: string
  display_name: string | null
  // Unioned channels with the single resolved Primary; identical
  // (kind, identifier) pairs deduped to one entry.
  channels: ChannelEntry[]
  // Combined brand cards (one per unique brand_id post-merge), sorted
  // most-recent-pitch first then alphabetical.
  brand_cards: BrandCardPreview[]
  // Unified pitch history, sorted by created_at desc.
  pitch_history: PitchHistoryItem[]
  // Survivor's previous_slugs after folding loser's slug + history.
  // The loser's old slug-URL 301-redirects to survivor via this list
  // (AC3.5 + R10 + FR-8 slug-redirect machinery).
  previous_slugs: string[]
}

// ============================================================================
// OUTPUT TYPES — RPC payload side
// ============================================================================

// Wire-format mirror of `merge_contacts(...)` params.
// Spec: workspace/lead-dev/outbox/2026-06-02-fr9-m1-merge-contacts.sql header.
// Keyed by brand_id::text in p_brand_resolutions; RPC handles tolerantly
// (entries for non-conflicting brands are harmless, omitted entries fall back
// to deterministic logic).
export interface MergePayload {
  p_survivor_id: string
  p_loser_id: string
  p_display_name: string | null
  p_channels: ChannelEntry[]
  p_brand_resolutions: Record<
    string,
    { role: string | null; ended_at: string | null; ended_reason: string | null }
  >
}

export interface MergeResult {
  preview: SurvivorPreview
  payload: MergePayload
}

// ============================================================================
// DEFAULT RESOLUTION COMPUTATION
// ============================================================================

// Seed the wizard's resolution state from inputs. Every value-conflict cell
// pre-selects a sensible default per the governing principle
// (default-resolved + user-overridable). The wizard renders the defaults
// and allows per-cell override before passing the final state to
// computeMergeResult.
export function computeDefaultResolutions(inputs: MergeInputs): MergeResolutions {
  const { survivor, loser, survivor_brands, loser_brands } = inputs

  // Display name default: survivor's (R3 — survivor = identity anchor;
  // separate cell from survivor pick).
  const display_name = survivor.display_name

  // Primary channel default: survivor's Primary if exists; else loser's;
  // else null (rare — neither carries any Primary; user can promote one
  // in the wizard).
  const survivorPrimary = survivor.channels.find((c) => c.primary)
  const loserPrimary = loser.channels.find((c) => c.primary)
  const primaryFallback = survivorPrimary ?? loserPrimary
  const primary_channel: ChannelKey | null = primaryFallback
    ? { kind: primaryFallback.kind, identifier: primaryFallback.identifier }
    : null

  // Per-brand resolution: only for brands where BOTH contacts have a row.
  const survivorBrandIds = new Set(survivor_brands.map((cb) => cb.brand_id))
  const per_brand: Record<string, BrandResolution> = {}

  for (const lcb of loser_brands) {
    if (!survivorBrandIds.has(lcb.brand_id)) continue // loser-only; no resolution needed
    const scb = survivor_brands.find((c) => c.brand_id === lcb.brand_id)!
    per_brand[lcb.brand_id] = computeBrandResolutionDefault(scb, lcb)
  }

  return { display_name, primary_channel, per_brand }
}

// Per AC2.5–2.7 + the conflict-resolution matrix:
//   - Role: default survivor's (interactive cell).
//   - State mixed (one active + one ended): deterministic active-wins;
//     ended_at = null, ended_reason = null.
//   - State both-active: combined active; nothing to resolve on state.
//   - State both-ended: default to most-recent ended_at + paired ended_reason
//     (interactive — user can override).
function computeBrandResolutionDefault(
  survivor: ContactBrand,
  loser: ContactBrand,
): BrandResolution {
  const role = survivor.role

  // Mixed state OR both-active → active deterministic.
  if (survivor.ended_at === null || loser.ended_at === null) {
    return { role, ended_at: null, ended_reason: null }
  }

  // Both ended → default most-recent.
  if (loser.ended_at > survivor.ended_at) {
    return { role, ended_at: loser.ended_at, ended_reason: loser.ended_reason }
  }
  return { role, ended_at: survivor.ended_at, ended_reason: survivor.ended_reason }
}

// ============================================================================
// MAIN COMPUTATION
// ============================================================================

// Compute the merge result — both preview AND commit payload — from inputs +
// user-resolved picks. Single pass; preview and payload are derived from the
// SAME computation (R8: preview == commit invariant). No DB calls; pure
// function over loaded rows.
export function computeMergeResult(
  inputs: MergeInputs,
  resolutions: MergeResolutions,
): MergeResult {
  const channels = mergeChannels(inputs, resolutions)
  const brand_cards = buildBrandCards(inputs, resolutions)
  const pitch_history = buildPitchHistory(inputs)
  const previous_slugs = foldPreviousSlugs(inputs.survivor, inputs.loser)

  const preview: SurvivorPreview = {
    survivor_id: inputs.survivor.id,
    display_name: resolutions.display_name,
    channels,
    brand_cards,
    pitch_history,
    previous_slugs,
  }

  const payload: MergePayload = {
    p_survivor_id: inputs.survivor.id,
    p_loser_id: inputs.loser.id,
    p_display_name: resolutions.display_name,
    p_channels: channels,
    p_brand_resolutions: buildBrandResolutionsPayload(resolutions.per_brand),
  }

  return { preview, payload }
}

// ----------------------------------------------------------------------------
// Channel merge — union + dedup + apply Primary per resolutions (AC2.4)
// ----------------------------------------------------------------------------

function mergeChannels(
  inputs: MergeInputs,
  resolutions: MergeResolutions,
): ChannelEntry[] {
  // Per Founder direction 2026-06-02 (§1.16 smoke iteration): when a Primary
  // conflict exists, the NON-PICKED Primary is DISCARDED from the merged
  // union — not auto-carried as a Secondary. Symmetric: applies whether the
  // picked Primary is the keeper's or the loser's (whichever wasn't chosen
  // gets dropped). Loser's OTHER non-Primary channels carry over normally.
  // Matches the DupEmailCallout editing-intent: the user was editing AWAY
  // from that Primary value, so importing it as Secondary contradicts intent.
  const discardKey = computePrimaryDiscardKey(inputs, resolutions)

  // Union + dedup identical (kind, identifier) pairs.
  const seen = new Set<string>()
  const merged: ChannelEntry[] = []
  for (const ch of [...inputs.survivor.channels, ...inputs.loser.channels]) {
    const key = channelKey(ch)
    if (seen.has(key)) continue
    if (key === discardKey) continue
    seen.add(key)
    // Reset Primary; we'll set exactly one below per resolutions.
    merged.push({ ...ch, primary: false })
  }

  // Apply resolved Primary. The wizard guarantees primary_channel references
  // a real channel in the union (since the picker shows only union options);
  // if it doesn't match (edge case — payload pre-dates a channel removal in
  // between wizard open and commit), the merged channels carry no Primary
  // (acceptable — the partial UNIQUE index is partial WHERE kind=Email, so
  // a Primary-less union won't fire it; the user can fix post-merge).
  if (resolutions.primary_channel) {
    const target = keyString(resolutions.primary_channel)
    for (const ch of merged) {
      if (channelKey(ch) === target) ch.primary = true
    }
  }

  return merged
}

// Identify the (kind, identifier) key of the Primary channel that is being
// discarded from the merge. Returns null when no Primary conflict exists
// (one or both sides lack a Primary, or both Primaries point at the same
// value). Exported so the wizard's Step-2 carry-over panel can also filter
// the discarded channel from its "carries over automatically" list — the
// visible carry-over set must match the actual committed merged channels.
export function computePrimaryDiscardKey(
  inputs: MergeInputs,
  resolutions: MergeResolutions,
): string | null {
  const sPrimary = inputs.survivor.channels.find((c) => c.primary)
  const lPrimary = inputs.loser.channels.find((c) => c.primary)
  if (!sPrimary || !lPrimary) return null
  const sKey = keyString({ kind: sPrimary.kind, identifier: sPrimary.identifier })
  const lKey = keyString({ kind: lPrimary.kind, identifier: lPrimary.identifier })
  if (sKey === lKey) return null
  const pickedKey = resolutions.primary_channel
    ? keyString(resolutions.primary_channel)
    : sKey
  if (pickedKey === sKey) return lKey
  if (pickedKey === lKey) return sKey
  // User picked neither (shouldn't happen given the chooser only surfaces the
  // two Primary values, but if it does — keep both, discard nothing).
  return null
}

function channelKey(ch: ChannelEntry): string {
  return keyString({ kind: ch.kind, identifier: ch.identifier })
}

function keyString(k: ChannelKey): string {
  return `${k.kind}::${k.identifier}`
}

// ----------------------------------------------------------------------------
// Brand cards — combined per-brand preview (D4 visual contract)
// ----------------------------------------------------------------------------

function buildBrandCards(
  inputs: MergeInputs,
  resolutions: MergeResolutions,
): BrandCardPreview[] {
  const { survivor_brands, loser_brands, brand_lookup, pitches } = inputs

  // Group pitches by brand_id for per-brand counts + last-pitch timestamp.
  const pitchesByBrand = new Map<string, PitchWithProvenance[]>()
  for (const p of pitches) {
    if (!p.brand_id) continue
    const bucket = pitchesByBrand.get(p.brand_id) ?? []
    bucket.push(p)
    pitchesByBrand.set(p.brand_id, bucket)
  }

  const survivorByBrandId = new Map(survivor_brands.map((cb) => [cb.brand_id, cb]))
  const loserByBrandId = new Map(loser_brands.map((cb) => [cb.brand_id, cb]))
  const allBrandIds = new Set([...survivorByBrandId.keys(), ...loserByBrandId.keys()])

  const cards: BrandCardPreview[] = []
  for (const brand_id of allBrandIds) {
    const scb = survivorByBrandId.get(brand_id) ?? null
    const lcb = loserByBrandId.get(brand_id) ?? null
    const lookup = brand_lookup.get(brand_id)
    const brand_name = lookup?.name ?? '(unknown brand)'

    let role: ContactRole | null
    let ended_at: string | null
    let ended_reason: string | null
    let created_at: string
    let provenance: Provenance

    if (scb && lcb) {
      // Conflicting — apply user resolution + deterministic state.
      const res = resolutions.per_brand[brand_id]
      if (res) {
        role = res.role
        // Mirror RPC: mixed state → force active regardless of payload.
        if (scb.ended_at === null || lcb.ended_at === null) {
          ended_at = null
          ended_reason = null
        } else {
          ended_at = res.ended_at
          ended_reason = res.ended_reason
        }
      } else {
        // No resolution entry; fall back to defaults (mirrors RPC's COALESCE).
        const fallback = computeBrandResolutionDefault(scb, lcb)
        role = fallback.role
        ended_at = fallback.ended_at
        ended_reason = fallback.ended_reason
      }
      // Earliest created_at across both rows (RPC step 3 deterministic rule).
      created_at =
        scb.created_at < lcb.created_at ? scb.created_at : lcb.created_at
      provenance = 'merged'
    } else if (scb) {
      // Survivor-only — carry as-is.
      role = scb.role
      ended_at = scb.ended_at
      ended_reason = scb.ended_reason
      created_at = scb.created_at
      provenance = 'survivor'
    } else if (lcb) {
      // Loser-only — re-pointed to survivor; carry loser's values.
      role = lcb.role
      ended_at = lcb.ended_at
      ended_reason = lcb.ended_reason
      created_at = lcb.created_at
      provenance = 'loser'
    } else {
      continue // unreachable; brand_id came from one of the two maps
    }

    const brandPitches = pitchesByBrand.get(brand_id) ?? []
    const sortedPitches = brandPitches
      .slice()
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
    const last_pitch_at = sortedPitches[0]?.created_at ?? null

    cards.push({
      brand_id,
      brand_name,
      role,
      ended_at,
      ended_reason,
      created_at,
      provenance,
      pitch_count: brandPitches.length,
      last_pitch_at,
    })
  }

  // Sort: most-recent-pitch first; no-pitch brands by name (mirrors
  // contact-stats.ts buildBrandLinks sort).
  cards.sort((a, b) => {
    if (a.last_pitch_at && b.last_pitch_at) {
      return b.last_pitch_at.localeCompare(a.last_pitch_at)
    }
    if (a.last_pitch_at && !b.last_pitch_at) return -1
    if (!a.last_pitch_at && b.last_pitch_at) return 1
    return a.brand_name.localeCompare(b.brand_name)
  })

  return cards
}

// ----------------------------------------------------------------------------
// Pitch history — unified, deduped (AC-M1), sorted by date (D4)
// ----------------------------------------------------------------------------

function buildPitchHistory(inputs: MergeInputs): PitchHistoryItem[] {
  const { pitches, brand_lookup } = inputs
  return pitches
    .slice()
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((p) => ({
      pitch_id: p.id,
      brand_id: p.brand_id,
      brand_name: p.brand_id ? brand_lookup.get(p.brand_id)?.name ?? null : null,
      summary: p.ai_summary?.trim() ?? '',
      created_at: p.created_at,
      // Shared pitches (source='both', AC-M1 dedup) don't get the
      // "from <dup>" tag — they belonged to both pre-merge.
      from_loser: p.source === 'loser',
      direction: p.direction,
      stage: p.deal_stage,
      current_amount: p.deal_current_amount,
      current_currency: p.deal_current_currency,
    }))
}

// ----------------------------------------------------------------------------
// Slug fold — loser's slug + previous_slugs into survivor's (AC3.5, R10)
// ----------------------------------------------------------------------------

function foldPreviousSlugs(survivor: Contact, loser: Contact): string[] {
  const folded = new Set<string>(survivor.previous_slugs)
  for (const s of loser.previous_slugs) folded.add(s)
  if (loser.slug) folded.add(loser.slug)
  return Array.from(folded)
}

// ----------------------------------------------------------------------------
// Brand resolutions payload — wire format for the RPC
// ----------------------------------------------------------------------------

function buildBrandResolutionsPayload(
  per_brand: Record<string, BrandResolution>,
): MergePayload['p_brand_resolutions'] {
  const out: MergePayload['p_brand_resolutions'] = {}
  for (const [brand_id, res] of Object.entries(per_brand)) {
    out[brand_id] = {
      role: res.role,
      ended_at: res.ended_at,
      ended_reason: res.ended_reason,
    }
  }
  return out
}
