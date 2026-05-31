'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ChannelEntry, ChannelKind } from '@/lib/types/contact'
import { CHANNEL_KIND_CLASS } from '@/lib/types/contact'
import { DupEmailCallout } from '@/components/DupEmailCallout'

// FR-8 S2 (slice #79) — NewContactModal.
// 540px squared modal (NOT a /new route per spec); name + channels form;
// submit creates the Contact + lands on /app/people/[slug || id].
//
// v1-trim: optional Brand+role at create-time deferred per task #79 v1-trim.
// The user can add a Brand link via the Contact-detail Brand cards after create.

const VALID_KINDS: ChannelKind[] = [
  'Email', 'IG', 'TikTok', 'WhatsApp', 'X', 'IRL', 'Facebook', 'LinkedIn', 'Website',
]

interface NewContactModalProps {
  onClose: () => void
  onCreated?: (contact: { id: string; slug: string | null }) => void
}

export function NewContactModal({ onClose, onCreated }: NewContactModalProps) {
  const router = useRouter()
  const [displayName, setDisplayName] = useState('')
  const [channels, setChannels] = useState<ChannelEntry[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dupEmail, setDupEmail] = useState<string | null>(null)

  // ESC closes
  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      if (ev.key === 'Escape' && !submitting) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, submitting])

  function addChannel() {
    setChannels((cs) => [
      ...cs,
      { kind: 'Email', identifier: '', primary: cs.length === 0 },
    ])
  }
  function changeKind(idx: number, kind: ChannelKind) {
    setChannels((cs) => cs.map((c, i) => (i === idx ? { ...c, kind } : c)))
  }
  function changeIdentifier(idx: number, identifier: string) {
    setChannels((cs) => cs.map((c, i) => (i === idx ? { ...c, identifier } : c)))
  }
  function togglePrimary(idx: number) {
    if (channels.length <= 1) return
    setChannels((cs) => cs.map((c, i) => ({ ...c, primary: i === idx })))
  }
  function removeRow(idx: number) {
    if (channels.length <= 1) {
      setChannels([])
      return
    }
    const removed = channels[idx]
    let next = channels.filter((_, i) => i !== idx)
    if (removed?.primary && next.length > 0 && !next.some((c) => c.primary)) {
      next = next.map((c, i) => ({ ...c, primary: i === 0 }))
    }
    setChannels(next)
  }

  async function submit() {
    const trimmedName = displayName.trim() || null
    const cleanChannels = channels
      .filter((c) => c.identifier.trim() !== '')
      .map((c) => ({ ...c, identifier: c.identifier.trim() }))
    if (!trimmedName && cleanChannels.length === 0) {
      setError('Add a display name or at least one channel.')
      return
    }
    setSubmitting(true)
    setError(null)
    setDupEmail(null)
    try {
      const res = await fetch('/api/contacts/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          display_name: trimmedName,
          channels: cleanChannels,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (res.status === 409 && body.error === 'primary_email_collision') {
        const offending =
          cleanChannels.find((c) => c.kind === 'Email' && c.primary)?.identifier ??
          ''
        setDupEmail(offending || '(unknown email)')
        setSubmitting(false)
        return
      }
      if (!res.ok || !body.success) {
        throw new Error(body.error ?? `http_${res.status}`)
      }
      const { id, slug } = body as { id: string; slug: string | null }
      onCreated?.({ id, slug })
      router.push(`/app/people/${slug ?? id}`)
      // Don't close before navigation — let the navigation cleanup unmount.
    } catch (err) {
      setError((err as Error).message)
      setSubmitting(false)
    }
  }

  const singleChannel = channels.length <= 1

  return (
    <div
      className="pitch-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose()
      }}
    >
      <div
        className="modal-card new-contact-modal"
        role="dialog"
        aria-modal="true"
      >
        <header className="modal-band">
          <span className="modal-band-l">New Contact</span>
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
            Add someone you tracked outside a pitch<span className="dot">.</span>
          </h2>

          <label className="modal-field">
            <span className="modal-field-l">Display name</span>
            <input
              type="text"
              className="modal-field-input"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Sarah Chen"
              disabled={submitting}
              autoFocus
            />
          </label>

          <div className="modal-field">
            <span className="modal-field-l">Channels</span>
            {dupEmail ? (
              <DupEmailCallout
                email={dupEmail}
                onDismiss={() => setDupEmail(null)}
              />
            ) : null}
            <div className="ch-edit-rows">
              {channels.length === 0 ? (
                <div className="ch-edit-empty">
                  No channels yet — add an email, IG handle, or any of 9 kinds.
                </div>
              ) : null}
              {channels.map((ch, i) => (
                <div className="ch-edit-row" key={i}>
                  <span className={`ch-edit-picker-wrap ${CHANNEL_KIND_CLASS[ch.kind] ?? ''}`}>
                    <select
                      className="ch-edit-picker"
                      value={ch.kind}
                      onChange={(e) => changeKind(i, e.target.value as ChannelKind)}
                      disabled={submitting}
                    >
                      {VALID_KINDS.map((k) => (
                        <option key={k} value={k}>
                          {k}
                        </option>
                      ))}
                    </select>
                  </span>
                  <input
                    type="text"
                    className="ch-edit-input"
                    value={ch.identifier}
                    onChange={(e) => changeIdentifier(i, e.target.value)}
                    placeholder={placeholderFor(ch.kind)}
                    disabled={submitting}
                  />
                  <button
                    type="button"
                    className={`ch-edit-primary ${ch.primary ? 'is-on' : ''}`}
                    onClick={() => togglePrimary(i)}
                    disabled={singleChannel || submitting}
                  >
                    {ch.primary ? '★ Primary' : '☆ Primary'}
                  </button>
                  <button
                    type="button"
                    className="ch-edit-remove"
                    onClick={() => removeRow(i)}
                    disabled={submitting}
                    aria-label="Remove channel"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="ch-edit-add"
                onClick={addChannel}
                disabled={submitting}
              >
                + Add channel
              </button>
            </div>
          </div>

          {error ? (
            <p className="modal-p" style={{ color: 'var(--accent)' }}>
              ⚠ {error}
            </p>
          ) : null}
        </div>

        <footer className="modal-foot">
          <span className="modal-foot-help">
            Add a Brand link from the detail page after create
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
              className="btn-pill"
              onClick={submit}
              disabled={submitting}
            >
              {submitting ? 'Creating…' : 'Create Contact'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}

function placeholderFor(kind: ChannelKind): string {
  switch (kind) {
    case 'Email': return 'name@example.com'
    case 'IG': return '@handle'
    case 'TikTok': return '@handle'
    case 'X': return '@handle'
    case 'Facebook': return 'profile.url or @handle'
    case 'LinkedIn': return 'linkedin.com/in/handle'
    case 'WhatsApp': return '+country phone'
    case 'IRL': return 'where we met'
    case 'Website': return 'https://…'
  }
}
