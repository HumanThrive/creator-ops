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
import {
  computeDefaultResolutions,
  computeMergeResult,
  type MergeInputs,
  type MergePayload,
  type MergeResolutions,
  type MergeResult,
  type ChannelKey,
  type BrandResolution,
} from '@/lib/contact-merge'
import type { ChannelEntry, ContactRole } from '@/lib/types/contact'

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
  onClose: () => void
  // Parent commits the payload (typically supabase.rpc('merge_contacts', payload))
  // and returns success/error. On success, the wizard advances to the Done step;
  // the user's "Close" click then triggers onClose (parent handles navigation
  // to survivor's /app/people/[person] per AC3.5).
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

function carryOverItems(eff: EffectiveInputs): string[] {
  const items: string[] = []

  // Non-primary channels from the other contact (won't conflict; carry into union)
  const keeperKeys = new Set(
    eff.keeper.channels.map((c) => `${c.kind}::${c.identifier}`),
  )
  for (const ch of eff.other.channels) {
    const key = `${ch.kind}::${ch.identifier}`
    if (keeperKeys.has(key)) continue
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
  const carryItems = useMemo(() => carryOverItems(eff), [eff])

  // Escape key dismiss — except during commit + success.
  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      if (ev.key === 'Escape' && !committing && step !== 4) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [committing, step, onClose])

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
      className="pitch-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget && !committing && step !== 4) onClose()
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
            onClick={onClose}
            disabled={committing}
            aria-label="Close"
          >
            ✕
          </button>
        </header>

        {/* Body — step-specific panels */}
        <div className="cw-body">
          {step === 1 && (
            <Step1Review
              eff={eff}
              keeperIsLeft={keeperIsLeft}
              onPickLeft={setKeeperLeft}
              onPickRight={setKeeperRight}
              conflictsCount={conflicts.length}
              channelUnionCount={channelUnionCount}
              brandUnionCount={brandUnionCount}
            />
          )}
          {step === 2 && (
            <Step2Resolve
              conflicts={conflicts}
              carryItems={carryItems}
              resolutions={resolutions}
              pickDisplayName={pickDisplayName}
              pickPrimary={pickPrimary}
              pickBrandRole={pickBrandRole}
              pickBrandEnded={pickBrandEnded}
              isPrimaryPicked={isPrimaryPicked}
              isRolePicked={isRolePicked}
              isEndedPicked={isEndedPicked}
            />
          )}
          {step === 3 && previewSnapshot && (
            <Step3Preview
              result={previewSnapshot}
              keeperDisplayName={resolutions.display_name}
              committing={committing}
              commitError={commitError}
              onCombine={onCombine}
            />
          )}
          {step === 4 && (
            <Step4Done
              keeperName={resolutions.display_name ?? '(no name)'}
              loserName={eff.other.display_name ?? '(no name)'}
              loserSlug={eff.other.slug}
              pitchesCount={eff.pitches.length}
              channelsCount={channelUnionCount}
              onClose={onClose}
            />
          )}
        </div>

        {/* Footer — hidden on success step (Done has its own button inline) */}
        {step < 4 && (
          <footer className="modal-foot cw-foot">
            <div className="cw-foot-l">
              <button
                type="button"
                className="cw-cancel"
                onClick={onClose}
                disabled={committing}
              >
                ✕ Cancel
              </button>
              <span className="cw-step-help">
                {step === 1 && 'Step 1 of 3 · review both records'}
                {step === 2 && `Step 2 of 3 · ${conflicts.length} to decide`}
                {step === 3 && 'Step 3 of 3 · preview the result'}
              </span>
            </div>
            <div className="cw-foot-r">
              {step > 1 && (
                <button
                  type="button"
                  className="btn-pill ghost"
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

interface Step1Props {
  eff: EffectiveInputs
  keeperIsLeft: boolean
  onPickLeft: () => void
  onPickRight: () => void
  conflictsCount: number
  channelUnionCount: number
  brandUnionCount: number
}

function Step1Review(p: Step1Props) {
  const left = p.eff.survivor // visually left column = always inputs.survivor
  const right = p.eff.loser
  const leftIsKeeper = p.keeperIsLeft
  const rightIsKeeper = !p.keeperIsLeft

  const leftPitches = p.eff.pitches.filter(
    (pi) => pi.source === 'survivor' || pi.source === 'both',
  )
  const rightPitches = p.eff.pitches.filter(
    (pi) => pi.source === 'loser' || pi.source === 'both',
  )

  // To render left/right brands correctly under the swap, we look up which
  // contact is the "survivor" in the original `inputs` shape — left always
  // shows the original inputs.survivor's brands.
  const leftBrands = p.eff.keeperBrands.length
    ? leftIsKeeper
      ? p.eff.keeperBrands
      : p.eff.otherBrands
    : p.eff.otherBrands
  const rightBrands = leftIsKeeper ? p.eff.otherBrands : p.eff.keeperBrands

  return (
    <>
      <div className="cw-summary">
        <p className="cw-summary-text">
          You&rsquo;re combining <b>2 Contacts</b> into <b>1</b>. Nothing is
          lost — pitches and channels move to the keeper.
        </p>
        <div className="cw-summary-chips">
          <span className="cw-chip">{p.eff.pitches.length} pitches</span>
          <span className="cw-chip">{p.channelUnionCount} channels</span>
          <span className="cw-chip">{p.brandUnionCount} brands</span>
          {p.conflictsCount > 0 && (
            <span className="cw-chip is-pick">
              {p.conflictsCount} to resolve
            </span>
          )}
        </div>
      </div>

      <div className="cw-review">
        {/* Merge-direction badge centered on the divider */}
        <div className="cw-merge" data-direction={leftIsKeeper ? 'left' : 'right'}>
          →
        </div>

        <ReviewColumn
          contact={left}
          brands={leftBrands}
          pitchCount={leftPitches.length}
          brandLookup={p.eff.brand_lookup}
          isKeeper={leftIsKeeper}
          onPick={p.onPickLeft}
        />
        <ReviewColumn
          contact={right}
          brands={rightBrands}
          pitchCount={rightPitches.length}
          brandLookup={p.eff.brand_lookup}
          isKeeper={rightIsKeeper}
          onPick={p.onPickRight}
        />
      </div>
    </>
  )
}

interface ReviewColumnProps {
  contact: EffectiveInputs['survivor']
  brands: EffectiveInputs['survivor_brands']
  pitchCount: number
  brandLookup: EffectiveInputs['brand_lookup']
  isKeeper: boolean
  onPick: () => void
}

function ReviewColumn(p: ReviewColumnProps) {
  const initial = (p.contact.display_name?.[0] ?? '·').toUpperCase()
  return (
    <div className={`cw-col ${p.isKeeper ? 'is-keep' : ''}`}>
      <button type="button" className="cw-col-head" onClick={p.onPick}>
        <span className="cw-col-avatar">{initial}</span>
        <span className="cw-col-id">
          <span className="cw-col-name">
            {p.contact.display_name ?? '(no name)'}
          </span>
          {p.contact.slug && <span className="cw-col-slug">/{p.contact.slug}</span>}
        </span>
        <span className="cw-col-pick">
          <span className="cw-pick-radio" />
          {p.isKeeper ? 'Keep' : 'Pick to keep'}
        </span>
      </button>
      {!p.isKeeper && (
        <span className="cw-col-foldlabel">↘ Folds into the keeper</span>
      )}

      <div className="cw-field">
        <span className="cw-field-l">Display name</span>
        <span className="cw-field-v">
          {p.contact.display_name ?? <em style={{ color: 'var(--ink-4)' }}>(no name)</em>}
        </span>
      </div>

      <div className="cw-field">
        <span className="cw-field-l">
          Channels
          <span className="cw-field-l-tag">{p.contact.channels.length}</span>
        </span>
        <ul className="cw-field-list">
          {p.contact.channels.length === 0 && (
            <li style={{ color: 'var(--ink-4)' }}>(none)</li>
          )}
          {p.contact.channels.map((ch, i) => (
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

      <div className="cw-field">
        <span className="cw-field-l">
          Brands
          <span className="cw-field-l-tag">{p.brands.length}</span>
        </span>
        <ul className="cw-field-list">
          {p.brands.length === 0 && (
            <li style={{ color: 'var(--ink-4)' }}>(none)</li>
          )}
          {p.brands.map((cb) => (
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
        </ul>
      </div>

      <div className="cw-field">
        <span className="cw-field-l">
          Pitches
          <span className="cw-field-l-tag">{p.pitchCount}</span>
        </span>
      </div>
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

function ConflictChooser(p: ConflictChooserProps) {
  const c = p.conflict

  if (c.kind === 'display_name') {
    const isKeeperPicked = p.resolutions.display_name === c.keeperValue
    const isOtherPicked = p.resolutions.display_name === c.otherValue
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
            isSelected={isKeeperPicked}
            isPreset
            who="Keeper"
            value={c.keeperValue ?? '(no name)'}
            onClick={() => p.pickDisplayName(c.keeperValue)}
          />
          <ChooserCard
            isSelected={isOtherPicked}
            who="Duplicate"
            value={c.otherValue ?? '(no name)'}
            onClick={() => p.pickDisplayName(c.otherValue)}
          />
        </div>
      </div>
    )
  }

  if (c.kind === 'primary') {
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
            isSelected={p.isPrimaryPicked(c.keeperChannel)}
            isPreset
            who={`Keeper · ${c.keeperChannel.kind}`}
            value={c.keeperChannel.identifier}
            isMono
            onClick={() =>
              p.pickPrimary({
                kind: c.keeperChannel.kind,
                identifier: c.keeperChannel.identifier,
              })
            }
          />
          <ChooserCard
            isSelected={p.isPrimaryPicked(c.otherChannel)}
            who={`Duplicate · ${c.otherChannel.kind}`}
            value={c.otherChannel.identifier}
            isMono
            onClick={() =>
              p.pickPrimary({
                kind: c.otherChannel.kind,
                identifier: c.otherChannel.identifier,
              })
            }
          />
        </div>
      </div>
    )
  }

  if (c.kind === 'brand_role') {
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
            isSelected={p.isRolePicked(c.brand_id, c.keeperRole)}
            isPreset
            who="Keeper"
            value={c.keeperRole ?? '(no role)'}
            onClick={() => p.pickBrandRole(c.brand_id, c.keeperRole)}
          />
          <ChooserCard
            isSelected={p.isRolePicked(c.brand_id, c.otherRole)}
            who="Duplicate"
            value={c.otherRole ?? '(no role)'}
            onClick={() => p.pickBrandRole(c.brand_id, c.otherRole)}
          />
        </div>
      </div>
    )
  }

  // brand_ended
  const keeperDate = formatDate(c.keeperEndedAt)
  const otherDate = formatDate(c.otherEndedAt)
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
          isSelected={p.isEndedPicked(c.brand_id, c.keeperEndedAt)}
          isPreset
          who="Keeper"
          value={`${keeperDate}${c.keeperEndedReason ? ` · ${c.keeperEndedReason}` : ''}`}
          onClick={() =>
            p.pickBrandEnded(c.brand_id, c.keeperEndedAt, c.keeperEndedReason)
          }
        />
        <ChooserCard
          isSelected={p.isEndedPicked(c.brand_id, c.otherEndedAt)}
          who="Duplicate"
          value={`${otherDate}${c.otherEndedReason ? ` · ${c.otherEndedReason}` : ''}`}
          onClick={() =>
            p.pickBrandEnded(c.brand_id, c.otherEndedAt, c.otherEndedReason)
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
            <span className="cw-result-meta">
              {preview.channels.length} channels · {preview.brand_cards.length} brands ·{' '}
              {preview.pitch_history.length} pitches
            </span>
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
              {preview.brand_cards.map((bc) => (
                <div
                  key={bc.brand_id}
                  className={`cw-brand-card ${bc.provenance !== 'survivor' ? 'is-pick' : ''}`}
                >
                  <div className="cw-brand-card-l">
                    <span className="cw-brand-card-name">{bc.brand_name}</span>
                    <span className="cw-brand-card-meta">
                      {bc.role ?? 'no role'} ·{' '}
                      {bc.ended_at ? `ended ${formatDate(bc.ended_at)}` : 'active'}
                      {bc.provenance === 'loser' && ' · from duplicate'}
                      {bc.provenance === 'merged' && ' · merged'}
                    </span>
                  </div>
                  <div className="cw-brand-card-r">
                    {bc.pitch_count} pitch{bc.pitch_count === 1 ? '' : 'es'}
                  </div>
                </div>
              ))}
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
              {preview.pitch_history.slice(0, 12).map((ph) => (
                <div
                  key={ph.pitch_id}
                  className={`cw-history-row ${ph.from_loser ? 'is-from-loser' : ''}`}
                >
                  <span className="cw-history-date">{formatDate(ph.created_at)}</span>
                  <span>
                    {ph.brand_name ?? '(no brand)'}
                    {ph.from_loser && <span className="cw-history-from">from dup</span>}
                  </span>
                  <span style={{ color: 'var(--ink-4)' }}>{ph.pitch_id.slice(0, 8)}</span>
                </div>
              ))}
              {preview.pitch_history.length > 12 && (
                <div className="cw-history-row">
                  <span className="cw-history-date" />
                  <span style={{ color: 'var(--ink-4)' }}>
                    + {preview.pitch_history.length - 12} more
                  </span>
                  <span />
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="cw-confirm">
        <div className="cw-confirm-text">
          <span className="cw-confirm-dest">
            Combine into <b>{p.keeperDisplayName ?? '(no name)'}</b>
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
  loserName: string
  loserSlug: string | null
  pitchesCount: number
  channelsCount: number
  onClose: () => void
}

function Step4Done(p: Step4Props) {
  return (
    <div className="cw-done">
      <span className="cw-done-stamp">✓ Combined</span>
      <h2 className="cw-done-h1">One {p.keeperName}.</h2>
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
      <button type="button" className="btn-pill" onClick={p.onClose}>
        Open {p.keeperName} →
      </button>
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
