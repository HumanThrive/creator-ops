'use client'

import { useState } from 'react'
import { BrandCombineStub } from '@/components/BrandCombineStub'

// FR-11 #90/#91 (design Ask 05) — duplicate-name callout. Reuses FR-8's shipped
// dup-email-callout chrome, brand-voiced. Surfaces on a case-insensitive name
// collision (validate on save, not on blur). The one path — "Combine into
// ⟨Brand⟩" — opens the Combine "coming soon" stub (FR-10 isn't built); "Use a
// different name" dismisses. Reused by both create (NewBrandModal) and rename
// (BrandNameEditor) collisions.

export interface ExistingBrand {
  id: string // '' when the route couldn't re-fetch the colliding row
  name: string
  slug: string | null
}

interface DupBrandCalloutProps {
  attemptedName: string
  existing: ExistingBrand
  onDismiss: () => void
}

export function DupBrandCallout({
  attemptedName,
  existing,
  onDismiss,
}: DupBrandCalloutProps) {
  const [stubOpen, setStubOpen] = useState(false)
  const existingName = existing.name || attemptedName

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
            onClick={() => setStubOpen(true)}
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
      {stubOpen ? (
        <BrandCombineStub existing={existing} onClose={() => setStubOpen(false)} />
      ) : null}
    </>
  )
}
