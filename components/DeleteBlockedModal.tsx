'use client'

import { useEffect, useState } from 'react'
import { FR9PlaceholderModal } from '@/components/FR9PlaceholderModal'

// FR-8 S4 (slice #78) — DeleteBlockedModal per spec Delta 5.
// INFORMATIONAL modal — NOT a destructive-confirm. Renders when delete is
// blocked-if-linked (pitch_count > 0). Carries the brand-stance voice ladder:
//   - Kicker: 'Can't delete · history is attached'
//   - Display H1 names the anchor concretely (count → "Sarah Chen has N pitches…")
//   - Body explains what's anchoring + frames refusal as brand stance
//   - Two equal-weight path-cards: Combine duplicates (recommended) + End Brand link
//   - Footer slug: "SupaSpike doesn't delete history. By design."
//   - NO force-delete escape hatch — only Cancel + the two paths.
//
// v1-trim per task #78: pitch-count text only (no per-row pitch detail).

interface DeleteBlockedModalProps {
  contactName: string
  pitchCount: number
  brandCount: number
  onClose: () => void
}

export function DeleteBlockedModal({
  contactName,
  pitchCount,
  brandCount,
  onClose,
}: DeleteBlockedModalProps) {
  const [fr9Open, setFr9Open] = useState(false)

  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      if (ev.key === 'Escape' && !fr9Open) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, fr9Open])

  return (
    <>
      <div
        className="pitch-modal-overlay"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose()
        }}
      >
        <div
          className="modal-card delete-blocked-modal"
          role="dialog"
          aria-modal="true"
        >
          <header className="modal-band">
            <span className="modal-band-l">
              Can&rsquo;t delete · history is attached
            </span>
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
              {contactName} has{' '}
              <span style={{ color: 'var(--accent)' }}>
                {pitchCount} {pitchCount === 1 ? 'pitch' : 'pitches'}
              </span>{' '}
              on the record<span className="dot">.</span>
            </h2>

            <p className="modal-p">
              <b>SupaSpike won&rsquo;t do that.</b> Deleting the Contact would
              break the link back to every pitch they were on — and the
              relationship history is the thing the CRM is here to remember.
            </p>

            <div className="modal-block">
              <span className="modal-block-h">What&rsquo;s anchoring them</span>
              <ul className="modal-block-list">
                <li>
                  <b>
                    {pitchCount} {pitchCount === 1 ? 'pitch' : 'pitches'}
                  </b>{' '}
                  on the record — each one references this Contact via the
                  pitch ↔ contact pivot.
                </li>
                {brandCount > 0 ? (
                  <li>
                    <b>
                      {brandCount}{' '}
                      {brandCount === 1 ? 'active brand link' : 'active brand links'}
                    </b>{' '}
                    on the directory — each tells &ldquo;who at which brand&rdquo;
                    for future inbound.
                  </li>
                ) : null}
              </ul>
            </div>

            <span className="modal-block-h" style={{ marginTop: 6 }}>
              Two ways forward
            </span>
            <div className="path-cards">
              <button
                type="button"
                className="path-card is-recommended"
                onClick={() => setFr9Open(true)}
              >
                <span className="path-card-tag">Recommended</span>
                <span className="path-card-h">Combine duplicates</span>
                <span className="path-card-p">
                  If {contactName} is a typo or split-record, merge them into
                  the canonical Contact. Pitches and brand-links re-point;
                  nothing destroyed.
                </span>
                <span className="path-card-cta">Open merge →</span>
              </button>
              <button
                type="button"
                className="path-card"
                onClick={onClose}
              >
                <span className="path-card-h">End a Brand link</span>
                <span className="path-card-p">
                  If a single brand-association is the issue, end that link
                  from the Brand card&rsquo;s role popover. Pitches stay; the
                  link moves to <em>ended</em>.
                </span>
                <span className="path-card-cta">Back to the page →</span>
              </button>
            </div>
          </div>

          <footer className="modal-foot">
            <span className="modal-foot-help">
              SupaSpike doesn&rsquo;t delete history. By design.
            </span>
            <button type="button" className="row-action-pill" onClick={onClose}>
              Cancel
            </button>
          </footer>
        </div>
      </div>
      {fr9Open ? <FR9PlaceholderModal onClose={() => setFr9Open(false)} /> : null}
    </>
  )
}
