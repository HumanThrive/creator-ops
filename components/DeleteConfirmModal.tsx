'use client'

import { useEffect } from 'react'

// FR-8 S4 — confirm gate for the "⌫ Delete contact" affordance on Contact-
// detail. Founder smoke 2D.2 2026-06-01: every Delete click must interpose a
// confirmation that names the irreversibility. The modal fires uniformly
// (zero-history and history-bearing); for history-bearing contacts the
// subsequent API call returns 409 and DeleteBlockedModal swaps in.
//
// Voice-ladder discipline: brand-stance refusal in DeleteBlockedModal is for
// the blocked path. THIS modal is the destructive-confirm for the genuinely-
// deletable path — calm but explicit. "This cannot be undone." is the spec
// line; do not soften.

interface DeleteConfirmModalProps {
  contactName: string
  onCancel: () => void
  onConfirm: () => void
}

export function DeleteConfirmModal({
  contactName,
  onCancel,
  onConfirm,
}: DeleteConfirmModalProps) {
  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      if (ev.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div
      className="pitch-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <div
        className="modal-card delete-confirm-modal"
        role="dialog"
        aria-modal="true"
      >
        <header className="modal-band">
          <span className="modal-band-l">Delete contact</span>
          <button
            type="button"
            className="pitch-modal-close"
            onClick={onCancel}
            aria-label="Close"
          >
            ✕
          </button>
        </header>
        <div className="modal-body">
          <h2 className="modal-h">
            Delete {contactName}<span className="dot">?</span>
          </h2>
          <p className="modal-p">
            Removing this Contact deletes their record from your CRM.{' '}
            <b>This action cannot be undone.</b>
          </p>
          <p className="modal-p" style={{ color: 'var(--ink-3)' }}>
            If {contactName} is still anchoring pitches or brand-links,
            we&rsquo;ll surface the safer paths (Combine, End a Brand link)
            before anything is removed.
          </p>
        </div>
        <footer className="modal-foot">
          <span className="modal-foot-help">Irreversible</span>
          <span style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}>
            <button
              type="button"
              className="row-action-pill"
              onClick={onCancel}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn-pill is-warn"
              onClick={onConfirm}
            >
              Delete contact
            </button>
          </span>
        </footer>
      </div>
    </div>
  )
}
