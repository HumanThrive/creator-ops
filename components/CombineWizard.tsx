'use client'

// CombineWizard — Contact merge ("Combine") wizard. FR-9 #82.
//
// 3-step stepped modal (Review → Resolve → Preview) + success state (Done).
// Pure UI component: state + presentation + interactions. Parent provides
// `onCommit(payload)` callback (wired at entry-point step #83) so the wizard
// itself doesn't import supabase — keeps it testable + reusable across the
// three FR-9 entry points (DupEmailCallout · DeleteBlockedModal · /app/people
// select-two).
//
// Spec: workspace/build-requests/FR-9-contact-merge.md (Final Consolidated Spec)
// Design canon: docs/design/design_handoff_combine_wizard/README.md
//               + Combine Wizard Stress-Test.html (visual contract)
// CSS family: .cw-* — see app/app/design-system.css (FR-9 #82 block at EOF).
// --pick token (#2A6FDB) first consumer per Delta D6 + Founder 2026-06-01
// system-wide-commit decision.
//
// V1-trims (per LD sizing-consult, tasks.md #82 carries):
//   - Preview computes ONCE on Step-3 entry (button), NOT live-reactive per pick.
//     Going Back from Step 3 + changing resolutions + forward again recomputes.
//   - Static step transitions (defer Delta-7 animation/reduced-motion polish).
//   - Flex/grid approx if subgrid fights container stack (current CSS uses
//     `grid-template-columns: 1fr 1fr` on the review; not formal subgrid).

import { useState, useMemo, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  computeDefaultResolutions,
  computeMergeResult,
  computePrimaryDiscardKey,
  type MergeInputs,
  type MergePayload,
  type MergeResolutions,
  type MergeResult,
  type ChannelKey,
  type BrandResolution,
} from '@/lib/contact-merge'
import type { ChannelEntry, ContactRole } from '@/lib/types/contact'
import { formatCurrencyAmount } from '@/lib/pitch-stats'
import type { PitchWithProvenance } from '@/lib/contact-merge'
import { StageChip } from '@/components/StageChip'

// ============================================================================
// PROPS
// ============================================================================

export interface CombineWizardProps {
  // Both contacts + full association graphs, freshly loaded at wizard-open
  // per AC1.4. The two "left" and "right" columns in the Review step are
  // tied to inputs.survivor and inputs.loser respectively (i.e., the order
  // in inputs is the visual layout order — left = inputs.survivor).
  inputs: MergeInputs
  // Default survivor seed per entry point (AC1.1/AC1.2/AC1.3):
  //   'survivor' — inputs.survivor is the default keeper (DupEmailCallout
  //     and /app/people select-two: more-history wins; loader pre-sorts).
  //   'loser' — inputs.loser is the default keeper (DeleteBlockedModal:
  //     the blocked Contact is intentionally the loser; user picked the
  //     "other" via typeahead as the keeper).
  defaultSurvivor: 'survivor' | 'loser'
  // Cancel-shape close: ESC / backdrop / Cancel / ✕. The parent does NOT
  // navigate on this path — user stays on the source surface (per smoke fix
  // 2026-06-02 §1 "Cancel button bug").
  onClose: () => void
  // Success-shape close: Step 4 Done "Open <keeper> →" button only. The
  // parent navigates to survivor's /app/people page (AC3.5). When omitted,
  // the wizard falls back to onClose for that button — useful for tests /
  // callers that want a single close handler.
  onSuccessClose?: () => void
  // Parent commits the payload (typically supabase.rpc('merge_contacts', payload))
  // and returns success/error. On success, the wizard advances to the Done step;
  // the user's "Close" click then triggers onSuccessClose (parent handles
  // navigation to survivor's /app/people/[person] per AC3.5).
  onCommit: (payload: MergePayload) => Promise<{ success: true } | { success: false; error: string }>
}

// ============================================================================
// CONFLICT MODEL
// ============================================================================
// The Resolve step surfaces ONLY the cells that disagree. computeConflicts()
// derives the surfaceable list from the effective inputs + brand-resolution
// defaults; the wizard renders one chooser per conflict.

type Conflict =
  | {
      kind: 'display_name'
      keeperValue: string | null
      otherValue: string | null
    }
  | {
      kind: 'primary'
      keeperChannel: ChannelEntry
      otherChannel: ChannelEntry
    }
  | {
      kind: 'brand_role'
      brand_id: string
      brand_name: string
      keeperRole: ContactRole | null
      otherRole: ContactRole | null
    }
  | {
      kind: 'brand_ended'
      brand_id: string
      brand_name: string
      keeperEndedAt: string
      keeperEndedReason: string | null
      otherEndedAt: string
      otherEndedReason: string | null
    }

interface EffectiveInputs extends MergeInputs {
  // After applying keeperIsLeft swap. keeper = inputs.survivor (left)
  // when keeperIsLeft = true; else inputs.loser (right).
  keeper: MergeInputs['survivor']
  other: MergeInputs['loser']
  keeperBrands: MergeInputs['survivor_brands']
  otherBrands: MergeInputs['loser_brands']
}

function deriveEffective(
  inputs: MergeInputs,
  keeperIsLeft: boolean,
): EffectiveInputs {
  if (keeperIsLeft) {
    return {
      ...inputs,
      keeper: inputs.survivor,
      other: inputs.loser,
      keeperBrands: inputs.survivor_brands,
      otherBrands: inputs.loser_brands,
    }
  }
  // Swap: right column (inputs.loser) is the keeper. For computeMergeResult to
  // produce the right payload, we need to feed it survivor=loser, loser=survivor.
  return {
    survivor: inputs.loser,
    loser: inputs.survivor,
    survivor_brands: inputs.loser_brands,
    loser_brands: inputs.survivor_brands,
    pitches: inputs.pitches.map((p) => ({
      ...p,
      // Flip provenance — survivor/loser swap
      source:
        p.source === 'survivor'
          ? 'loser'
          : p.source === 'loser'
            ? 'survivor'
            : 'both',
    })),
    brand_lookup: inputs.brand_lookup,
    keeper: inputs.loser,
    other: inputs.survivor,
    keeperBrands: inputs.loser_brands,
    otherBrands: inputs.survivor_brands,
  }
}

function computeConflicts(eff: EffectiveInputs): Conflict[] {
  const conflicts: Conflict[] = []

  // Display name
  if ((eff.keeper.display_name ?? null) !== (eff.other.display_name ?? null)) {
    conflicts.push({
      kind: 'display_name',
      keeperValue: eff.keeper.display_name,
      otherValue: eff.other.display_name,
    })
  }

  // Primary channel — only if both have a Primary AND they differ
  const keeperPrimary = eff.keeper.channels.find((c) => c.primary)
  const otherPrimary = eff.other.channels.find((c) => c.primary)
  if (
    keeperPrimary &&
    otherPrimary &&
    (keeperPrimary.kind !== otherPrimary.kind ||
      keeperPrimary.identifier !== otherPrimary.identifier)
  ) {
    conflicts.push({
      kind: 'primary',
      keeperChannel: keeperPrimary,
      otherChannel: otherPrimary,
    })
  }

  // Per-Brand conflicts: role + both-ended date
  const keeperByBrand = new Map(eff.keeperBrands.map((cb) => [cb.brand_id, cb]))
  for (const ocb of eff.otherBrands) {
    const kcb = keeperByBrand.get(ocb.brand_id)
    if (!kcb) continue // loser-only brand; no conflict
    const name = eff.brand_lookup.get(ocb.brand_id)?.name ?? '(brand)'

    // Role conflict — only when roles differ
    if (kcb.role !== ocb.role) {
      conflicts.push({
        kind: 'brand_role',
        brand_id: ocb.brand_id,
        brand_name: name,
        keeperRole: kcb.role,
        otherRole: ocb.role,
      })
    }

    // Both-ended date conflict — only when both ended AND dates differ
    if (
      kcb.ended_at !== null &&
      ocb.ended_at !== null &&
      kcb.ended_at !== ocb.ended_at
    ) {
      conflicts.push({
        kind: 'brand_ended',
        brand_id: ocb.brand_id,
        brand_name: name,
        keeperEndedAt: kcb.ended_at,
        keeperEndedReason: kcb.ended_reason,
        otherEndedAt: ocb.ended_at,
        otherEndedReason: ocb.ended_reason,
      })
    }
  }

  return conflicts
}

// ============================================================================
// CARRY-OVER ITEMS
// ============================================================================
// "Everything that merges with no decision needed" — for the Resolve step's
// carry-over panel reassurance copy. Cheap derivation; not load-bearing.
//
// Smoke fix 2026-06-02 §1.16: the non-picked Primary value gets DISCARDED
// from the merged channels (see computePrimaryDiscardKey in contact-merge.ts).
// The carry-over panel must filter against the same discardKey so the user
// sees the same channel set in Step 2's carry-over and Step 3's preview.

function carryOverItems(
  eff: EffectiveInputs,
  resolutions: MergeResolutions,
): string[] {
  const items: string[] = []
  // Discarded Primary key — computed against EFFECTIVE inputs (keeper-on-left
  // semantics) so the carry-over panel filters against the same key that
  // `mergeChannels` uses when building the merged channel set. Prior version
  // passed original inputs which drifted from mergeChannels after a keeper-
  // flip.
  const discardKey = computePrimaryDiscardKey(eff, resolutions)

  // Non-primary channels from the other contact (won't conflict; carry into union)
  const keeperKeys = new Set(
    eff.keeper.channels.map((c) => `${c.kind}::${c.identifier}`),
  )
  for (const ch of eff.other.channels) {
    const key = `${ch.kind}::${ch.identifier}`
    if (keeperKeys.has(key)) continue
    if (key === discardKey) continue
    items.push(`${ch.kind} ${ch.identifier}`)
  }

  // Other-only brands (carry over silently)
  const keeperBrandIds = new Set(eff.keeperBrands.map((cb) => cb.brand_id))
  for (const ocb of eff.otherBrands) {
    if (keeperBrandIds.has(ocb.brand_id)) continue
    const name = eff.brand_lookup.get(ocb.brand_id)?.name ?? 'brand'
    items.push(`${name} link · ${ocb.role ?? 'no role'}`)
  }

  // Pitches — show as a single rollup
  const totalPitches = eff.pitches.length
  if (totalPitches > 0) {
    items.push(
      `All ${totalPitches} pitch${totalPitches === 1 ? '' : 'es'} (history preserved)`,
    )
  }

  return items
}

// ============================================================================
// CHANNEL DOT CLASS — mirror CHANNEL_KIND_CLASS from lib/types/contact
// ============================================================================

const CHANNEL_DOT_CLASS: Record<string, string> = {
  Email: 'ch-email',
  IG: 'ch-ig',
  TikTok: 'ch-tt',
  WhatsApp: 'ch-wa',
  X: 'ch-x',
  IRL: 'ch-irl',
  Facebook: 'ch-facebook',
  LinkedIn: 'ch-linkedin',
  Website: 'ch-website',
}

// ============================================================================
// COMPONENT
// ============================================================================

export function CombineWizard(props: CombineWizardProps) {
  const { inputs, defaultSurvivor, onClose, onCommit } = props
  const onSuccessClose = props.onSuccessClose ?? props.onClose

  // Smoke fix 2026-06-02 §1 close animation — defer the actual unmount so the
  // overlay + card can run their exit keyframes (mirror the entry shape).
  // Duration must match the CSS `cwCardOut` / `pitch-modal-overlay-fade-out`
  // (180ms).
  const [closing, setClosing] = useState(false)
  const requestClose = useCallback(() => {
    if (closing) return
    setClosing(true)
    window.setTimeout(() => onClose(), 180)
  }, [closing, onClose])
  const requestSuccessClose = useCallback(() => {
    if (closing) return
    setClosing(true)
    window.setTimeout(() => onSuccessClose(), 180)
  }, [closing, onSuccessClose])

  // Step state. Numeric for rail iteration; 4 = Done success.
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)

  // Which column is the keeper. `true` = left (inputs.survivor) is keeper.
  const [keeperIsLeft, setKeeperIsLeft] = useState(defaultSurvivor === 'survivor')

  // Effective inputs (keeper/other) derived from keeperIsLeft.
  const eff = useMemo(
    () => deriveEffective(inputs, keeperIsLeft),
    [inputs, keeperIsLeft],
  )

  // Resolutions — seeded from defaults; user overrides as they pick.
  // Recomputed whenever keeperIsLeft flips (defaults seed from keeper's values).
  const [resolutions, setResolutions] = useState<MergeResolutions>(() =>
    computeDefaultResolutions(eff),
  )

  // Re-seed resolutions when keeper flips. Tracks the previous keeperIsLeft.
  const [lastKeeperIsLeft, setLastKeeperIsLeft] = useState(keeperIsLeft)
  if (lastKeeperIsLeft !== keeperIsLeft) {
    // Synchronous reset to keep resolutions consistent with the new keeper.
    setLastKeeperIsLeft(keeperIsLeft)
    setResolutions(computeDefaultResolutions(eff))
  }

  // Preview snapshot — computed ONCE on Step-3 entry (v1-trim per LD sizing).
  // Cleared when going Back from Step 3 + recomputed on next Step-3 entry.
  const [previewSnapshot, setPreviewSnapshot] = useState<MergeResult | null>(null)

  // Commit state.
  const [committing, setCommitting] = useState(false)
  const [commitError, setCommitError] = useState<string | null>(null)

  // Conflicts list (for Step 2 rendering).
  const conflicts = useMemo(() => computeConflicts(eff), [eff])
  // Re-runs on resolutions change so the carry-over panel updates as the user
  // picks Primary at the chooser (the discarded Primary value drops out).
  const carryItems = useMemo(
    () => carryOverItems(eff, resolutions),
    [eff, resolutions],
  )

  // Escape key dismiss — except during commit + success.
  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      if (ev.key === 'Escape' && !committing && step !== 4) requestClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [committing, step, requestClose])

  // Step transition — recompute preview on Step-3 entry.
  const goToStep = useCallback(
    (next: 1 | 2 | 3 | 4) => {
      if (next === 3) {
        setPreviewSnapshot(computeMergeResult(eff, resolutions))
      } else {
        setPreviewSnapshot(null)
      }
      setStep(next)
    },
    [eff, resolutions],
  )

  // Survivor toggle: clicking either column header sets keeperIsLeft.
  const setKeeperLeft = useCallback(() => setKeeperIsLeft(true), [])
  const setKeeperRight = useCallback(() => setKeeperIsLeft(false), [])

  // ===== Resolution mutators =====
  function pickDisplayName(value: string | null) {
    setResolutions((r) => ({ ...r, display_name: value }))
  }

  function pickPrimary(channel: ChannelKey) {
    setResolutions((r) => ({ ...r, primary_channel: channel }))
  }

  function pickBrandRole(brand_id: string, role: ContactRole | null) {
    setResolutions((r) => {
      const existing: BrandResolution = r.per_brand[brand_id] ?? {
        role: null,
        ended_at: null,
        ended_reason: null,
      }
      return {
        ...r,
        per_brand: {
          ...r.per_brand,
          [brand_id]: { ...existing, role },
        },
      }
    })
  }

  function pickBrandEnded(
    brand_id: string,
    ended_at: string,
    ended_reason: string | null,
  ) {
    setResolutions((r) => {
      const existing: BrandResolution = r.per_brand[brand_id] ?? {
        role: null,
        ended_at: null,
        ended_reason: null,
      }
      return {
        ...r,
        per_brand: {
          ...r.per_brand,
          [brand_id]: { ...existing, ended_at, ended_reason },
        },
      }
    })
  }

  // ===== Commit handler =====
  async function onCombine() {
    if (!previewSnapshot) return
    setCommitting(true)
    setCommitError(null)
    const result = await onCommit(previewSnapshot.payload)
    setCommitting(false)
    if (result.success) {
      setStep(4)
    } else {
      setCommitError(result.error)
    }
  }

  // ===== Helpers =====
  function isPrimaryPicked(ch: ChannelEntry): boolean {
    return (
      resolutions.primary_channel?.kind === ch.kind &&
      resolutions.primary_channel?.identifier === ch.identifier
    )
  }

  function isRolePicked(brand_id: string, role: ContactRole | null): boolean {
    return (resolutions.per_brand[brand_id]?.role ?? null) === role
  }

  function isEndedPicked(brand_id: string, ended_at: string): boolean {
    return resolutions.per_brand[brand_id]?.ended_at === ended_at
  }

  // Counts for the summary banner (computed against the merged result-shape,
  // without firing computeMergeResult — cheap to count).
  const channelUnionCount = useMemo(() => {
    const keys = new Set<string>()
    for (const c of [...eff.keeper.channels, ...eff.other.channels]) {
      keys.add(`${c.kind}::${c.identifier}`)
    }
    return keys.size
  }, [eff])
  const brandUnionCount = useMemo(() => {
    const ids = new Set<string>()
    for (const cb of [...eff.keeperBrands, ...eff.otherBrands]) ids.add(cb.brand_id)
    return ids.size
  }, [eff])

  // ===========================================================================
  // RENDER
  // ===========================================================================

  return (
    <div
      className={`pitch-modal-overlay cw-overlay ${closing ? 'is-closing' : ''}`}
      onClick={(e) => {
        if (e.target === e.currentTarget && !committing && step !== 4) requestClose()
      }}
    >
      <div
        className="modal-card cw-card"
        role="dialog"
        aria-modal="true"
        aria-label="Combine Contacts"
      >
        <header className="modal-band cw-band">
          <span className="cw-band-l">Combine Contacts</span>

          {/* Step rail — hidden on success */}
          {step < 4 && (
            <nav className="cw-rail" aria-label="Wizard progress">
              {([
                [1, 'Review'],
                [2, 'Resolve'],
                [3, 'Preview'],
              ] as const).map(([n, label], i, arr) => (
                <span key={n} style={{ display: 'inline-flex', alignItems: 'center', gap: 14 }}>
                  <button
                    type="button"
                    className={`cw-rail-step ${
                      step === n ? 'is-active' : step > n ? 'is-done' : ''
                    }`}
                    onClick={() => goToStep(n)}
                  >
                    <span className="cw-rail-chip">{step > n ? '✓' : n}</span>
                    {label}
                  </button>
                  {i < arr.length - 1 && <span className="cw-rail-sep" />}
                </span>
              ))}
            </nav>
          )}

          <button
            type="button"
            className="cw-band-close"
            onClick={requestClose}
            disabled={committing}
            aria-label="Close"
          >
            ✕
          </button>
        </header>

        {/* Body — step-specific panels */}
        <div className="cw-body">
          {step === 1 && (
            <div className="cw-step is-on" key="cw-s1">
              <Step1Review
                inputs={inputs}
                keeperIsLeft={keeperIsLeft}
                onPickLeft={setKeeperLeft}
                onPickRight={setKeeperRight}
                conflictsCount={conflicts.length}
                channelUnionCount={channelUnionCount}
                brandUnionCount={brandUnionCount}
                brandLookup={inputs.brand_lookup}
              />
            </div>
          )}
          {step === 2 && (
            <div className="cw-step is-on" key="cw-s2">
              <Step2Resolve
                conflicts={conflicts}
                carryItems={carryItems}
                resolutions={resolutions}
                keeperIsLeft={keeperIsLeft}
                pickDisplayName={pickDisplayName}
                pickPrimary={pickPrimary}
                pickBrandRole={pickBrandRole}
                pickBrandEnded={pickBrandEnded}
                isPrimaryPicked={isPrimaryPicked}
                isRolePicked={isRolePicked}
                isEndedPicked={isEndedPicked}
              />
            </div>
          )}
          {step === 3 && previewSnapshot && (
            <div className="cw-step is-on" key="cw-s3">
              <Step3Preview
                result={previewSnapshot}
                keeperDisplayName={resolutions.display_name}
                keeperSlug={eff.keeper.slug}
                loserDisplayName={eff.other.display_name ?? '(no name)'}
                committing={committing}
                commitError={commitError}
                onCombine={onCombine}
              />
            </div>
          )}
          {step === 4 && (
            <div className="cw-step is-on" key="cw-s4">
              <Step4Done
                keeperName={resolutions.display_name ?? '(no name)'}
                keeperHref={`/app/people/${eff.keeper.slug || eff.keeper.id}`}
                loserName={eff.other.display_name ?? '(no name)'}
                loserSlug={eff.other.slug}
                pitchesCount={eff.pitches.length}
                channelsCount={channelUnionCount}
                onSuccessClose={requestSuccessClose}
              />
            </div>
          )}
        </div>

        {/* Footer — hidden on success step (Done has its own button inline).
            `data-step` lets the mobile breakpoint hide Cancel on steps 2-3
            per the design handoff's pinned-footer canon. */}
        {step < 4 && (
          <footer className="modal-foot cw-foot" data-step={step}>
            <div className="cw-foot-l">
              <button
                type="button"
                className="cw-cancel"
                onClick={requestClose}
                disabled={committing}
              >
                ✕ Cancel
              </button>
              <span className="cw-step-help">
                {step === 1 && 'Step 1 of 3 · review both records'}
                {step === 2 && `Step 2 of 3 · ${conflicts.length} to decide`}
                {step === 3 && 'Step 3 of 3 · preview & confirm'}
              </span>
            </div>
            <div className="cw-foot-r">
              {step > 1 && (
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => goToStep((step - 1) as 1 | 2 | 3)}
                  disabled={committing}
                >
                  ← Back
                </button>
              )}
              {step < 3 && (
                <button
                  type="button"
                  className="btn-pill"
                  onClick={() => goToStep((step + 1) as 2 | 3)}
                >
                  {step === 2 ? 'Preview →' : 'Next →'}
                </button>
              )}
            </div>
          </footer>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// STEP 1 — Review
// ============================================================================
//
// Smoke fix 2026-06-02 §1.10/§1.11/§1.14 — column positions are STABLE:
// inputs.survivor is ALWAYS on the left, inputs.loser is ALWAYS on the right
// regardless of keeper. The keeper state (.is-keep ring + Folds-into label +
// merge-arrow direction) follows whichever side is currently the keeper.
// Prior version swapped columns on keeper-flip via deriveEffective(), which
// flipped the visual positions and put the keeper-ring always on the left.
//
// Smoke fix 2026-06-02 §1.8 — row-paired layout (head + 4 fields = 5 rows;
// each row is a single CSS Grid with two cells). Matches the Stress-Test's
// "Stepped wizard · 2-col review · dedicated resolve · full preview" canon:
// borderlines between sections; both columns share the same height within
// each section. Replaces the prior per-column stacks (which let sections
// drift apart).

interface Step1Props {
  inputs: MergeInputs
  keeperIsLeft: boolean
  onPickLeft: () => void
  onPickRight: () => void
  conflictsCount: number
  channelUnionCount: number
  brandUnionCount: number
  brandLookup: MergeInputs['brand_lookup']
}

function Step1Review(p: Step1Props) {
  const left = p.inputs.survivor
  const right = p.inputs.loser
  const leftIsKeeper = p.keeperIsLeft
  const rightIsKeeper = !p.keeperIsLeft

  // Pitches use ORIGINAL provenance (loader-annotated against inputs.survivor /
  // inputs.loser), stable across keeper-flip. Both totals + preview rows
  // (top-3 newest each) so each ReviewCellPitches can render its capped list.
  const leftPitches = p.inputs.pitches.filter(
    (pi) => pi.source === 'survivor' || pi.source === 'both',
  )
  const rightPitches = p.inputs.pitches.filter(
    (pi) => pi.source === 'loser' || pi.source === 'both',
  )
  const leftPitchCount = leftPitches.length
  const rightPitchCount = rightPitches.length

  const totalPitches = p.inputs.pitches.length
  const keepClass = leftIsKeeper ? 'is-keep-l' : 'is-keep-r'

  return (
    <>
      <div className="cw-summary">
        <p className="cw-summary-text">
          You&rsquo;re combining <b>2 Contacts</b> into <b>1</b>. Nothing is
          lost — pitches and channels move to the keeper.
        </p>
        <div className="cw-summary-chips">
          <span className="cw-chip">{totalPitches} pitches</span>
          <span className="cw-chip">{p.channelUnionCount} channels</span>
          <span className="cw-chip">{p.brandUnionCount} brands</span>
          {p.conflictsCount > 0 && (
            <span className="cw-chip is-pick">
              {p.conflictsCount} to resolve
            </span>
          )}
        </div>
      </div>

      <div className={`cw-review ${keepClass}`}>
        {/* Keep-side accent line — rendered as a `::before` pseudo on the review
            container (CSS) so the 2px run is unbroken by per-row border-tops. */}
        {/* Merge-direction badge — points toward whichever column is the keeper.
            Position is stable (column-divider center); direction flips on state. */}
        <div
          className="cw-merge"
          data-direction={leftIsKeeper ? 'left' : 'right'}
          aria-hidden="true"
        >
          →
        </div>

        {/* Row 1 — column heads (avatar + name + slug + pick pill).
            `--cw-row-i` (0–4 per row) drives the mobile reorder
            (keeper-stack-then-duplicate-stack) via CSS `order` in the
            @container 760px breakpoint; no effect on desktop. */}
        <div
          className={`cw-row cw-row-head ${keepClass}`}
          style={{ '--cw-row-i': 0 } as React.CSSProperties}
        >
          <ReviewHead contact={left} isKeeper={leftIsKeeper} onPick={p.onPickLeft} />
          <ReviewHead contact={right} isKeeper={rightIsKeeper} onPick={p.onPickRight} />
        </div>

        {/* Row 2 — Display name */}
        <div
          className={`cw-row ${keepClass}`}
          style={{ '--cw-row-i': 1 } as React.CSSProperties}
        >
          <ReviewCellName label="Display name" value={left.display_name} />
          <ReviewCellName label="Display name" value={right.display_name} />
        </div>

        {/* Row 3 — Channels */}
        <div
          className={`cw-row ${keepClass}`}
          style={{ '--cw-row-i': 2 } as React.CSSProperties}
        >
          <ReviewCellChannels channels={left.channels} />
          <ReviewCellChannels channels={right.channels} />
        </div>

        {/* Row 4 — Brands */}
        <div
          className={`cw-row ${keepClass}`}
          style={{ '--cw-row-i': 3 } as React.CSSProperties}
        >
          <ReviewCellBrands
            brands={p.inputs.survivor_brands}
            brandLookup={p.brandLookup}
          />
          <ReviewCellBrands
            brands={p.inputs.loser_brands}
            brandLookup={p.brandLookup}
          />
        </div>

        {/* Row 5 — Pitches: capped list (top-3 newest) + rollup */}
        <div
          className={`cw-row ${keepClass}`}
          style={{ '--cw-row-i': 4 } as React.CSSProperties}
        >
          <ReviewCellPitches
            pitches={leftPitches}
            total={leftPitchCount}
            brandLookup={p.brandLookup}
          />
          <ReviewCellPitches
            pitches={rightPitches}
            total={rightPitchCount}
            brandLookup={p.brandLookup}
          />
        </div>
      </div>
    </>
  )
}

// ----- Row cells ------------------------------------------------------------

interface ReviewHeadProps {
  contact: MergeInputs['survivor']
  isKeeper: boolean
  onPick: () => void
}

function ReviewHead(p: ReviewHeadProps) {
  const initial = (p.contact.display_name?.[0] ?? '·').toUpperCase()
  // Canon shape (Stress-Test lines 416-426): col-head is a vertical stack of
  // three rows — [cw-col-id: avatar + name/slug pair] → [cw-col-pick: pill] →
  // [cw-col-foldlabel: "Folds into the keeper" on non-keeper only]. The
  // foldlabel renders always; CSS toggles visibility per side via the row's
  // `is-keep-l` / `is-keep-r` class. The ↘ glyph comes from CSS ::before.
  return (
    <button type="button" className="cw-col-head" onClick={p.onPick}>
      <span className="cw-col-id">
        <span className="cw-col-avatar">{initial}</span>
        <span className="cw-col-id-body">
          <span className="cw-col-name">
            {p.contact.display_name ?? '(no name)'}
          </span>
          {p.contact.slug && <span className="cw-col-slug">/{p.contact.slug}</span>}
        </span>
      </span>
      <span className="cw-col-pick">
        <span className="cw-pick-radio" />
        {p.isKeeper ? 'Keep' : 'Pick to keep'}
      </span>
      <span className="cw-col-foldlabel">Folds into the keeper</span>
    </button>
  )
}

function ReviewCellName({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="cw-field">
      <span className="cw-field-l">{label}</span>
      <span className="cw-field-v">
        {value ?? <em style={{ color: 'var(--ink-4)' }}>(no name)</em>}
      </span>
    </div>
  )
}

function ReviewCellChannels({ channels }: { channels: ChannelEntry[] }) {
  return (
    <div className="cw-field">
      <span className="cw-field-l">
        Channels
        <span className="cw-field-l-tag">{channels.length}</span>
      </span>
      <ul className="cw-field-list">
        {channels.length === 0 && (
          <li style={{ color: 'var(--ink-4)' }}>(none)</li>
        )}
        {channels.map((ch, i) => (
          <li key={`${ch.kind}-${ch.identifier}-${i}`}>
            <span
              className={`cw-channel-dot ${CHANNEL_DOT_CLASS[ch.kind] ?? ''}`}
              style={{ background: `var(--${CHANNEL_DOT_CLASS[ch.kind] ?? 'ink'})` }}
            />
            <span>
              {ch.identifier}
              {ch.primary && (
                <span className="cw-channel-primary" style={{ marginLeft: 6 }}>
                  Primary
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

interface ReviewCellBrandsProps {
  brands: MergeInputs['survivor_brands']
  brandLookup: MergeInputs['brand_lookup']
}

function ReviewCellBrands(p: ReviewCellBrandsProps) {
  // Sort: active brands first, then by created_at desc. Take top-N + rollup.
  // Scale guard mirrors the Pitches cell — hundreds-of-brands case shouldn't
  // blow out the Step-1 row height.
  const sorted = [...p.brands].sort((a, b) => {
    const aActive = a.ended_at === null
    const bActive = b.ended_at === null
    if (aActive !== bActive) return aActive ? -1 : 1
    return b.created_at.localeCompare(a.created_at)
  })
  const preview = sorted.slice(0, BRAND_PREVIEW_CAP)
  const overflow = Math.max(0, p.brands.length - preview.length)
  return (
    <div className="cw-field">
      <span className="cw-field-l">
        Brands
        <span className="cw-field-l-tag">{p.brands.length}</span>
      </span>
      <ul className="cw-field-list">
        {preview.length === 0 && (
          <li style={{ color: 'var(--ink-4)' }}>(none)</li>
        )}
        {preview.map((cb) => (
          <li key={cb.brand_id}>
            <span>
              {p.brandLookup.get(cb.brand_id)?.name ?? '(brand)'}
              {cb.role && (
                <span style={{ color: 'var(--ink-4)', marginLeft: 8 }}>
                  · {cb.role}
                </span>
              )}
              {cb.ended_at && (
                <span style={{ color: 'var(--ink-4)', marginLeft: 8 }}>
                  · ended
                </span>
              )}
            </span>
          </li>
        ))}
        {overflow > 0 && (
          <li className="cw-field-list-more">+ {overflow} more</li>
        )}
      </ul>
    </div>
  )
}

// Render top-3 newest pitches per canon `.cw-pitchrow` row shape; cap at 3 +
// "+N more" rollup line so 100-pitch contacts (clean-up merges) don't blow
// out modal height. Per Founder direction 2026-06-02 (b option).
const PITCH_PREVIEW_CAP = 3
// Step-1 brand list — same scale-guard pattern as pitches. 3 newest + rollup.
const BRAND_PREVIEW_CAP = 3
// Step-3 preview caps (Founder direction 2026-06-02 scale guard for hundreds-
// of-brands and hundreds-of-pitches edge case). Both surfaces keep header
// content scannable; the full set lives on the survivor's detail page post-
// merge.
const BRAND_CARD_CAP = 6
const PITCH_HISTORY_CAP = 12

function ReviewCellPitches(p: {
  pitches: PitchWithProvenance[]
  total: number
  brandLookup: MergeInputs['brand_lookup']
}) {
  const sorted = [...p.pitches].sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  )
  const preview = sorted.slice(0, PITCH_PREVIEW_CAP)
  const overflow = Math.max(0, p.total - preview.length)
  return (
    <div className="cw-field">
      <span className="cw-field-l">
        Pitches
        <span className="cw-field-l-tag">{p.total}</span>
      </span>
      {preview.length === 0 ? (
        <span style={{ color: 'var(--ink-4)', fontSize: 13 }}>(none)</span>
      ) : (
        <div className="cw-pitchlist">
          {preview.map((pi) => {
            const brand = pi.brand_id
              ? p.brandLookup.get(pi.brand_id)?.name ?? pi.brand_name
              : pi.brand_name
            const amount =
              pi.budget_amount != null && pi.budget_currency
                ? formatCurrencyAmount(pi.budget_currency, pi.budget_amount)
                : null
            const summary = pi.ai_summary?.trim() ?? ''
            return (
              <div className="cw-pitchrow" key={pi.id}>
                <span className="cw-pitchrow-d">{shortDate(pi.created_at)}</span>
                <span className="cw-pitchrow-s">
                  {brand ? <b>{brand}</b> : <b>(no brand)</b>}
                  {summary && <> · {summary}</>}
                </span>
                <span
                  className={`cw-pitchrow-a${amount ? '' : ' is-muted'}`}
                >
                  {amount ?? '—'}
                </span>
              </div>
            )
          })}
          {overflow > 0 && (
            <div className="cw-pitchrow-more">+ {overflow} more</div>
          )}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// STEP 2 — Resolve
// ============================================================================

interface Step2Props {
  conflicts: Conflict[]
  carryItems: string[]
  resolutions: MergeResolutions
  // Smoke fix 2026-06-02 §1.14: chooser-card LEFT/RIGHT positions mirror the
  // Step-1 column LEFT/RIGHT positions. When keeperIsLeft=true, conflict
  // `keeperValue` renders on the LEFT card and `otherValue` on the RIGHT
  // card (i.e., current behavior); when keeperIsLeft=false (user flipped at
  // Step 1), the keeperValue belongs on the RIGHT and otherValue on the LEFT.
  // The pre-set marker + "Keeper" / "Duplicate" copy follow the keeper side;
  // data stays in its respective column.
  keeperIsLeft: boolean
  pickDisplayName: (value: string | null) => void
  pickPrimary: (channel: ChannelKey) => void
  pickBrandRole: (brand_id: string, role: ContactRole | null) => void
  pickBrandEnded: (
    brand_id: string,
    ended_at: string,
    ended_reason: string | null,
  ) => void
  isPrimaryPicked: (ch: ChannelEntry) => boolean
  isRolePicked: (brand_id: string, role: ContactRole | null) => boolean
  isEndedPicked: (brand_id: string, ended_at: string) => boolean
}

function Step2Resolve(p: Step2Props) {
  if (p.conflicts.length === 0) {
    return (
      <div className="cw-resolve">
        <h2 className="cw-resolve-h">
          Nothing to decide<span className="dot">.</span>
        </h2>
        <p className="cw-resolve-sub">
          Both records agree on every field that matters. Click{' '}
          <b>Preview →</b> to see the combined Contact.
        </p>
        {p.carryItems.length > 0 && (
          <div className="cw-carry">
            <span className="cw-carry-h">Carries over automatically · no decision needed</span>
            <ul className="cw-carry-list">
              {p.carryItems.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="cw-resolve">
      <h2 className="cw-resolve-h">
        {p.conflicts.length}{' '}
        {p.conflicts.length === 1 ? 'thing' : 'things'} to decide
        <span className="dot">.</span>
      </h2>
      <p className="cw-resolve-sub">
        Each is <b>pre-set to your keeper</b>. Change any you want —
        everything else just carries over.
      </p>

      {p.conflicts.map((c, i) => (
        <ConflictChooser
          key={`${c.kind}-${i}`}
          conflict={c}
          resolutions={p.resolutions}
          keeperIsLeft={p.keeperIsLeft}
          pickDisplayName={p.pickDisplayName}
          pickPrimary={p.pickPrimary}
          pickBrandRole={p.pickBrandRole}
          pickBrandEnded={p.pickBrandEnded}
          isPrimaryPicked={p.isPrimaryPicked}
          isRolePicked={p.isRolePicked}
          isEndedPicked={p.isEndedPicked}
        />
      ))}

      {p.carryItems.length > 0 && (
        <div className="cw-carry">
          <span className="cw-carry-h">Carries over automatically · no decision needed</span>
          <ul className="cw-carry-list">
            {p.carryItems.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

interface ConflictChooserProps {
  conflict: Conflict
  resolutions: MergeResolutions
  keeperIsLeft: boolean
  pickDisplayName: (value: string | null) => void
  pickPrimary: (channel: ChannelKey) => void
  pickBrandRole: (brand_id: string, role: ContactRole | null) => void
  pickBrandEnded: (
    brand_id: string,
    ended_at: string,
    ended_reason: string | null,
  ) => void
  isPrimaryPicked: (ch: ChannelEntry) => boolean
  isRolePicked: (brand_id: string, role: ContactRole | null) => boolean
  isEndedPicked: (brand_id: string, ended_at: string) => boolean
}

// Helpers for picking which conflict side (keeper vs other) lands on which
// chooser-card slot (LEFT vs RIGHT). Step-1 column LEFT always holds the
// original inputs.survivor; eff.keeper aligns with that ONLY when
// keeperIsLeft=true. When keeperIsLeft=false, eff.keeper is the original
// inputs.loser (right column). The chooser must mirror Step-1's stable
// LEFT/RIGHT layout: left card = left column's value; right card = right
// column's value. The keeper label / pre-set marker follows the keeper side.
const KEEPER_LABEL = 'Keeper'
const DUP_LABEL = 'Duplicate'

function ConflictChooser(p: ConflictChooserProps) {
  const c = p.conflict
  const leftIsKeeper = p.keeperIsLeft
  const rightIsKeeper = !p.keeperIsLeft

  if (c.kind === 'display_name') {
    const leftValue = leftIsKeeper ? c.keeperValue : c.otherValue
    const rightValue = leftIsKeeper ? c.otherValue : c.keeperValue
    const isLeftPicked = p.resolutions.display_name === leftValue
    const isRightPicked = p.resolutions.display_name === rightValue
    return (
      <div className="cw-conflict">
        <div className="cw-conflict-l">
          <span className="cw-conflict-title">Display name</span>
          <span className="cw-conflict-why">
            Keeper holds the history; duplicate may have the correct spelling.
          </span>
        </div>
        <div className="cw-choices">
          <ChooserCard
            isSelected={isLeftPicked}
            isPreset={leftIsKeeper}
            who={leftIsKeeper ? KEEPER_LABEL : DUP_LABEL}
            value={leftValue ?? '(no name)'}
            onClick={() => p.pickDisplayName(leftValue)}
          />
          <ChooserCard
            isSelected={isRightPicked}
            isPreset={rightIsKeeper}
            who={rightIsKeeper ? KEEPER_LABEL : DUP_LABEL}
            value={rightValue ?? '(no name)'}
            onClick={() => p.pickDisplayName(rightValue)}
          />
        </div>
      </div>
    )
  }

  if (c.kind === 'primary') {
    const leftChannel = leftIsKeeper ? c.keeperChannel : c.otherChannel
    const rightChannel = leftIsKeeper ? c.otherChannel : c.keeperChannel
    return (
      <div className="cw-conflict">
        <div className="cw-conflict-l">
          <span className="cw-conflict-title">Primary channel</span>
          <span className="cw-conflict-why">
            Both channels are kept on the record. Exactly one is Primary.
          </span>
        </div>
        <div className="cw-choices">
          <ChooserCard
            isSelected={p.isPrimaryPicked(leftChannel)}
            isPreset={leftIsKeeper}
            who={`${leftIsKeeper ? KEEPER_LABEL : DUP_LABEL} · ${leftChannel.kind}`}
            value={leftChannel.identifier}
            isMono
            onClick={() =>
              p.pickPrimary({
                kind: leftChannel.kind,
                identifier: leftChannel.identifier,
              })
            }
          />
          <ChooserCard
            isSelected={p.isPrimaryPicked(rightChannel)}
            isPreset={rightIsKeeper}
            who={`${rightIsKeeper ? KEEPER_LABEL : DUP_LABEL} · ${rightChannel.kind}`}
            value={rightChannel.identifier}
            isMono
            onClick={() =>
              p.pickPrimary({
                kind: rightChannel.kind,
                identifier: rightChannel.identifier,
              })
            }
          />
        </div>
      </div>
    )
  }

  if (c.kind === 'brand_role') {
    const leftRole = leftIsKeeper ? c.keeperRole : c.otherRole
    const rightRole = leftIsKeeper ? c.otherRole : c.keeperRole
    return (
      <div className="cw-conflict">
        <div className="cw-conflict-l">
          <span className="cw-conflict-title">Role at {c.brand_name}</span>
          <span className="cw-conflict-why">
            Each record holds a different role for this brand. Pick one.
          </span>
        </div>
        <div className="cw-choices">
          <ChooserCard
            isSelected={p.isRolePicked(c.brand_id, leftRole)}
            isPreset={leftIsKeeper}
            who={leftIsKeeper ? KEEPER_LABEL : DUP_LABEL}
            value={leftRole ?? '(no role)'}
            onClick={() => p.pickBrandRole(c.brand_id, leftRole)}
          />
          <ChooserCard
            isSelected={p.isRolePicked(c.brand_id, rightRole)}
            isPreset={rightIsKeeper}
            who={rightIsKeeper ? KEEPER_LABEL : DUP_LABEL}
            value={rightRole ?? '(no role)'}
            onClick={() => p.pickBrandRole(c.brand_id, rightRole)}
          />
        </div>
      </div>
    )
  }

  // brand_ended
  const leftEndedAt = leftIsKeeper ? c.keeperEndedAt : c.otherEndedAt
  const leftEndedReason = leftIsKeeper ? c.keeperEndedReason : c.otherEndedReason
  const rightEndedAt = leftIsKeeper ? c.otherEndedAt : c.keeperEndedAt
  const rightEndedReason = leftIsKeeper ? c.otherEndedReason : c.keeperEndedReason
  const leftDate = formatDate(leftEndedAt)
  const rightDate = formatDate(rightEndedAt)
  return (
    <div className="cw-conflict">
      <div className="cw-conflict-l">
        <span className="cw-conflict-title">{c.brand_name} · ended dates differ</span>
        <span className="cw-conflict-why">
          Both records mark the link ended on different dates. Pick the
          most-current truth.
        </span>
      </div>
      <div className="cw-choices">
        <ChooserCard
          isSelected={p.isEndedPicked(c.brand_id, leftEndedAt)}
          isPreset={leftIsKeeper}
          who={leftIsKeeper ? KEEPER_LABEL : DUP_LABEL}
          value={`${leftDate}${leftEndedReason ? ` · ${leftEndedReason}` : ''}`}
          onClick={() =>
            p.pickBrandEnded(c.brand_id, leftEndedAt, leftEndedReason)
          }
        />
        <ChooserCard
          isSelected={p.isEndedPicked(c.brand_id, rightEndedAt)}
          isPreset={rightIsKeeper}
          who={rightIsKeeper ? KEEPER_LABEL : DUP_LABEL}
          value={`${rightDate}${rightEndedReason ? ` · ${rightEndedReason}` : ''}`}
          onClick={() =>
            p.pickBrandEnded(c.brand_id, rightEndedAt, rightEndedReason)
          }
        />
      </div>
    </div>
  )
}

interface ChooserCardProps {
  isSelected: boolean
  isPreset?: boolean
  who: string
  value: string
  isMono?: boolean
  onClick: () => void
}

function ChooserCard(p: ChooserCardProps) {
  return (
    <button
      type="button"
      className={`cw-choice ${p.isSelected ? 'is-selected' : ''}`}
      onClick={p.onClick}
    >
      <span className="cw-choice-marker" />
      <span className="cw-choice-text">
        <span className="cw-choice-who">
          {p.who}
          {p.isPreset && <span className="cw-choice-who-preset">· pre-set</span>}
        </span>
        <span className={`cw-choice-v ${p.isMono ? 'is-mono' : ''}`}>
          {p.value}
        </span>
      </span>
    </button>
  )
}

// ============================================================================
// STEP 3 — Preview
// ============================================================================

interface Step3Props {
  result: MergeResult
  keeperDisplayName: string | null
  // Survivor's slug (the one kept post-merge per merge_contacts RPC; loser's
  // slug becomes a 301 alias in previous_slugs). Threaded from eff.keeper.slug
  // so it tracks whichever side is currently the keeper.
  keeperSlug: string | null
  // Smoke fix 2026-06-02 §3: "from <loserName>" replaces the generic "from
  // dup" / "from duplicate" labels on pitch-history rows and brand-card meta.
  // Passed from the wizard via eff.other.display_name so the label tracks
  // whichever side is currently the loser (stable across keeper-flip).
  loserDisplayName: string
  committing: boolean
  commitError: string | null
  onCombine: () => void
}

function Step3Preview(p: Step3Props) {
  const { preview } = p.result
  const initial = (preview.display_name?.[0] ?? '·').toUpperCase()

  return (
    <>
      <div className="cw-preview-banner">
        Preview · this is the one record you&rsquo;ll be left with
      </div>

      <div className="cw-result">
        <div className="cw-result-head">
          <span className="cw-result-avatar">{initial}</span>
          <div className="cw-result-id">
            <h2 className="cw-result-h1">{preview.display_name ?? '(no name)'}</h2>
            {/* Meta line: slug + counts per canon (Stress-Test 590-594).
                Each item is its own span; the `·` separator is rendered by
                `.cw-result-meta span+span::before`. */}
            <div className="cw-result-meta">
              {p.keeperSlug && <span>/app/people/{p.keeperSlug}</span>}
              <span>{preview.pitch_history.length} pitches</span>
              <span>{preview.brand_cards.length} brands</span>
              <span>{preview.channels.length} channels</span>
            </div>
          </div>
        </div>

        {preview.channels.length > 0 && (
          <div className="cw-result-block">
            <span className="cw-result-block-h">Channels</span>
            <div className="cw-channels">
              {preview.channels.map((ch, i) => (
                <span
                  key={`${ch.kind}-${ch.identifier}-${i}`}
                  className="cw-channel"
                >
                  <span
                    className="cw-channel-dot"
                    style={{ background: `var(--${CHANNEL_DOT_CLASS[ch.kind] ?? 'ink'})` }}
                  />
                  {ch.identifier}
                  {ch.primary && (
                    <span className="cw-channel-primary">Primary</span>
                  )}
                </span>
              ))}
            </div>
          </div>
        )}

        {preview.brand_cards.length > 0 && (
          <div className="cw-result-block">
            <span className="cw-result-block-h">Brands</span>
            <div className="cw-brand-cards">
              {/* Cap to top BRAND_CARD_CAP cards (sorted most-recent-pitch
                  first in buildBrandCards) + "+ N more" rollup. Scale guard
                  per Founder direction 2026-06-02 — hundreds-of-brands case
                  would otherwise blow out modal height. The full list still
                  lives on the survivor's contact detail page post-merge. */}
              {preview.brand_cards.slice(0, BRAND_CARD_CAP).map((bc) => (
                <div
                  key={bc.brand_id}
                  className={`cw-brand-card ${bc.provenance !== 'survivor' ? 'is-pick' : ''}`}
                >
                  <div className="cw-brand-card-l">
                    <span className="cw-brand-card-name">{bc.brand_name}</span>
                    <span className="cw-brand-card-meta">
                      {bc.role ?? 'no role'} ·{' '}
                      {bc.ended_at ? `ended ${formatDate(bc.ended_at)}` : 'active'}
                      {bc.provenance === 'loser' && (
                        <>
                          {' '}
                          <span className="cw-from-tag">
                            from {p.loserDisplayName}
                          </span>
                        </>
                      )}
                      {bc.provenance === 'merged' && ' · merged'}
                    </span>
                  </div>
                  <div className="cw-brand-card-r">
                    {bc.pitch_count} pitch{bc.pitch_count === 1 ? '' : 'es'}
                  </div>
                </div>
              ))}
              {preview.brand_cards.length > BRAND_CARD_CAP && (
                <div className="cw-brand-cards-more">
                  + {preview.brand_cards.length - BRAND_CARD_CAP} more brand{
                    preview.brand_cards.length - BRAND_CARD_CAP === 1 ? '' : 's'
                  } on the merged record
                </div>
              )}
            </div>
          </div>
        )}

        {preview.pitch_history.length > 0 && (
          <div className="cw-result-block">
            <span className="cw-result-block-h">
              Pitch history
              <span className="cw-result-block-h-tag">woven by date</span>
            </span>
            <div className="cw-history">
              {/* 4-column row per canon: date · brand+summary+from-tag ·
                  stage chip · amount. Cap at PITCH_HISTORY_CAP newest + rollup
                  bounds modal height for hundred-pitch contacts. */}
              {preview.pitch_history.slice(0, PITCH_HISTORY_CAP).map((ph) => {
                const amount =
                  ph.current_amount != null && ph.current_currency
                    ? formatCurrencyAmount(ph.current_currency, ph.current_amount)
                    : null
                return (
                  <div
                    key={ph.pitch_id}
                    className={`cw-history-row ${ph.from_loser ? 'is-from-loser' : ''}`}
                  >
                    <span className="cw-history-date">{shortDate(ph.created_at)}</span>
                    <span className="cw-history-s">
                      <span className="cw-history-s-text">
                        {ph.brand_name ? <b>{ph.brand_name}</b> : <b>(no brand)</b>}
                        {ph.summary && <> · {ph.summary}</>}
                      </span>
                      {ph.from_loser && (
                        <span className="cw-from-tag">from {p.loserDisplayName}</span>
                      )}
                    </span>
                    <span className="cw-history-stage">
                      {ph.stage ? (
                        <StageChip stage={ph.stage} direction={ph.direction} />
                      ) : (
                        <span className="cw-history-nodeal">No deal</span>
                      )}
                    </span>
                    <span
                      className={`cw-history-a${amount ? '' : ' is-muted'}`}
                    >
                      {amount ?? '—'}
                    </span>
                  </div>
                )
              })}
              {preview.pitch_history.length > PITCH_HISTORY_CAP && (
                <div className="cw-history-more">
                  + {preview.pitch_history.length - PITCH_HISTORY_CAP} more pitch{
                    preview.pitch_history.length - PITCH_HISTORY_CAP === 1 ? '' : 'es'
                  } on the merged history
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="cw-confirm">
        <div className="cw-confirm-text">
          <span className="cw-confirm-dest">
            Combine into{' '}
            <span className="cw-confirm-name">
              {p.keeperDisplayName ?? '(no name)'}
            </span>
            {p.keeperSlug && (
              <>
                {' '}
                <span className="cw-confirm-keeps">
                  · keeps <span className="cw-confirm-slug">/{p.keeperSlug}</span>
                </span>
              </>
            )}
          </span>
          <span className="cw-confirm-undo">This can&rsquo;t be undone</span>
          {p.commitError && (
            <span className="cw-confirm-err">Error: {p.commitError}</span>
          )}
        </div>
        <button
          type="button"
          className="btn-pill"
          onClick={p.onCombine}
          disabled={p.committing}
        >
          {p.committing ? 'Combining…' : 'Combine the records →'}
        </button>
      </div>
    </>
  )
}

// ============================================================================
// STEP 4 — Done
// ============================================================================

interface Step4Props {
  keeperName: string
  // Smoke fix 2026-06-02 — Step 4 success CTA is now a <Link> so middle-click /
  // cmd-click / ctrl-click opens the keeper page in a new tab (browser-default
  // anchor behavior). Plain left-click intercepts via onClick to fire the
  // close animation + parent's success-close (which performs the in-app
  // router.push). href is built from eff.keeper.slug (falls back to id);
  // both shapes resolve at /app/people/[person]/page.tsx per FR-8 slug routing.
  keeperHref: string
  loserName: string
  loserSlug: string | null
  pitchesCount: number
  channelsCount: number
  // Per smoke fix 2026-06-02 §1 "Cancel button bug" — Step 4's "Open <keeper>"
  // is the ONLY path that triggers parent navigation. Cancel/ESC/backdrop on
  // earlier steps use the wizard's onClose (no nav).
  onSuccessClose: () => void
}

function Step4Done(p: Step4Props) {
  return (
    <div className="cw-done">
      <span className="cw-done-stamp">✓ Combined</span>
      <h2 className="cw-done-h1">{p.keeperName}</h2>
      <p className="cw-done-body">
        <b>{p.pitchesCount}</b> pitches and <b>{p.channelsCount}</b> channels
        now live on a single record.
        {p.loserSlug && (
          <>
            {' '}
            <b>{p.loserName}</b> is gone; <code>/{p.loserSlug}</code> redirects
            to the keeper.
          </>
        )}
      </p>
      <Link
        href={p.keeperHref}
        className="btn-pill"
        onClick={(e) => {
          // Modifier-click / middle-click → let browser default open new tab.
          // Plain left-click → intercept; close animation + parent nav handle it.
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
          e.preventDefault()
          p.onSuccessClose()
        }}
      >
        Open {p.keeperName} →
      </Link>
    </div>
  )
}

// ============================================================================
// HELPERS
// ============================================================================

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    .toUpperCase()
}

// Short variant for Step-1 pitch preview rows — month + day, no year (canon
// row format: `MAY 25` · `<brand> · <summary>` · `$1,400`).
function shortDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    .toUpperCase()
}
