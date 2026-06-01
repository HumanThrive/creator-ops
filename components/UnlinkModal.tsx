'use client'

import { useEffect, useState } from 'react'

// FR-8 S5 (slice #76) — UnlinkModal per spec Delta 4.
// One modal shape, branched copy by pitch-count.
//
// Branch A (≥1 pitch — "End relationship (kept as past)"):
//   - Display H1, body naming the closed total
//   - "What will change" block listing 3 literal downstream effects
//   - Optional reason field (surfaces in audit log placeholder; ended_reason col)
//   - Primary `End relationship` warn-pill button (accent-outlined)
//   - Reversible — sets ended_at + ended_reason; keeps everything
//
// Branch B (0 pitches — "Remove the link"):
//   - Body says no pitches tied
//   - "If you change your mind" hint replaces the change-list
//   - No reason field
//   - Primary `Remove the link` button (plain)
//   - Hard-DELETEs the pivot row
//
// Founder Q3 lock: popover's "Unlink from Brand" shortcut ALWAYS opens this
// modal (Option A) — same surface, reason-capture available for every path,
// "What will change" block always reaches the user for ≥1-pitch paths.

interface UnlinkModalProps {
  contactId: string
  brandId: string
  brandName: string
  contactName: string
  pitchCountForPair: number  // drives the branch; >=1 = soft, 0 = hard
  closedDealCount?: number
  closedDealAmountDisplay?: string | null
  onClose: () => void
  onUnlinked: (result: { result: 'soft' | 'hard'; ended_at?: string | null }) => void
}

export function UnlinkModal({
  contactId,
  brandId,
  brandName,
  contactName,
  pitchCountForPair,
  closedDealCount = 0,
  closedDealAmountDisplay = null,
  onClose,
  onUnlinked,
}: UnlinkModalProps) {
  const isSoft = pitchCountForPair >= 1
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ESC closes; outside-click closes (handled in JSX overlay)
  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      if (ev.key === 'Escape' && !submitting) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, submitting])

  async function handleConfirm() {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/contact-brands/unlink', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contact_id: contactId,
          brand_id: brandId,
          reason: isSoft ? reason : undefined,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || !body.success) {
        throw new Error(body.error ?? `http_${res.status}`)
      }
      onUnlinked({ result: body.result, ended_at: body.ended_at })
      onClose()
    } catch (err) {
      setError((err as Error).message)
      setSubmitting(false)
    }
  }

  return (
    <div
      className="pitch-modal-overlay"
      onClick={(e) => {
        // Block bubble-to-anchor + native href-follow when this modal is
        // mounted inside a Next.js <Link> row (e.g., BrandContactsTable's
        // role-popover → unlink flow). preventDefault stops the browser's
        // anchor activation; stopPropagation stops React's Link onClick.
        // Both fire unconditionally — harmless when modal is mounted outside
        // any Link tree. Founder smoke 3.5 2026-06-01 (mirrors the 3.2 fix
        // applied to RolePopover earlier this session).
        e.preventDefault()
        e.stopPropagation()
        if (e.target === e.currentTarget && !submitting) onClose()
      }}
    >
      <div className="modal-card unlink-modal" role="dialog" aria-modal="true">
        <header className="modal-band">
          <span className="modal-band-l">
            {isSoft ? 'End relationship' : 'Remove the link'}
          </span>
          <button
            type="button"
            className="pitch-modal-close"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close"
          >
            ✕
          </button>
        </header>

        <div className="modal-body">
          <h2 className="modal-h">
            {isSoft ? (
              <>
                End {contactName}&rsquo;s link to {brandName}<span className="dot">.</span>
              </>
            ) : (
              <>
                Remove {contactName} from {brandName}<span className="dot">.</span>
              </>
            )}
          </h2>

          {isSoft ? (
            <>
              <p className="modal-p">
                <b>{contactName}</b> has{' '}
                <b>
                  {pitchCountForPair}{' '}
                  {pitchCountForPair === 1 ? 'pitch' : 'pitches'}
                </b>{' '}
                on the record with <b>{brandName}</b>
                {closedDealCount > 0 ? (
                  <>
                    {' · '}
                    <b>{closedDealCount}</b> closed
                    {closedDealAmountDisplay ? (
                      <>
                        {' · '}
                        <b>{closedDealAmountDisplay}</b>
                      </>
                    ) : null}
                  </>
                ) : null}
                . Ending the relationship keeps the past in place — only the
                forward-looking signal changes.
              </p>

              <div className="modal-block">
                <span className="modal-block-h">What will change</span>
                <ul className="modal-block-list">
                  <li>
                    The card moves from <em>active</em> to <em>ended</em> on
                    {' '}{contactName}&rsquo;s chain — dashed border, dated tag,
                    Reactivate pill in the foot.
                  </li>
                  <li>
                    {brandName}&rsquo;s &ldquo;current Contacts&rdquo; list
                    drops {contactName}; pitch records stay intact.
                  </li>
                  <li>
                    If a new pitch arrives for this pair later, the relationship
                    can be Reactivated with one click.
                  </li>
                </ul>
              </div>

              <label className="modal-field">
                <span className="modal-field-l">
                  Why end this? <span className="modal-field-opt">optional</span>
                </span>
                <textarea
                  className="modal-field-input"
                  rows={2}
                  placeholder="e.g. she moved to a different agency"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  disabled={submitting}
                />
              </label>
            </>
          ) : (
            <>
              <p className="modal-p">
                No pitches tie <b>{contactName}</b> to <b>{brandName}</b> yet.
                Removing the link drops the row cleanly — nothing to preserve.
              </p>
              <p className="modal-p" style={{ color: 'var(--ink-3)' }}>
                <em>If you change your mind</em> — relink them anytime by adding
                a pitch or via the contact-edit flow (FR-8 S3).
              </p>
            </>
          )}

          {error ? (
            <p className="modal-p" style={{ color: 'var(--accent)' }}>
              ⚠ Couldn&rsquo;t unlink — {error}
            </p>
          ) : null}
        </div>

        <footer className="modal-foot">
          <span className="modal-foot-help">
            {isSoft ? 'Reversible · keeps history' : 'No pitches to lose'}
          </span>
          <div style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}>
            <button
              type="button"
              className="row-action-pill"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="button"
              className={isSoft ? 'btn-pill is-warn' : 'btn-pill'}
              onClick={handleConfirm}
              disabled={submitting}
            >
              {submitting
                ? isSoft
                  ? 'Ending…'
                  : 'Removing…'
                : isSoft
                  ? 'End relationship'
                  : 'Remove the link'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
