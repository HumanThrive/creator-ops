'use client'

import { useState } from 'react'
import {
  BrandCombineLauncher,
  type BrandCombineSeed,
} from '@/components/BrandCombineLauncher'

// FR-11 #90/#91 (design Ask 05) — duplicate-name callout. Reuses FR-8's shipped
// dup-email-callout chrome, brand-voiced. Surfaces on a case-insensitive name
// collision (validate on save, not on blur). The one path — "Combine into
// ⟨Brand⟩" — opens the real Brand Combine wizard (FR-10); "Use a different name"
// dismisses. Reused by both create (NewBrandModal) and rename (BrandNameEditor)
// collisions, distinguished by `selfBrandId`.

export interface ExistingBrand {
  id: string // '' when the route couldn't re-fetch the colliding row
  name: string
  slug: string | null
}

interface DupBrandCalloutProps {
  attemptedName: string
  existing: ExistingBrand
  onDismiss: () => void
  // FR-10: present only on the RENAME collision — the id of the brand being
  // renamed. Both rows exist, so Combine seeds the pair directly (survivor =
  // the existing name-owner, loser = this self brand · AC1.1). Absent on the
  // CREATE collision (no self row yet) → Combine opens with the existing brand
  // pre-loaded as the survivor + a typeahead for the dupe to fold in (AC1.3).
  selfBrandId?: string
}

export function DupBrandCallout({
  attemptedName,
  existing,
  onDismiss,
  selfBrandId,
}: DupBrandCalloutProps) {
  const [launcherOpen, setLauncherOpen] = useState(false)
  const existingName = existing.name || attemptedName
  // Combine needs a real colliding-row id to seed against.
  const canCombine = existing.id !== ''
  const seed: BrandCombineSeed | null = !canCombine
    ? null
    : selfBrandId
      ? { mode: 'pair', survivorId: existing.id, loserId: selfBrandId }
      : {
          mode: 'pick',
          knownId: existing.id,
          knownName: existingName,
          knownRole: 'survivor',
        }

  return (
    <>
      <div className="dup-email-callout" role="alert">
        <div className="dup-email-callout-head">
          <span className="dup-email-callout-kicker">
            You already have this brand
          </span>
          <button
            type="button"
            className="dup-email-callout-close"
            onClick={onDismiss}
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
        <p className="dup-email-callout-p">
          A brand named <b>{existingName}</b> is already on your board. Creating a
          second would split its history in two.
        </p>
        <div className="dup-email-callout-actions">
          <button
            type="button"
            className="btn-pill"
            onClick={() => setLauncherOpen(true)}
            disabled={!canCombine}
          >
            Combine into {existingName}
          </button>
          <button
            type="button"
            className="row-action-pill"
            onClick={onDismiss}
          >
            Use a different name
          </button>
        </div>
        <span className="dup-email-callout-sub">
          Save blocked · name already in use
        </span>
      </div>
      {launcherOpen && seed ? (
        <BrandCombineLauncher seed={seed} onClose={() => setLauncherOpen(false)} />
      ) : null}
    </>
  )
}
