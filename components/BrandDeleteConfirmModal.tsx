'use client'

import { useEffect } from 'react'

// FR-11 #92 (Founder smoke #93 2026-06-07) — accidental-click guard on the clean
// brand delete (0 pitches, 0 contacts). Mirrors FR-8's DeleteConfirmModal (every
// Delete click interposes a confirm — FR-8 smoke 2D.2), but the copy is
// undo-aware on purpose: brand clean-delete KEEPS the 5s optimistic-defer Undo
// toast, so this is NOT "cannot be undone." The confirm prevents the misclick;
// the toast is the actual reversibility. Reuses the .modal-* / delete-confirm-
// modal chrome — no new CSS.

interface BrandDeleteConfirmModalProps {
  brandName: string
  onCancel: () => void
  onConfirm: () => void
}

export function BrandDeleteConfirmModal({
  brandName,
  onCancel,
  onConfirm,
}: BrandDeleteConfirmModalProps) {
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
          <span className="modal-band-l">Delete brand</span>
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
            Delete {brandName}<span className="dot">?</span>
          </h2>
          <p className="modal-p">
            {brandName} has no pitches or contacts yet — nothing to lose. After
            you confirm, you&rsquo;ll have a few seconds to undo from the brands
            list.
          </p>
        </div>
        <footer className="modal-foot">
          <span className="modal-foot-help">Undo available for 5s</span>
          <span style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}>
            <button type="button" className="row-action-pill" onClick={onCancel}>
              Cancel
            </button>
            <button type="button" className="btn-pill is-warn" onClick={onConfirm}>
              Delete brand
            </button>
          </span>
        </footer>
      </div>
    </div>
  )
}
