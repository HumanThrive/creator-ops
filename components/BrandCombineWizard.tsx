'use client'

// BrandCombineWizard — Brand merge ("Combine") wizard. FR-10 #96.
//
// 3-step stepped modal (Review → Resolve → Preview) + success state (Done).
// Brand-axis fork of CombineWizard (FR-9 #82): reuses the shipped `.cw-*` chrome
// (rail · two-col review · conflict choosers · full-replacement preview · confirm
// bar) and step grammar wholesale; swaps the entities + conflict model. Pure UI —
// the parent provides `onCommit(payload)` (typically supabase.rpc('merge_brands'))
// so this component doesn't import supabase and stays reusable across the four
// FR-10 entry points (rename / delete-block / create callouts + select-two).
//
// Brand variant vs FR-9 (per the locked design):
//   - Review rows: name · slug · pitches · contacts · deals (channels+brands → a
//     contacts list; brand-name + deal-totals are new rows).
//   - Conflicts: brand NAME ALWAYS conflicts (brands_user_lower_name_uniq → two
//     brands can't share a name) + per-Contact conflicts only when the SAME Contact
//     links both brands (role chooser when both active + roles differ; ended chooser
//     when both ended; one-active-one-ended auto-resolves to active → carry-over).
//   - Preview: combined-totals 3-stat + consolidated contacts table + woven pitch
//     history (no channels/brand-cards).
//
// Spec: workspace/build-requests/FR-10-brand-merge.md (Final Consolidated Spec)
// Design canon: docs/design/design_handoff_supaspike/design_handoff_supaspike/
//   crm/fr10-panels/fr10-combine-wizard.html (locked render).
// CSS family: .cw-* (shared with FR-9) + the FR-10 brand additions at the EOF of
//   app/app/design-system.css (.cw-contacts / .cw-state / .cw-result-stats /
//   .cw-result-contacts / .cw-crow / .cw-result-slugnote). Roles render via the
//   FR-8 `.ctc-role` pill canon (ROLE_CLASS).

import { useState, useMemo, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  computeDefaultBrandResolutions,
  computeBrandMergeResult,
  summarizeDeals,
  type BrandMergeInputs,
  type BrandMergePayload,
  type BrandMergeResolutions,
  type BrandMergeResult,
  type BrandPitchWithProvenance,
  type ContactLinkResolution,
  type DealSummary,
} from '@/lib/brand-merge'
import { ROLE_CLASS, type ContactRole } from '@/lib/types/contact'
import { formatCurrencyAmount } from '@/lib/pitch-stats'
import { StageChip } from '@/components/StageChip'

// ============================================================================
// PROPS
// ============================================================================

export interface BrandCombineWizardProps {
  // Both brands + association graphs, freshly loaded at wizard-open (AC1.5).
  // The left column is tied to inputs.survivor, right to inputs.loser (stable
  // positions; keeper state follows the toggle).
  inputs: BrandMergeInputs
  // Default keeper seed per entry point (AC1.1-1.4):
  //   'survivor' — inputs.survivor is the default keeper (rename-collision name
  //     owner · create-collision existing · select-two more-pitches).
  //   'loser' — inputs.loser is the default keeper (delete-block: the blocked
  //     brand is the loser; the typeahead-picked other is the keeper).
  defaultSurvivor: 'survivor' | 'loser'
  // Cancel-shape close: ESC / backdrop / Cancel / ✕. Parent does NOT navigate.
  onClose: () => void
  // Success-shape close: Step-4 Done "Open <keeper> →" only. Parent navigates to
  // the survivor's /app/brands/<slug> (AC3.5). Falls back to onClose if omitted.
  onSuccessClose?: () => void
  // Parent commits (supabase.rpc('merge_brands', payload)); on success the wizard
  // advances to Done.
  onCommit: (
    payload: BrandMergePayload,
  ) => Promise<{ success: true } | { success: false; error: string }>
}

// ============================================================================
// CONFLICT MODEL
// ============================================================================
// The Resolve step surfaces ONLY genuine ambiguities. Name ALWAYS conflicts
// (UNIQUE index). Per-Contact: a role card when both links are active and roles
// differ; an ended card when both links are ended and any axis differs. Mixed
// state (one active, one ended) deterministically resolves to active → carry-over.

type BrandConflict =
  | {
      kind: 'name'
      keeperValue: string
      otherValue: string
    }
  | {
      kind: 'contact_role'
      contact_id: string
      contact_name: string | null
      keeperRole: ContactRole | null
      otherRole: ContactRole | null
    }
  | {
      kind: 'contact_ended'
      contact_id: string
      contact_name: string | null
      keeperRole: ContactRole | null
      keeperEndedAt: string
      keeperEndedReason: string | null
      otherRole: ContactRole | null
      otherEndedAt: string
      otherEndedReason: string | null
    }

interface EffectiveBrandInputs extends BrandMergeInputs {
  // keeper = inputs.survivor when keeperIsLeft; else inputs.loser.
  keeper: BrandMergeInputs['survivor']
  other: BrandMergeInputs['loser']
  keeperContacts: BrandMergeInputs['survivor_contacts']
  otherContacts: BrandMergeInputs['loser_contacts']
}

function deriveEffective(
  inputs: BrandMergeInputs,
  keeperIsLeft: boolean,
): EffectiveBrandInputs {
  if (keeperIsLeft) {
    return {
      ...inputs,
      keeper: inputs.survivor,
      other: inputs.loser,
      keeperContacts: inputs.survivor_contacts,
      otherContacts: inputs.loser_contacts,
    }
  }
  // Right column (inputs.loser) is the keeper → feed computeBrandMergeResult
  // survivor=loser, loser=survivor, with pitch provenance flipped.
  return {
    survivor: inputs.loser,
    loser: inputs.survivor,
    survivor_contacts: inputs.loser_contacts,
    loser_contacts: inputs.survivor_contacts,
    pitches: inputs.pitches.map((p) => ({
      ...p,
      source: p.source === 'survivor' ? 'loser' : 'survivor',
    })),
    contact_lookup: inputs.contact_lookup,
    keeper: inputs.loser,
    other: inputs.survivor,
    keeperContacts: inputs.loser_contacts,
    otherContacts: inputs.survivor_contacts,
  }
}

function computeBrandConflicts(eff: EffectiveBrandInputs): BrandConflict[] {
  const conflicts: BrandConflict[] = []

  // Brand name — ALWAYS a conflict (two brands never share a case-insensitive name).
  conflicts.push({
    kind: 'name',
    keeperValue: eff.keeper.name,
    otherValue: eff.other.name,
  })

  // Per-Contact conflicts: only Contacts that link BOTH brands.
  const keeperByContact = new Map(
    eff.keeperContacts.map((cb) => [cb.contact_id, cb]),
  )
  for (const ocb of eff.otherContacts) {
    const kcb = keeperByContact.get(ocb.contact_id)
    if (!kcb) continue // loser-only contact → carry-over, no card
    const contact_name = eff.contact_lookup.get(ocb.contact_id)?.name ?? null

    if (kcb.ended_at === null && ocb.ended_at === null) {
      // Both active — surface a role card only when roles differ.
      if (kcb.role !== ocb.role) {
        conflicts.push({
          kind: 'contact_role',
          contact_id: ocb.contact_id,
          contact_name,
          keeperRole: kcb.role,
          otherRole: ocb.role,
        })
      }
    } else if (kcb.ended_at !== null && ocb.ended_at !== null) {
      // Both ended — surface an ended card when the two ending records differ on
      // any axis (date / role / reason). Picking a side adopts it whole.
      if (
        kcb.ended_at !== ocb.ended_at ||
        kcb.role !== ocb.role ||
        kcb.ended_reason !== ocb.ended_reason
      ) {
        conflicts.push({
          kind: 'contact_ended',
          contact_id: ocb.contact_id,
          contact_name,
          keeperRole: kcb.role,
          keeperEndedAt: kcb.ended_at,
          keeperEndedReason: kcb.ended_reason,
          otherRole: ocb.role,
          otherEndedAt: ocb.ended_at,
          otherEndedReason: ocb.ended_reason,
        })
      }
    }
    // Mixed (one active, one ended) → deterministic active-wins; carry-over.
  }

  return conflicts
}

// ============================================================================
// CARRY-OVER ITEMS
// ============================================================================
// "Everything that merges with no decision needed" — Resolve-step reassurance.

function carryOverItems(eff: EffectiveBrandInputs): string[] {
  const items: string[] = []
  const keeperByContact = new Map(
    eff.keeperContacts.map((cb) => [cb.contact_id, cb]),
  )
  const seen = new Set<string>()

  // Contacts that carry without a decision: loser-only, both-active-same-role,
  // and mixed (auto-resolved to active).
  for (const ocb of eff.otherContacts) {
    const name = eff.contact_lookup.get(ocb.contact_id)?.name ?? '(contact)'
    const kcb = keeperByContact.get(ocb.contact_id)
    seen.add(ocb.contact_id)
    if (!kcb) {
      items.push(`${name} · ${ocb.role ?? 'no role'}`)
      continue
    }
    const mixed =
      (kcb.ended_at === null) !== (ocb.ended_at === null)
    const bothActiveSameRole =
      kcb.ended_at === null && ocb.ended_at === null && kcb.role === ocb.role
    if (mixed) {
      const active = kcb.ended_at === null ? kcb : ocb
      items.push(`${name} · kept active (${active.role ?? 'no role'})`)
    } else if (bothActiveSameRole) {
      items.push(`${name} · ${kcb.role ?? 'no role'}`)
    }
    // both-ended-differ + both-active-differ are conflict cards, not carry-over.
  }
  // Keeper-only contacts (stay as-is on the survivor).
  for (const kcb of eff.keeperContacts) {
    if (seen.has(kcb.contact_id)) continue
    const name = eff.contact_lookup.get(kcb.contact_id)?.name ?? '(contact)'
    items.push(`${name} · ${kcb.role ?? 'no role'}`)
  }

  const totalPitches = eff.pitches.length
  if (totalPitches > 0) {
    items.push(
      `All ${totalPitches} pitch${totalPitches === 1 ? '' : 'es'} (history preserved)`,
    )
  }
  const deals = summarizeDeals(eff.pitches)
  if (deals.closed_count > 0) {
    items.push(`Both deal totals · ${dealSummaryAmount(deals)}`)
  }

  return items
}

// ============================================================================
// COMPONENT
// ============================================================================

export function BrandCombineWizard(props: BrandCombineWizardProps) {
  const { inputs, defaultSurvivor, onClose, onCommit } = props
  const onSuccessClose = props.onSuccessClose ?? props.onClose

  // Deferred close so the overlay/card can run exit keyframes (180ms, mirror FR-9).
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

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [keeperIsLeft, setKeeperIsLeft] = useState(defaultSurvivor === 'survivor')

  const eff = useMemo(
    () => deriveEffective(inputs, keeperIsLeft),
    [inputs, keeperIsLeft],
  )

  const [resolutions, setResolutions] = useState<BrandMergeResolutions>(() =>
    computeDefaultBrandResolutions(eff),
  )

  // Re-seed resolutions when the keeper flips (defaults follow the new keeper).
  const [lastKeeperIsLeft, setLastKeeperIsLeft] = useState(keeperIsLeft)
  if (lastKeeperIsLeft !== keeperIsLeft) {
    setLastKeeperIsLeft(keeperIsLeft)
    setResolutions(computeDefaultBrandResolutions(eff))
  }

  // Preview snapshot — computed ONCE on Step-3 entry (v1-trim, FR-9 parity).
  const [previewSnapshot, setPreviewSnapshot] = useState<BrandMergeResult | null>(
    null,
  )

  const [committing, setCommitting] = useState(false)
  const [commitError, setCommitError] = useState<string | null>(null)

  const conflicts = useMemo(() => computeBrandConflicts(eff), [eff])
  const carryItems = useMemo(() => carryOverItems(eff), [eff])

  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      if (ev.key === 'Escape' && !committing && step !== 4) requestClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [committing, step, requestClose])

  const goToStep = useCallback(
    (next: 1 | 2 | 3 | 4) => {
      if (next === 3) {
        setPreviewSnapshot(computeBrandMergeResult(eff, resolutions))
      } else {
        setPreviewSnapshot(null)
      }
      setStep(next)
    },
    [eff, resolutions],
  )

  const setKeeperLeft = useCallback(() => setKeeperIsLeft(true), [])
  const setKeeperRight = useCallback(() => setKeeperIsLeft(false), [])

  // ===== Resolution mutators =====
  function pickName(value: string) {
    setResolutions((r) => ({ ...r, name: value }))
  }
  function pickContactRole(contact_id: string, role: ContactRole | null) {
    setResolutions((r) => {
      const existing: ContactLinkResolution = r.per_contact[contact_id] ?? {
        role: null,
        ended_at: null,
        ended_reason: null,
      }
      return {
        ...r,
        per_contact: { ...r.per_contact, [contact_id]: { ...existing, role } },
      }
    })
  }
  function pickContactEnded(contact_id: string, res: ContactLinkResolution) {
    setResolutions((r) => ({
      ...r,
      per_contact: { ...r.per_contact, [contact_id]: res },
    }))
  }

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

  // ===== pick-state helpers =====
  const isNamePicked = (value: string) => resolutions.name === value
  const isRolePicked = (contact_id: string, role: ContactRole | null) =>
    (resolutions.per_contact[contact_id]?.role ?? null) === role
  const isEndedPicked = (contact_id: string, ended_at: string) =>
    resolutions.per_contact[contact_id]?.ended_at === ended_at

  // Summary-banner counts (cheap; no full compute).
  const contactUnionCount = useMemo(() => {
    const ids = new Set<string>()
    for (const cb of [...eff.keeperContacts, ...eff.otherContacts])
      ids.add(cb.contact_id)
    return ids.size
  }, [eff])
  const combinedDeals = useMemo(() => summarizeDeals(eff.pitches), [eff])

  // ===========================================================================
  // RENDER
  // ===========================================================================

  return (
    <div
      className={`pitch-modal-overlay cw-overlay ${closing ? 'is-closing' : ''}`}
      onClick={(e) => {
        if (e.target === e.currentTarget && !committing && step !== 4)
          requestClose()
      }}
    >
      <div
        className="modal-card cw-card"
        role="dialog"
        aria-modal="true"
        aria-label="Combine Brands"
      >
        <header className="modal-band cw-band">
          <span className="cw-band-l">Combine Brands</span>

          {step < 4 && (
            <nav className="cw-rail" aria-label="Wizard progress">
              {(
                [
                  [1, 'Review'],
                  [2, 'Resolve'],
                  [3, 'Preview'],
                ] as const
              ).map(([n, label], i, arr) => (
                <span
                  key={n}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 14 }}
                >
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

        <div className="cw-body">
          {step === 1 && (
            <div className="cw-step is-on" key="cw-s1">
              <Step1Review
                inputs={inputs}
                keeperIsLeft={keeperIsLeft}
                onPickLeft={setKeeperLeft}
                onPickRight={setKeeperRight}
                conflictsCount={conflicts.length}
                contactUnionCount={contactUnionCount}
                combinedDeals={combinedDeals}
              />
            </div>
          )}
          {step === 2 && (
            <div className="cw-step is-on" key="cw-s2">
              <Step2Resolve
                conflicts={conflicts}
                carryItems={carryItems}
                keeperIsLeft={keeperIsLeft}
                keeperName={eff.keeper.name}
                pickName={pickName}
                pickContactRole={pickContactRole}
                pickContactEnded={pickContactEnded}
                isNamePicked={isNamePicked}
                isRolePicked={isRolePicked}
                isEndedPicked={isEndedPicked}
              />
            </div>
          )}
          {step === 3 && previewSnapshot && (
            <div className="cw-step is-on" key="cw-s3">
              <Step3Preview
                result={previewSnapshot}
                keeperSlug={eff.keeper.slug}
                loserSlug={eff.other.slug}
                loserName={eff.other.name}
                committing={committing}
                commitError={commitError}
                onCombine={onCombine}
              />
            </div>
          )}
          {step === 4 && (
            <div className="cw-step is-on" key="cw-s4">
              <Step4Done
                keeperName={resolutions.name}
                keeperHref={`/app/brands/${eff.keeper.slug || eff.keeper.id}`}
                loserName={eff.other.name}
                loserSlug={eff.other.slug}
                pitchesCount={eff.pitches.length}
                contactsCount={contactUnionCount}
                onSuccessClose={requestSuccessClose}
              />
            </div>
          )}
        </div>

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
                {step === 1 && 'Step 1 of 3 · review both brands'}
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
// Column positions STABLE: inputs.survivor always left, inputs.loser always right
// (FR-9 §1.8 row-paired layout; mobile two-stack via `--cw-row-i` + display:contents).
// Keeper ring / fold-label / merge-arrow follow whichever side is the keeper.

interface Step1Props {
  inputs: BrandMergeInputs
  keeperIsLeft: boolean
  onPickLeft: () => void
  onPickRight: () => void
  conflictsCount: number
  contactUnionCount: number
  combinedDeals: DealSummary
}

const PITCH_PREVIEW_CAP = 3
const CONTACT_PREVIEW_CAP = 4

function Step1Review(p: Step1Props) {
  const left = p.inputs.survivor
  const right = p.inputs.loser
  const leftIsKeeper = p.keeperIsLeft
  const rightIsKeeper = !p.keeperIsLeft

  const leftPitches = p.inputs.pitches.filter((pi) => pi.source === 'survivor')
  const rightPitches = p.inputs.pitches.filter((pi) => pi.source === 'loser')
  const totalPitches = p.inputs.pitches.length
  const keepClass = leftIsKeeper ? 'is-keep-l' : 'is-keep-r'

  // Shared-contact ids (a contact linking both brands) — drives the "N also on
  // <other>" tag on each Contacts cell.
  const leftIds = new Set(p.inputs.survivor_contacts.map((c) => c.contact_id))
  const rightIds = new Set(p.inputs.loser_contacts.map((c) => c.contact_id))
  const sharedCount = [...leftIds].filter((id) => rightIds.has(id)).length

  return (
    <>
      <div className="cw-summary">
        <p className="cw-summary-text">
          You&rsquo;re combining <b>2 Brands</b> into <b>1</b>. Nothing is lost —
          every pitch, deal and contact moves to the keeper.
        </p>
        <div className="cw-summary-chips">
          <span className="cw-chip">{totalPitches} pitches</span>
          <span className="cw-chip">{p.contactUnionCount} contacts</span>
          {p.combinedDeals.closed_count > 0 && (
            <span className="cw-chip">
              {dealSummaryAmount(p.combinedDeals)} closed
            </span>
          )}
          {p.conflictsCount > 0 && (
            <span className="cw-chip is-pick">{p.conflictsCount} to resolve</span>
          )}
        </div>
      </div>

      <div className={`cw-review ${keepClass}`}>
        <div
          className="cw-merge"
          data-direction={leftIsKeeper ? 'left' : 'right'}
          aria-hidden="true"
        >
          →
        </div>

        {/* Row 0 — heads */}
        <div
          className={`cw-row cw-row-head ${keepClass}`}
          style={{ '--cw-row-i': 0 } as React.CSSProperties}
        >
          <ReviewHead brand={left} isKeeper={leftIsKeeper} onPick={p.onPickLeft} />
          <ReviewHead
            brand={right}
            isKeeper={rightIsKeeper}
            onPick={p.onPickRight}
          />
        </div>

        {/* Row 1 — Brand name (always-conflict) */}
        <div
          className={`cw-row ${keepClass}`}
          style={{ '--cw-row-i': 1 } as React.CSSProperties}
        >
          <ReviewCellName value={left.name} isKeeper={leftIsKeeper} />
          <ReviewCellName value={right.name} isKeeper={rightIsKeeper} />
        </div>

        {/* Row 2 — Slug */}
        <div
          className={`cw-row ${keepClass}`}
          style={{ '--cw-row-i': 2 } as React.CSSProperties}
        >
          <ReviewCellSlug slug={left.slug} isKeeper={leftIsKeeper} />
          <ReviewCellSlug slug={right.slug} isKeeper={rightIsKeeper} />
        </div>

        {/* Row 3 — Pitches */}
        <div
          className={`cw-row ${keepClass}`}
          style={{ '--cw-row-i': 3 } as React.CSSProperties}
        >
          <ReviewCellPitches pitches={leftPitches} total={leftPitches.length} />
          <ReviewCellPitches pitches={rightPitches} total={rightPitches.length} />
        </div>

        {/* Row 4 — Contacts */}
        <div
          className={`cw-row ${keepClass}`}
          style={{ '--cw-row-i': 4 } as React.CSSProperties}
        >
          <ReviewCellContacts
            contacts={p.inputs.survivor_contacts}
            contactLookup={p.inputs.contact_lookup}
            sharedCount={sharedCount}
            otherName={right.name}
          />
          <ReviewCellContacts
            contacts={p.inputs.loser_contacts}
            contactLookup={p.inputs.contact_lookup}
            sharedCount={sharedCount}
            otherName={left.name}
          />
        </div>

        {/* Row 5 — Deals closed */}
        <div
          className={`cw-row ${keepClass}`}
          style={{ '--cw-row-i': 5 } as React.CSSProperties}
        >
          <ReviewCellDeals pitches={leftPitches} />
          <ReviewCellDeals pitches={rightPitches} />
        </div>
      </div>
    </>
  )
}

// ----- Row cells ------------------------------------------------------------

function ReviewHead(p: {
  brand: BrandMergeInputs['survivor']
  isKeeper: boolean
  onPick: () => void
}) {
  const initial = (p.brand.name?.[0] ?? '·').toUpperCase()
  return (
    <button type="button" className="cw-col-head" onClick={p.onPick}>
      <span className="cw-col-id">
        <span className="cw-col-avatar">{initial}</span>
        <span className="cw-col-id-body">
          <span className="cw-col-name">{p.brand.name}</span>
          {p.brand.slug && <span className="cw-col-slug">/{p.brand.slug}</span>}
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

function ReviewCellName({
  value,
  isKeeper,
}: {
  value: string
  isKeeper: boolean
}) {
  return (
    <div className="cw-field">
      <span className="cw-field-l">
        Brand name
        <span className="cw-field-l-tag">
          {isKeeper ? 'keeper' : 'differs'}
        </span>
      </span>
      <span className="cw-field-v" style={{ fontWeight: 600, fontSize: 16 }}>
        {value}
      </span>
    </div>
  )
}

function ReviewCellSlug({
  slug,
  isKeeper,
}: {
  slug: string | null
  isKeeper: boolean
}) {
  return (
    <div className="cw-field">
      <span className="cw-field-l">
        Slug · {isKeeper ? 'keeps this URL' : 'redirects after combine'}
      </span>
      <span className="cw-field-v" style={{ fontFamily: 'var(--mono)', fontSize: 12.5 }}>
        {slug ? `/${slug}` : <em style={{ color: 'var(--ink-4)' }}>(no slug)</em>}
      </span>
    </div>
  )
}

function ReviewCellPitches(p: {
  pitches: BrandPitchWithProvenance[]
  total: number
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
            const amount =
              pi.budget_amount != null && pi.budget_currency
                ? formatCurrencyAmount(pi.budget_currency, pi.budget_amount)
                : null
            const summary = pi.ai_summary?.trim() ?? ''
            return (
              <div className="cw-pitchrow" key={pi.id}>
                <span className="cw-pitchrow-d">{shortDate(pi.created_at)}</span>
                <span className="cw-pitchrow-s">
                  {summary ? summary : <em style={{ color: 'var(--ink-4)' }}>(no summary)</em>}
                </span>
                <span className={`cw-pitchrow-a${amount ? '' : ' is-muted'}`}>
                  {amount ?? '—'}
                </span>
              </div>
            )
          })}
          {overflow > 0 && (
            <div className="cw-pitchrow-more">+ {overflow} earlier</div>
          )}
        </div>
      )}
    </div>
  )
}

function ReviewCellContacts(p: {
  contacts: BrandMergeInputs['survivor_contacts']
  contactLookup: BrandMergeInputs['contact_lookup']
  sharedCount: number
  otherName: string
}) {
  // Active links first, then by name; cap + rollup (scale guard).
  const sorted = [...p.contacts].sort((a, b) => {
    const aActive = a.ended_at === null ? 0 : 1
    const bActive = b.ended_at === null ? 0 : 1
    if (aActive !== bActive) return aActive - bActive
    const an = p.contactLookup.get(a.contact_id)?.name ?? ''
    const bn = p.contactLookup.get(b.contact_id)?.name ?? ''
    return an.localeCompare(bn)
  })
  const preview = sorted.slice(0, CONTACT_PREVIEW_CAP)
  const overflow = Math.max(0, p.contacts.length - preview.length)
  return (
    <div className="cw-field">
      <span className="cw-field-l">
        Contacts
        <span className="cw-field-l-tag">{p.contacts.length}</span>
        {p.sharedCount > 0 && (
          <span className="cw-field-l-tag">
            {p.sharedCount} also on {p.otherName}
          </span>
        )}
      </span>
      {preview.length === 0 ? (
        <span style={{ color: 'var(--ink-4)', fontSize: 13 }}>(none)</span>
      ) : (
        <div className="cw-contacts">
          {preview.map((cb) => {
            const name = p.contactLookup.get(cb.contact_id)?.name ?? '(contact)'
            const ended = cb.ended_at !== null
            return (
              <div
                className={`cw-contactline ${ended ? 'is-ended' : ''}`}
                key={cb.contact_id}
              >
                <span className="cw-contactline-name">{name}</span>
                <RolePill role={cb.role} />
                <span className={`cw-state ${ended ? 'is-ended' : ''}`}>
                  {cb.ended_at !== null
                    ? `Ended · ${monthYear(cb.ended_at)}`
                    : 'Current'}
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

function ReviewCellDeals({ pitches }: { pitches: BrandPitchWithProvenance[] }) {
  const summary = summarizeDeals(pitches)
  return (
    <div className="cw-field">
      <span className="cw-field-l">Deals closed</span>
      <span
        className="cw-field-v"
        style={{ fontFamily: 'var(--mono)', fontSize: 12.5 }}
      >
        {dealSummaryText(summary)}
      </span>
    </div>
  )
}

// ============================================================================
// STEP 2 — Resolve
// ============================================================================

interface Step2Props {
  conflicts: BrandConflict[]
  carryItems: string[]
  keeperIsLeft: boolean
  keeperName: string
  pickName: (value: string) => void
  pickContactRole: (contact_id: string, role: ContactRole | null) => void
  pickContactEnded: (contact_id: string, res: ContactLinkResolution) => void
  isNamePicked: (value: string) => boolean
  isRolePicked: (contact_id: string, role: ContactRole | null) => boolean
  isEndedPicked: (contact_id: string, ended_at: string) => boolean
}

function Step2Resolve(p: Step2Props) {
  return (
    <div className="cw-resolve">
      <h2 className="cw-resolve-h">
        {p.conflicts.length}{' '}
        {p.conflicts.length === 1 ? 'thing' : 'things'} to decide
        <span className="dot">.</span>
      </h2>
      <p className="cw-resolve-sub">
        Each is <b>pre-set to a sensible default</b> — your keeper,{' '}
        <b>{p.keeperName}</b>, unless a more recent record wins. Change any you
        want; everything else just carries over.
      </p>

      {p.conflicts.map((c, i) => (
        <ConflictChooser
          key={`${c.kind}-${i}`}
          conflict={c}
          keeperIsLeft={p.keeperIsLeft}
          pickName={p.pickName}
          pickContactRole={p.pickContactRole}
          pickContactEnded={p.pickContactEnded}
          isNamePicked={p.isNamePicked}
          isRolePicked={p.isRolePicked}
          isEndedPicked={p.isEndedPicked}
        />
      ))}

      {p.carryItems.length > 0 && (
        <div className="cw-carry">
          <span className="cw-carry-h">
            Carries over automatically · no decision needed
          </span>
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
  conflict: BrandConflict
  keeperIsLeft: boolean
  pickName: (value: string) => void
  pickContactRole: (contact_id: string, role: ContactRole | null) => void
  pickContactEnded: (contact_id: string, res: ContactLinkResolution) => void
  isNamePicked: (value: string) => boolean
  isRolePicked: (contact_id: string, role: ContactRole | null) => boolean
  isEndedPicked: (contact_id: string, ended_at: string) => boolean
}

const KEEPER_LABEL = 'Keeper'
const DUP_LABEL = 'Duplicate'

function ConflictChooser(p: ConflictChooserProps) {
  const c = p.conflict
  const leftIsKeeper = p.keeperIsLeft
  const rightIsKeeper = !p.keeperIsLeft

  if (c.kind === 'name') {
    const leftValue = leftIsKeeper ? c.keeperValue : c.otherValue
    const rightValue = leftIsKeeper ? c.otherValue : c.keeperValue
    return (
      <div className="cw-conflict">
        <div className="cw-conflict-l">
          <span className="cw-conflict-title">Brand name</span>
          <span className="cw-conflict-why">
            Two brands can never share a name, so this is always a choice. The
            keeper holds the history; the duplicate often holds the cleaner
            spelling.
          </span>
        </div>
        <div className="cw-choices">
          <ChooserCard
            isSelected={p.isNamePicked(leftValue)}
            isPreset={leftIsKeeper}
            who={leftIsKeeper ? KEEPER_LABEL : DUP_LABEL}
            value={leftValue}
            onClick={() => p.pickName(leftValue)}
          />
          <ChooserCard
            isSelected={p.isNamePicked(rightValue)}
            isPreset={rightIsKeeper}
            who={rightIsKeeper ? KEEPER_LABEL : DUP_LABEL}
            value={rightValue}
            onClick={() => p.pickName(rightValue)}
          />
        </div>
      </div>
    )
  }

  if (c.kind === 'contact_role') {
    const leftRole = leftIsKeeper ? c.keeperRole : c.otherRole
    const rightRole = leftIsKeeper ? c.otherRole : c.keeperRole
    return (
      <div className="cw-conflict is-contact">
        <div className="cw-conflict-l">
          <span className="cw-conflict-title">
            {c.contact_name ?? '(contact)'} · role
          </span>
          <span className="cw-conflict-why">
            Linked to both brands with a different role. Pick the one that&rsquo;s
            true now, or leave the keeper&rsquo;s.
          </span>
        </div>
        <div className="cw-choices">
          <ChooserCard
            isSelected={p.isRolePicked(c.contact_id, leftRole)}
            isPreset={leftIsKeeper}
            who={leftIsKeeper ? KEEPER_LABEL : DUP_LABEL}
            valueNode={<RolePill role={leftRole} />}
            onClick={() => p.pickContactRole(c.contact_id, leftRole)}
          />
          <ChooserCard
            isSelected={p.isRolePicked(c.contact_id, rightRole)}
            isPreset={rightIsKeeper}
            who={rightIsKeeper ? KEEPER_LABEL : DUP_LABEL}
            valueNode={<RolePill role={rightRole} />}
            onClick={() => p.pickContactRole(c.contact_id, rightRole)}
          />
        </div>
      </div>
    )
  }

  // contact_ended — picking a side adopts {role, ended_at, ended_reason} whole.
  const keeperRes: ContactLinkResolution = {
    role: c.keeperRole,
    ended_at: c.keeperEndedAt,
    ended_reason: c.keeperEndedReason,
  }
  const otherRes: ContactLinkResolution = {
    role: c.otherRole,
    ended_at: c.otherEndedAt,
    ended_reason: c.otherEndedReason,
  }
  // Most-recent side is the default; flag it so the chip reads "most recent".
  const otherIsMostRecent = c.otherEndedAt > c.keeperEndedAt
  const leftRes = leftIsKeeper ? keeperRes : otherRes
  const rightRes = leftIsKeeper ? otherRes : keeperRes
  // ended_at is non-null by construction (contact_ended is only built for
  // both-ended links) — thread the known-string values to avoid a force-unwrap.
  const leftEndedAt = leftIsKeeper ? c.keeperEndedAt : c.otherEndedAt
  const rightEndedAt = leftIsKeeper ? c.otherEndedAt : c.keeperEndedAt
  const leftMostRecent = leftIsKeeper ? !otherIsMostRecent : otherIsMostRecent
  return (
    <div className="cw-conflict is-contact">
      <div className="cw-conflict-l">
        <span className="cw-conflict-title">
          {c.contact_name ?? '(contact)'} · ended
        </span>
        <span className="cw-conflict-why">
          This link is ended on both brands. Defaults to the most recent ending —
          change it if the earlier one is right.
        </span>
      </div>
      <div className="cw-choices">
        <EndedChooserCard
          res={leftRes}
          endedAt={leftEndedAt}
          isSelected={p.isEndedPicked(c.contact_id, leftEndedAt)}
          isPreset={leftIsKeeper}
          isMostRecent={leftMostRecent}
          who={leftIsKeeper ? KEEPER_LABEL : DUP_LABEL}
          onClick={() => p.pickContactEnded(c.contact_id, leftRes)}
        />
        <EndedChooserCard
          res={rightRes}
          endedAt={rightEndedAt}
          isSelected={p.isEndedPicked(c.contact_id, rightEndedAt)}
          isPreset={rightIsKeeper}
          isMostRecent={!leftMostRecent}
          who={rightIsKeeper ? KEEPER_LABEL : DUP_LABEL}
          onClick={() => p.pickContactEnded(c.contact_id, rightRes)}
        />
      </div>
    </div>
  )
}

interface ChooserCardProps {
  isSelected: boolean
  isPreset?: boolean
  who: string
  value?: string
  valueNode?: React.ReactNode
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
        <span className="cw-choice-v">{p.valueNode ?? p.value}</span>
      </span>
    </button>
  )
}

// Ended-chooser variant — the value is a date + role + reason triple. `endedAt`
// is threaded as a known-non-null string (the conflict is only built for
// both-ended links).
function EndedChooserCard(p: {
  res: ContactLinkResolution
  endedAt: string
  isSelected: boolean
  isPreset?: boolean
  isMostRecent: boolean
  who: string
  onClick: () => void
}) {
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
          {!p.isPreset && p.isMostRecent && (
            <span className="cw-choice-who-preset">· most recent</span>
          )}
        </span>
        <span className="cw-choice-v" style={{ fontFamily: 'var(--mono)', fontSize: 13 }}>
          Ended {monthYear(p.endedAt)}
        </span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-4)' }}>
          {p.res.role ?? 'no role'}
          {p.res.ended_reason ? ` · ${p.res.ended_reason}` : ''}
        </span>
      </span>
    </button>
  )
}

// ============================================================================
// STEP 3 — Preview
// ============================================================================

interface Step3Props {
  result: BrandMergeResult
  keeperSlug: string | null
  loserSlug: string | null
  loserName: string
  committing: boolean
  commitError: string | null
  onCombine: () => void
}

const CONTACT_ROW_CAP = 10
const PITCH_HISTORY_CAP = 12

function Step3Preview(p: Step3Props) {
  const { preview } = p.result
  const initial = (preview.name?.[0] ?? '·').toUpperCase()
  const deals = preview.deal_summary

  return (
    <>
      <div className="cw-preview-banner">
        Preview · this is the one brand you&rsquo;ll be left with
      </div>

      <div className="cw-result">
        <div className="cw-result-head">
          <span className="cw-result-avatar">{initial}</span>
          <div className="cw-result-id">
            <h2 className="cw-result-h1">{preview.name}</h2>
            <div className="cw-result-meta">
              {preview.slug && <span>/app/brands/{preview.slug}</span>}
              <span>{preview.pitch_history.length} pitches</span>
              <span>{preview.contact_links.length} contacts</span>
            </div>
            {p.loserSlug && (
              <span className="cw-result-slugnote">
                The old <code>/{p.loserSlug}</code> keeps working — it redirects
                here.
              </span>
            )}
          </div>
        </div>

        {/* Combined totals */}
        <div className="cw-result-block">
          <span className="cw-result-block-h">Combined totals</span>
          <div className="cw-result-stats">
            <div className="cw-result-stat">
              <span className="cw-rstat-n">[01]</span>
              <span className="cw-rstat-v">{preview.pitch_history.length}</span>
              <span className="cw-rstat-l">Pitches</span>
            </div>
            <div className="cw-result-stat">
              <span className="cw-rstat-v is-accent">
                {deals.closed_totals.length > 0
                  ? dealSummaryAmount(deals)
                  : '—'}
              </span>
              <span className="cw-rstat-l">
                Closed · {deals.closed_count} deal
                {deals.closed_count === 1 ? '' : 's'}
              </span>
            </div>
            <div className="cw-result-stat">
              <span className="cw-rstat-n">[03]</span>
              <span className="cw-rstat-v">{preview.contact_links.length}</span>
              <span className="cw-rstat-l">Contacts</span>
            </div>
          </div>
        </div>

        {/* Consolidated contacts */}
        {preview.contact_links.length > 0 && (
          <div className="cw-result-block">
            <span className="cw-result-block-h">
              Contacts
              <span className="cw-result-block-h-tag">deduped &amp; resolved</span>
            </span>
            <div className="cw-result-contacts">
              {preview.contact_links.slice(0, CONTACT_ROW_CAP).map((cl) => {
                const ended = cl.ended_at !== null
                return (
                  <div
                    key={cl.contact_id}
                    className={`cw-crow ${cl.provenance === 'loser' ? 'is-from-dup' : ''} ${ended ? 'is-ended' : ''}`}
                  >
                    <span className="cw-crow-name">
                      {cl.contact_name ?? '(contact)'}
                      {cl.provenance === 'loser' && (
                        <span className="cw-crow-origin">from {p.loserName}</span>
                      )}
                    </span>
                    <RolePill role={cl.role} />
                    <span className={`cw-state ${ended ? 'is-ended' : ''}`}>
                      {cl.ended_at !== null
                        ? `Ended · ${monthYear(cl.ended_at)}`
                        : 'Current'}
                    </span>
                  </div>
                )
              })}
              {preview.contact_links.length > CONTACT_ROW_CAP && (
                <div className="cw-crow" style={{ color: 'var(--ink-4)' }}>
                  <span className="cw-crow-name">
                    + {preview.contact_links.length - CONTACT_ROW_CAP} more
                    contacts on the merged brand
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Woven pitch history */}
        {preview.pitch_history.length > 0 && (
          <div className="cw-result-block">
            <span className="cw-result-block-h">
              Pitch history
              <span className="cw-result-block-h-tag">woven by date</span>
            </span>
            <div className="cw-history">
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
                        {ph.summary ? (
                          <b>{ph.summary}</b>
                        ) : (
                          <b>(no summary)</b>
                        )}
                      </span>
                      {ph.from_loser && (
                        <span className="cw-from-tag">from {p.loserName}</span>
                      )}
                    </span>
                    <span className="cw-history-stage">
                      {ph.stage ? (
                        <StageChip stage={ph.stage} direction={ph.direction} />
                      ) : (
                        <span className="cw-history-nodeal">No deal</span>
                      )}
                    </span>
                    <span className={`cw-history-a${amount ? '' : ' is-muted'}`}>
                      {amount ?? '—'}
                    </span>
                  </div>
                )
              })}
              {preview.pitch_history.length > PITCH_HISTORY_CAP && (
                <div className="cw-history-more">
                  + {preview.pitch_history.length - PITCH_HISTORY_CAP} more pitch
                  {preview.pitch_history.length - PITCH_HISTORY_CAP === 1
                    ? ''
                    : 'es'}{' '}
                  on the merged history
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="cw-confirm">
        <div className="cw-confirm-text">
          <span className="cw-confirm-dest">
            Combine into <span className="cw-confirm-name">{preview.name}</span>
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

function Step4Done(p: {
  keeperName: string
  keeperHref: string
  loserName: string
  loserSlug: string | null
  pitchesCount: number
  contactsCount: number
  onSuccessClose: () => void
}) {
  return (
    <div className="cw-done">
      <span className="cw-done-stamp">✓ Combined</span>
      <h2 className="cw-done-h1">One {p.keeperName}.</h2>
      <p className="cw-done-body">
        <b>{p.pitchesCount}</b> pitches and <b>{p.contactsCount}</b> contacts now
        sit on a single brand.
        {p.loserSlug && (
          <>
            {' '}
            <b>{p.loserName}</b> is gone; <code>/{p.loserSlug}</code> redirects to
            the keeper.
          </>
        )}
      </p>
      <Link
        href={p.keeperHref}
        className="btn-pill"
        onClick={(e) => {
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
// SHARED BITS
// ============================================================================

function RolePill({ role }: { role: ContactRole | null }) {
  if (!role) {
    return <span className="ctc-role is-empty">No role</span>
  }
  return <span className={`ctc-role ${ROLE_CLASS[role]}`}>{role}</span>
}

// "N closed · $X total" / "N closed" (no amounts) / "No closed deals".
function dealSummaryText(s: DealSummary): string {
  if (s.closed_count === 0) return 'No closed deals'
  const head = `${s.closed_count} closed`
  if (s.closed_totals.length === 0) return head
  return `${head} · ${dealSummaryAmount(s)} total`
}

// Dominant-currency formatted total, with a "+N" suffix when several currencies
// are present (a solo creator is usually single-currency).
function dealSummaryAmount(s: DealSummary): string {
  if (s.closed_totals.length === 0) return '—'
  const primary = s.closed_totals[0]
  const str = formatCurrencyAmount(primary.currency, primary.amount)
  return s.closed_totals.length > 1 ? `${str} +${s.closed_totals.length - 1}` : str
}

function monthYear(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

function shortDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    .toUpperCase()
}
