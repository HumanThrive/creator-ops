'use client'

import { useEffect } from 'react'

// FR-8 #78/#79 — placeholder for the future FR-9 Contact merge flow.
// Per Founder ratified default 2026-05-31 11:06: simple modal "Merge coming
// in FR-9" + Close. Path-card CTAs from DeleteBlockedModal + DupEmailCallout
// both open this stub in FR-8 v1.

interface FR9PlaceholderModalProps {
  onClose: () => void
}

export function FR9PlaceholderModal({ onClose }: FR9PlaceholderModalProps) {
  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      if (ev.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="pitch-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="modal-card fr9-placeholder" role="dialog" aria-modal="true">
        <header className="modal-band">
          <span className="modal-band-l">Merge contacts</span>
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
            Merge coming in FR-9<span className="dot">.</span>
          </h2>
          <p className="modal-p">
            Combining two Contacts into one — channels, pitches, brand-links —
            is its own surface. We&rsquo;re building it next so the dedupe path
            doesn&rsquo;t hide behind a destructive button.
          </p>
          <p className="modal-p" style={{ color: 'var(--ink-3)' }}>
            Until then: end the brand link from the popover, or use a different
            Primary Email if you&rsquo;re dodging a collision.
          </p>
        </div>
        <footer className="modal-foot">
          <span className="modal-foot-help">Coming next</span>
          <button type="button" className="btn-pill" onClick={onClose}>
            Close
          </button>
        </footer>
      </div>
    </div>
  )
}
