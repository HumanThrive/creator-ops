'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Pitch } from '@/lib/types/pitch'
import {
  getMockIndustry,
  getMockSenderEmail,
  getMockSourceSubject,
} from '@/lib/pitch-mock'

export interface PitchEditDraft {
  brand_name: string | null
  sender_name: string | null
  deliverables: string[]
  budget_amount: number | null
  budget_currency: string | null
  deadline: string | null
}

interface EditDetailsOverlayProps {
  pitch: Pitch
  onClose: () => void
  onSaveRequest: (draft: PitchEditDraft) => Promise<void>
}

// "$1,200 USD" / "$1,200" / "1200" parser. Conservative: extracts the first
// number it finds; treats trailing alpha (after optional space) as currency.
function parseBudgetInput(raw: string): { amount: number | null; currency: string | null } {
  const trimmed = raw.trim()
  if (!trimmed) return { amount: null, currency: null }
  const match = trimmed.match(/(-?[\d.,]+)\s*([A-Za-z]{2,4})?/)
  if (!match) return { amount: null, currency: null }
  const amountStr = match[1].replace(/[^\d.-]/g, '')
  const parsed = amountStr === '' ? NaN : Number(amountStr)
  if (!Number.isFinite(parsed)) return { amount: null, currency: null }
  return {
    amount: parsed,
    currency: match[2] ? match[2].toUpperCase() : null,
  }
}

function formatBudgetForInput(amount: number | null, currency: string | null): string {
  if (amount == null) return ''
  return currency ? `$${amount.toLocaleString()} ${currency}` : `${amount}`
}

export function EditDetailsOverlay({
  pitch,
  onClose,
  onSaveRequest,
}: EditDetailsOverlayProps) {
  // Real fields — persist via update_pitch_with_activity on save.
  const [brand, setBrand] = useState(pitch.brand_name ?? '')
  const [sender, setSender] = useState(pitch.sender_name ?? '')
  const [budget, setBudget] = useState(
    formatBudgetForInput(pitch.budget_amount, pitch.budget_currency),
  )
  const [deadline, setDeadline] = useState(pitch.deadline ?? '')
  const [deliverables, setDeliverables] = useState<string[]>([...pitch.deliverables])

  // Mock fields — Founder Option B 2026-05-19: live editable, silently discard on save.
  const [industry, setIndustry] = useState(getMockIndustry(pitch))
  const [senderEmail, setSenderEmail] = useState(getMockSenderEmail(pitch) ?? '')
  const [sourceSubject, setSourceSubject] = useState(getMockSourceSubject(pitch))

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isExiting, setIsExiting] = useState(false)

  function requestClose() {
    if (isExiting || saving) return
    setIsExiting(true)
    setTimeout(() => onClose(), 180)
  }

  // Esc to close.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') requestClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSave() {
    setSaving(true)
    setError(null)
    const { amount, currency } = parseBudgetInput(budget)
    try {
      await onSaveRequest({
        brand_name: brand.trim() || null,
        sender_name: sender.trim() || null,
        deliverables: deliverables.map((d) => d.trim()).filter(Boolean),
        budget_amount: amount,
        budget_currency: currency,
        deadline: deadline.trim() || null,
      })
      // Parent closes the overlay after a successful save + refetch.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.')
      setSaving(false)
    }
  }

  // Portal out of the parent modal's DOM tree. The parent `.pdetail-scrim`
  // applies `backdrop-filter: blur(2px)`, which (per CSS spec) creates a
  // containing block for `position: fixed` descendants — turning our overlay
  // into effectively absolute-positioned and making it scroll with the parent
  // scrim's overflow. Portaling to document.body escapes that trap.
  if (typeof window === 'undefined') return null

  return createPortal(
    <div
      className={`pdetail-cr8-overlay-host${isExiting ? ' is-exiting' : ''}`}
    >
      <div className="pdetail-cr8-overlay-dim" onClick={requestClose} />
      <div className="pdetail-cr8-overlay-modal" role="dialog" aria-modal="true">
        <header className="pdetail-cr8-overlay-head">
          <h2 className="pdetail-cr8-overlay-h">
            Edit pitch details<span className="dot">.</span>
          </h2>
        </header>

        <div className="pdetail-cr8-overlay-body">
          <div className="pdetail-cr8-overlay-grid">
            <div className="pdetail-cr8-overlay-field">
              <label className="pdetail-cr8-overlay-field-l">Brand</label>
              <input
                className="pdetail-cr8-overlay-input"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
              />
            </div>
            <div className="pdetail-cr8-overlay-field">
              <label className="pdetail-cr8-overlay-field-l">Industry</label>
              <input
                className="pdetail-cr8-overlay-input"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
              />
            </div>

            <div className="pdetail-cr8-overlay-field">
              <label className="pdetail-cr8-overlay-field-l">Sender</label>
              <input
                className="pdetail-cr8-overlay-input"
                value={sender}
                onChange={(e) => setSender(e.target.value)}
              />
            </div>
            <div className="pdetail-cr8-overlay-field">
              <label className="pdetail-cr8-overlay-field-l">Sender email</label>
              <input
                className="pdetail-cr8-overlay-input"
                value={senderEmail}
                onChange={(e) => setSenderEmail(e.target.value)}
              />
            </div>

            <div className="pdetail-cr8-overlay-field">
              <label className="pdetail-cr8-overlay-field-l">Original budget</label>
              <input
                className="pdetail-cr8-overlay-input"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                placeholder="$1,200 USD"
              />
            </div>
            <div className="pdetail-cr8-overlay-field">
              <label className="pdetail-cr8-overlay-field-l">Deadline</label>
              <input
                className="pdetail-cr8-overlay-input"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                placeholder="Jun 23, 2026"
              />
            </div>

            <div className="pdetail-cr8-overlay-field span-2">
              <label className="pdetail-cr8-overlay-field-l">Source · subject line</label>
              <input
                className="pdetail-cr8-overlay-input"
                value={sourceSubject}
                onChange={(e) => setSourceSubject(e.target.value)}
              />
            </div>

            <div className="pdetail-cr8-overlay-field span-2">
              <label className="pdetail-cr8-overlay-field-l">Original deliverables</label>
              <ol className="pdetail-cr8-overlay-deliv">
                {deliverables.map((d, i) => (
                  <li key={i}>
                    <input
                      value={d}
                      onChange={(e) => {
                        const next = [...deliverables]
                        next[i] = e.target.value
                        setDeliverables(next)
                      }}
                    />
                  </li>
                ))}
              </ol>
              <button
                type="button"
                className="pdetail-cr8-deliv-edit-add"
                onClick={() => setDeliverables([...deliverables, ''])}
                style={{ alignSelf: 'flex-start', marginTop: 8 }}
              >
                Add deliverable
              </button>
            </div>
          </div>

          {error ? (
            <div
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 11,
                color: 'var(--accent)',
                padding: '8px 4px 0',
              }}
            >
              {error}
            </div>
          ) : null}
        </div>

        <div className="pdetail-cr8-overlay-foot">
          <span className="pdetail-cr8-overlay-fine">
            Verbatim message preserved · audit trail retained
          </span>
          <div style={{ display: 'flex', gap: 12 }}>
            <button
              type="button"
              className="pdetail-cr8-overlay-cancel"
              onClick={requestClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="button"
              className="pdetail-cr8-overlay-save"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
