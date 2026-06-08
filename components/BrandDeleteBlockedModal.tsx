'use client'

import { useEffect, useState } from 'react'
import { BrandCombineStub } from '@/components/BrandCombineStub'
import type { ExistingBrand } from '@/components/DupBrandCallout'

// FR-11 #92 (design Ask 06 Outcome 1) — informational blocked-delete modal for a
// brand with linked pitch history. Mirror of FR-8's DeleteBlockedModal PathsBody
// (the SIMPLE version — no FR-9 picker / body-swap): names the anchor, lists ≤3
// pitches, offers two path-cards (Combine duplicates → stub · Keep it as a
// relationship → dismiss), Cancel only. No force-delete escape hatch. Reuses the
// shipped .modal-block / .path-cards / .path-card chrome.

export interface BlockedPitchRow {
  id: string
  date: string
  summary: string
  amount: string | null
}

interface BrandDeleteBlockedModalProps {
  brandName: string
  pitchCount: number
  recentPitches: BlockedPitchRow[] // ≤3
  existing: ExistingBrand // this brand — powers the Combine stub
  onClose: () => void
}

export function BrandDeleteBlockedModal({
  brandName,
  pitchCount,
  recentPitches,
  existing,
  onClose,
}: BrandDeleteBlockedModalProps) {
  const [combineOpen, setCombineOpen] = useState(false)

  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      if (ev.key === 'Escape' && !combineOpen) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, combineOpen])

  const moreCount = pitchCount - recentPitches.length

  return (
    <>
      <div
        className="pitch-modal-overlay"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose()
        }}
      >
        <div className="modal-card delete-blocked-modal" role="dialog" aria-modal="true">
          <header className="modal-band">
            <span className="modal-band-l">Can&rsquo;t delete · history is attached</span>
            <button
              type="button"
              className="pitch-modal-close"
              onClick={onClose}
              aria-label="Close"
            >
              ✕
            </button>
          </header>
          <div className="modal-body">
            <h2 className="modal-h">
              {brandName} has{' '}
              <span style={{ color: 'var(--accent)' }}>
                {pitchCount} {pitchCount === 1 ? 'pitch' : 'pitches'}
              </span>{' '}
              on its record<span className="dot">.</span>
            </h2>

            <p className="modal-p">
              <b>SupaSpike won&rsquo;t do that.</b> Deleting {brandName} would
              orphan every pitch on its record — and the relationship history is
              the thing the CRM is here to remember.
            </p>

            {recentPitches.length > 0 ? (
              <div className="modal-block">
                <span className="modal-block-h">What&rsquo;s anchoring it</span>
                <ul className="modal-block-list">
                  {recentPitches.map((p) => (
                    <li key={p.id}>
                      <b>{p.date}</b> — {p.summary}
                      {p.amount ? ` · ${p.amount}` : ''}
                    </li>
                  ))}
                  {moreCount > 0 ? (
                    <li>
                      + {moreCount} more {moreCount === 1 ? 'pitch' : 'pitches'}
                    </li>
                  ) : null}
                </ul>
              </div>
            ) : null}

            <span className="modal-block-h" style={{ marginTop: 6 }}>
              Two ways forward
            </span>
            <div className="path-cards">
              <button
                type="button"
                className="path-card is-recommended"
                onClick={() => setCombineOpen(true)}
              >
                <span className="path-card-tag">Recommended</span>
                <span className="path-card-h">Combine duplicates</span>
                <span className="path-card-p">
                  If {brandName} is a duplicate of another brand, merge them —
                  pitches re-point to the keeper, nothing destroyed.
                </span>
                <span className="path-card-cta">Open merge →</span>
              </button>
              <button type="button" className="path-card" onClick={onClose}>
                <span className="path-card-h">Keep it as a relationship</span>
                <span className="path-card-p">
                  A closed-deal brand is an asset, not clutter. Leaving it costs
                  nothing — it just sits in your history.
                </span>
                <span className="path-card-cta">Keep {brandName} →</span>
              </button>
            </div>

            <div className="blocked-card-foot modal-foot">
              <span className="modal-foot-help">
                SupaSpike doesn&rsquo;t delete history. By design.
              </span>
              <button type="button" className="row-action-pill" onClick={onClose}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>

      {combineOpen ? (
        <BrandCombineStub existing={existing} onClose={() => setCombineOpen(false)} />
      ) : null}
    </>
  )
}
