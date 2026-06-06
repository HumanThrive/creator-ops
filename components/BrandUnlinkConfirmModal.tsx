'use client'

import { useEffect } from 'react'

// FR-11 #92 (design Ask 06 Outcome 2) — contact-unlink confirm. A 0-pitch brand
// can still hold contact associations (standalone-created + linked, no pitch
// yet); deleting it CASCADEs those contact_brands rows. This calm confirm names
// the cost before commit. Mirror of DeleteConfirmModal + a change-block listing
// the affected contacts (capped 5 + "+N more"). Warn-outline button, not alarm.

export interface AffectedContact {
  name: string
  role: string | null
}

interface BrandUnlinkConfirmModalProps {
  brandName: string
  contactLinkCount: number
  affected: AffectedContact[] // capped at 6 from the route
  onCancel: () => void
  onConfirm: () => void
}

export function BrandUnlinkConfirmModal({
  brandName,
  contactLinkCount,
  affected,
  onCancel,
  onConfirm,
}: BrandUnlinkConfirmModalProps) {
  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      if (ev.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel])

  const shown = affected.slice(0, 5)
  const moreCount = contactLinkCount - shown.length

  return (
    <div
      className="pitch-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <div className="modal-card brand-unlink-confirm" role="dialog" aria-modal="true">
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
            {brandName} has <b>no pitches</b>, so there&rsquo;s no deal history to
            lose. But it&rsquo;s linked to{' '}
            <b>
              {contactLinkCount} {contactLinkCount === 1 ? 'contact' : 'contacts'}
            </b>{' '}
            — deleting it also unlinks them from this brand.
          </p>
          <div className="change-block">
            <span className="change-block-h">What this changes</span>
            {shown.map((c, i) => (
              <span key={i} className="change-row">
                <b>{c.name}</b>
                {c.role ? ` · ${c.role}` : ''} — loses their {brandName} link
              </span>
            ))}
            {moreCount > 0 ? (
              <span className="change-row">
                + {moreCount} more {moreCount === 1 ? 'contact' : 'contacts'}
              </span>
            ) : null}
          </div>
          <p className="modal-p" style={{ color: 'var(--ink-3)' }}>
            The contacts themselves stay — only their link to {brandName} goes.
          </p>
        </div>
        <footer className="modal-foot">
          <span className="modal-foot-help">This can&rsquo;t be undone</span>
          <span style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}>
            <button type="button" className="row-action-pill" onClick={onCancel}>
              Cancel
            </button>
            <button type="button" className="btn-pill is-warn" onClick={onConfirm}>
              Delete &amp; unlink {contactLinkCount}
            </button>
          </span>
        </footer>
      </div>
    </div>
  )
}
