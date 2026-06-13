// Shared resolution module for the Brand Combine ("merge_brands") wizard. FR-10 #95.
//
// Produces BOTH the wizard preview render AND the merge_brands RPC payload from a
// single computation pass — the **preview == commit invariant** (R8 + AC3.2). One
// source-of-truth ensures the user can't see one state in preview and end up with
// another after commit.
//
// Structural parallel FR-11:FR-10 :: FR-8:FR-9 — this is the brand-axis fork of
// `lib/contact-merge.ts` (FR-9). The conflict surface is deliberately smaller:
//   - Brand NAME — always-conflict scalar pick (brands_user_lower_name_uniq
//     guarantees two distinct Brands never share a case-insensitive name), default
//     survivor's, may pick loser's (R3 typo-fix headline). No channels union.
//   - Per-Contact link conflicts — where the SAME Contact links BOTH brands
//     (contact_brands PK (contact_id, brand_id) collision on re-point): role +
//     active/ended state reconcile, same defaults as FR-9.
// No channels, no contact_pitches M:N, no thread merge. pitches.brand_id is a single
// FK, so a pitch belongs to exactly ONE brand → no 'both' provenance / same-pitch
// dedup (FR-9 AC-M1 has no brand-axis equivalent; FR-10 AC-M1 is StatsStrip count
// consistency, handled server-side by the RPC's brand_name rewrite).
//
// Spec: workspace/build-requests/FR-10-brand-merge.md
//   §Architecture · computeBrandMergeResult (R8 preview == commit)
//   §Acceptance Criteria — AC2.1-2.6 (review + resolve), AC3.1 (preview shape),
//     AC3.2 (preview == commit)
//   §Conflict-resolution matrix — name (interactive, default survivor's);
//     same-Contact role (interactive, default survivor-side); same-Contact state
//     (mixed active-wins deterministic; both-ended most-recent + override)
//   §Governing interaction principle — default-resolved + user-overridable
//
// RPC payload contract: workspace/lead-dev/outbox/2026-06-13-fr10-m1-merge-brands.sql
// Engineering canon: docs/engineering/learnings.md §1 atomic RPC pattern (this module
//   is the TS-side counterpart that builds the payload for the plpgsql merge_brands).

import type { Brand } from '@/lib/types/brand'
import type { ContactBrand, ContactRole } from '@/lib/types/contact'
import type { Pitch, PitchDirection } from '@/lib/types/pitch'
import type { DealStage } from '@/lib/types/deal'

// ============================================================================
// INPUT TYPES
// ============================================================================

// A pitch annotated by which brand it pre-merge belongs to. pitches.brand_id is a
// single FK → source is binary (survivor | loser); no 'both'. Deal fields
// embed-extracted by the loader (1-to-1 v1 UX); null when the pitch has no deal row
// (e.g., auto-create skip-list excludes inbound spam / not_a_pitch).
export interface BrandPitchWithProvenance extends Pitch {
  source: 'survivor' | 'loser'
  deal_stage: DealStage | null
  deal_current_amount: number | null
  deal_current_currency: string | null
}

// All inputs the module needs. The loader fetches these fresh at wizard-open
// (AC1.5) — no stale list data. Server/browser fetch is RLS-scoped; no further
// per-user filtering inside this module.
export interface BrandMergeInputs {
  survivor: Brand
  loser: Brand
  // contact_brands rows for each brand (each row = a Contact linked to the brand).
  survivor_contacts: ContactBrand[]
  loser_contacts: ContactBrand[]
  // Pitches linked to either brand via pitches.brand_id, annotated by source.
  pitches: BrandPitchWithProvenance[]
  // contact_id → { id, name } lookup for rendering linked-Contact names.
  contact_lookup: Map<string, { id: string; name: string | null }>
}

// ============================================================================
// USER RESOLUTION TYPES
// ============================================================================

// Per-Contact resolution for Contacts that link BOTH brands (a contact_brands PK
// (contact_id, brand_id) collision when the loser-side link re-points to survivor).
// `role` reflects the user's pick (default = survivor-side role). `ended_at` /
// `ended_reason` reflect the user's pick for both-ended cells; the RPC ignores them
// for mixed-state (active + ended) cells per AC2.5 (deterministic active-wins applied
// server-side regardless of payload).
export interface ContactLinkResolution {
  role: ContactRole | null
  ended_at: string | null
  ended_reason: string | null
}

// Final user-resolved picks across the wizard. `computeDefaultBrandResolutions`
// seeds this from survivor's values + deterministic rules; the wizard updates
// entries on user override; the final shape feeds `computeBrandMergeResult` for both
// preview and commit.
export interface BrandMergeResolutions {
  // Resolved brand name — always a value (brands.name is NOT NULL; the always-
  // conflict cell forces a pick). Default survivor's; user may pick loser's.
  name: string
  // Per-Contact resolution keyed by contact_id. Only entries for CONFLICTING
  // Contacts (the same Contact links both brands). Survivor-only and loser-only
  // links aren't in this map — the RPC re-points loser-only via simple UPDATE.
  per_contact: Record<string, ContactLinkResolution>
}

// ============================================================================
// OUTPUT TYPES — preview side
// ============================================================================

// Drives the `--pick` tint on the preview's contact cards (D4 visual contract).
export type Provenance = 'survivor' | 'loser' | 'merged'

export interface ContactLinkPreview {
  contact_id: string
  contact_name: string | null
  role: ContactRole | null
  ended_at: string | null
  ended_reason: string | null
  // Earliest created_at across both brands' rows for this Contact (RPC step-3
  // deterministic rule); drives "linked since" rendering.
  created_at: string
  provenance: Provenance
}

export interface BrandPitchHistoryItem {
  pitch_id: string
  // Brief pitch summary for the row's middle column (canon row format:
  // `<date> · <summary> <stage> <amount>`). Empty when AI summary unavailable.
  summary: string
  created_at: string
  // "from <dup>" tag — true when the pitch belonged to the loser brand pre-merge.
  from_loser: boolean
  // Deal state — drives the stage chip + current amount columns per canon. Null
  // when the pitch has no deal row.
  direction: PitchDirection
  stage: DealStage | null
  current_amount: number | null
  current_currency: string | null
}

// Aggregate deal totals across a set of pitches (review column / merged preview).
// "Closed" = deals in a committed stage (confirmed | delivered). Totals are grouped
// by currency (a solo creator is usually single-currency, but mixing is possible);
// the wizard renders the dominant currency + a "+N more" when several exist.
export interface DealSummary {
  closed_count: number
  // Summed closed-deal amount per currency, sorted by amount desc.
  closed_totals: { currency: string; amount: number }[]
}

export interface BrandSurvivorPreview {
  survivor_id: string
  // Resolved brand name.
  name: string
  // Survivor's canonical slug (unchanged by merge; the loser's slug folds into
  // previous_slugs below and 301-redirects in).
  slug: string | null
  // Survivor's previous_slugs after folding the loser's slug + history (AC3.5 + R10).
  previous_slugs: string[]
  // Combined contact links (one per unique contact_id post-merge), active-first
  // then alphabetical.
  contact_links: ContactLinkPreview[]
  // Unified pitch history, sorted by created_at desc.
  pitch_history: BrandPitchHistoryItem[]
  // Combined deal totals across all merged pitches (AC3.1 "combined deal totals").
  deal_summary: DealSummary
}

// ============================================================================
// OUTPUT TYPES — RPC payload side
// ============================================================================

// Wire-format mirror of `merge_brands(...)` params.
// Spec: workspace/lead-dev/outbox/2026-06-13-fr10-m1-merge-brands.sql header.
// p_contact_resolutions keyed by contact_id::text; RPC handles tolerantly (entries
// for non-conflicting Contacts are harmless; omitted entries fall back to
// deterministic logic).
export interface BrandMergePayload {
  p_survivor_id: string
  p_loser_id: string
  p_name: string
  p_contact_resolutions: Record<
    string,
    { role: string | null; ended_at: string | null; ended_reason: string | null }
  >
}

export interface BrandMergeResult {
  preview: BrandSurvivorPreview
  payload: BrandMergePayload
}

// ============================================================================
// DEFAULT RESOLUTION COMPUTATION
// ============================================================================

// Seed the wizard's resolution state from inputs. Every value-conflict cell
// pre-selects a sensible default per the governing principle (default-resolved +
// user-overridable). The wizard renders the defaults and allows per-cell override
// before passing the final state to computeBrandMergeResult.
export function computeDefaultBrandResolutions(
  inputs: BrandMergeInputs,
): BrandMergeResolutions {
  const { survivor, survivor_contacts, loser_contacts } = inputs

  // Name default: survivor's (R3 — survivor = identity anchor; the name is a
  // separate pick from the survivor choice).
  const name = survivor.name

  // Per-Contact resolution: only for Contacts where BOTH brands have a link.
  const survivorContactIds = new Set(survivor_contacts.map((cb) => cb.contact_id))
  const per_contact: Record<string, ContactLinkResolution> = {}

  for (const lcb of loser_contacts) {
    if (!survivorContactIds.has(lcb.contact_id)) continue // loser-only; no resolution
    const scb = survivor_contacts.find((c) => c.contact_id === lcb.contact_id)!
    per_contact[lcb.contact_id] = computeContactLinkResolutionDefault(scb, lcb)
  }

  return { name, per_contact }
}

// Per AC2.4-2.5 + the conflict-resolution matrix:
//   - Role: default survivor-side (interactive cell).
//   - State mixed (one active + one ended): deterministic active-wins;
//     ended_at = null, ended_reason = null.
//   - State both-active: combined active; nothing to resolve on state.
//   - State both-ended: default most-recent ended_at + paired ended_reason
//     (interactive — user can override).
function computeContactLinkResolutionDefault(
  survivor: ContactBrand,
  loser: ContactBrand,
): ContactLinkResolution {
  const role = survivor.role

  // Mixed state OR both-active → active deterministic.
  if (survivor.ended_at === null || loser.ended_at === null) {
    return { role, ended_at: null, ended_reason: null }
  }

  // Both ended → default to the most-recent ending, carrying THAT side's
  // role + reason as one unit (the link record is picked whole, per the locked
  // design's both-ended chooser — picking "the duplicate's ending" adopts the
  // duplicate's role too). Differs from FR-9's contact-merge (separate role/state
  // cards); the brand design couples them into one ended chooser per contact.
  if (loser.ended_at > survivor.ended_at) {
    return { role: loser.role, ended_at: loser.ended_at, ended_reason: loser.ended_reason }
  }
  return { role: survivor.role, ended_at: survivor.ended_at, ended_reason: survivor.ended_reason }
}

// ============================================================================
// MAIN COMPUTATION
// ============================================================================

// Compute the merge result — both preview AND commit payload — from inputs +
// user-resolved picks. Single pass; preview and payload are derived from the SAME
// computation (R8: preview == commit invariant). No DB calls; pure function over
// loaded rows.
export function computeBrandMergeResult(
  inputs: BrandMergeInputs,
  resolutions: BrandMergeResolutions,
): BrandMergeResult {
  const contact_links = buildContactLinks(inputs, resolutions)
  const pitch_history = buildPitchHistory(inputs)
  const previous_slugs = foldPreviousSlugs(inputs.survivor, inputs.loser)

  const preview: BrandSurvivorPreview = {
    survivor_id: inputs.survivor.id,
    name: resolutions.name,
    slug: inputs.survivor.slug,
    previous_slugs,
    contact_links,
    pitch_history,
    deal_summary: summarizeDeals(inputs.pitches),
  }

  const payload: BrandMergePayload = {
    p_survivor_id: inputs.survivor.id,
    p_loser_id: inputs.loser.id,
    p_name: resolutions.name,
    p_contact_resolutions: buildContactResolutionsPayload(resolutions.per_contact),
  }

  return { preview, payload }
}

// ----------------------------------------------------------------------------
// Contact links — combined per-Contact preview (D4 visual contract)
// ----------------------------------------------------------------------------

function buildContactLinks(
  inputs: BrandMergeInputs,
  resolutions: BrandMergeResolutions,
): ContactLinkPreview[] {
  const { survivor_contacts, loser_contacts, contact_lookup } = inputs

  const survivorById = new Map(survivor_contacts.map((cb) => [cb.contact_id, cb]))
  const loserById = new Map(loser_contacts.map((cb) => [cb.contact_id, cb]))
  const allContactIds = new Set([...survivorById.keys(), ...loserById.keys()])

  const links: ContactLinkPreview[] = []
  for (const contact_id of allContactIds) {
    const scb = survivorById.get(contact_id) ?? null
    const lcb = loserById.get(contact_id) ?? null
    const contact_name = contact_lookup.get(contact_id)?.name ?? null

    let role: ContactRole | null
    let ended_at: string | null
    let ended_reason: string | null
    let created_at: string
    let provenance: Provenance

    if (scb && lcb) {
      // Conflicting — apply user resolution + deterministic state.
      const res = resolutions.per_contact[contact_id]
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
        const fallback = computeContactLinkResolutionDefault(scb, lcb)
        role = fallback.role
        ended_at = fallback.ended_at
        ended_reason = fallback.ended_reason
      }
      // Earliest created_at across both rows (RPC step-3 deterministic rule).
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
      continue // unreachable; contact_id came from one of the two maps
    }

    links.push({
      contact_id,
      contact_name,
      role,
      ended_at,
      ended_reason,
      created_at,
      provenance,
    })
  }

  // Active links first (ended_at NULL), then alphabetical by name.
  links.sort((a, b) => {
    const aActive = a.ended_at === null ? 0 : 1
    const bActive = b.ended_at === null ? 0 : 1
    if (aActive !== bActive) return aActive - bActive
    return (a.contact_name ?? '').localeCompare(b.contact_name ?? '')
  })

  return links
}

// ----------------------------------------------------------------------------
// Pitch history — unified, sorted by date (D4)
// ----------------------------------------------------------------------------

function buildPitchHistory(inputs: BrandMergeInputs): BrandPitchHistoryItem[] {
  return inputs.pitches
    .slice()
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((p) => ({
      pitch_id: p.id,
      summary: p.ai_summary?.trim() ?? '',
      created_at: p.created_at,
      from_loser: p.source === 'loser',
      direction: p.direction,
      stage: p.deal_stage,
      current_amount: p.deal_current_amount,
      current_currency: p.deal_current_currency,
    }))
}

// ----------------------------------------------------------------------------
// Deal aggregation — closed-deal count + per-currency totals (AC2.1 / AC3.1)
// ----------------------------------------------------------------------------

// A deal is "closed" once it reaches a committed stage. inbox / negotiating are
// in-flight; rejected is a non-success exit. Exported so the wizard's Step-1
// review columns and Step-3 combined preview share one definition.
const CLOSED_STAGES: ReadonlySet<DealStage> = new Set(['confirmed', 'delivered'])

export function summarizeDeals(
  pitches: BrandPitchWithProvenance[],
): DealSummary {
  const byCurrency = new Map<string, number>()
  let closed_count = 0
  for (const p of pitches) {
    if (!p.deal_stage || !CLOSED_STAGES.has(p.deal_stage)) continue
    closed_count++
    if (p.deal_current_amount != null && p.deal_current_currency) {
      byCurrency.set(
        p.deal_current_currency,
        (byCurrency.get(p.deal_current_currency) ?? 0) + p.deal_current_amount,
      )
    }
  }
  const closed_totals = Array.from(byCurrency, ([currency, amount]) => ({
    currency,
    amount,
  })).sort((a, b) => b.amount - a.amount)
  return { closed_count, closed_totals }
}

// ----------------------------------------------------------------------------
// Slug fold — loser's slug + previous_slugs into survivor's (AC3.5, R10)
// ----------------------------------------------------------------------------

function foldPreviousSlugs(survivor: Brand, loser: Brand): string[] {
  const folded = new Set<string>(survivor.previous_slugs)
  for (const s of loser.previous_slugs) folded.add(s)
  if (loser.slug) folded.add(loser.slug)
  return Array.from(folded)
}

// ----------------------------------------------------------------------------
// Contact resolutions payload — wire format for the RPC
// ----------------------------------------------------------------------------

function buildContactResolutionsPayload(
  per_contact: Record<string, ContactLinkResolution>,
): BrandMergePayload['p_contact_resolutions'] {
  const out: BrandMergePayload['p_contact_resolutions'] = {}
  for (const [contact_id, res] of Object.entries(per_contact)) {
    out[contact_id] = {
      role: res.role,
      ended_at: res.ended_at,
      ended_reason: res.ended_reason,
    }
  }
  return out
}
