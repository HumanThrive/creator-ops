'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ChannelEntry, ChannelKind } from '@/lib/types/contact'
import { CHANNEL_KIND_CLASS } from '@/lib/types/contact'

// FR-8 S3 (slice #77) — ChannelsEditor per spec Delta 3.
// Display mode: renders the existing channels-strip (chip rows). Edit mode:
// each channel becomes a `.ch-edit-row` with kind picker + identifier input +
// Primary toggle + Remove ✕; `+ Add channel` ghost row at bottom; auto-save
// on blur/toggle/remove/add; Done pill in section-head exits edit mode.
//
// Primary rule (canon): exactly one Primary across all channels. Clicking
// Primary on another row demotes the prior. Removing the Primary auto-promotes
// the next remaining channel. Single-channel state: Primary toggle is inert,
// Remove button disabled.

const VALID_KINDS: ChannelKind[] = [
  'Email', 'IG', 'TikTok', 'WhatsApp', 'X', 'IRL', 'Facebook', 'LinkedIn', 'Website',
]

interface ChannelsEditorProps {
  contactId: string
  initialChannels: ChannelEntry[]
}

type Notice =
  | { kind: 'saved' }
  | { kind: 'error'; message: string }
  | null

const NOTICE_TTL_MS = 3000

export function ChannelsEditor({ contactId, initialChannels }: ChannelsEditorProps) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [channels, setChannels] = useState<ChannelEntry[]>(() =>
    initialChannels.map((c) => ({ ...c })),
  )
  const [savedSnapshot, setSavedSnapshot] = useState<ChannelEntry[]>(() =>
    initialChannels.map((c) => ({ ...c })),
  )
  const [notice, setNotice] = useState<Notice>(null)
  const [submitting, setSubmitting] = useState(false)
  const newRowFocusRef = useRef<HTMLInputElement | null>(null)
  const justAddedRef = useRef(false)

  // Sync local state if initialChannels changes (server-side refresh).
  // Skip sync while editing — would clobber in-progress edits.
  useEffect(() => {
    if (editing) return
    const fresh = initialChannels.map((c) => ({ ...c }))
    setChannels(fresh)
    setSavedSnapshot(fresh)
  }, [initialChannels, editing])

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), NOTICE_TTL_MS)
    return () => clearTimeout(t)
  }, [notice])

  useEffect(() => {
    if (justAddedRef.current && newRowFocusRef.current) {
      newRowFocusRef.current.focus()
      justAddedRef.current = false
    }
  })

  async function persist(next: ChannelEntry[]) {
    setSubmitting(true)
    try {
      const res = await fetch('/api/contacts/update', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contact_id: contactId, channels: next }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || !body.success) {
        throw new Error(body.error ?? `http_${res.status}`)
      }
      setSavedSnapshot(next.map((c) => ({ ...c })))
      setNotice({ kind: 'saved' })
      router.refresh()
    } catch (err) {
      setNotice({ kind: 'error', message: (err as Error).message })
      // Revert local state to last-saved snapshot so UI and DB agree.
      setChannels(savedSnapshot.map((c) => ({ ...c })))
    } finally {
      setSubmitting(false)
    }
  }

  function changeKind(idx: number, nextKind: ChannelKind) {
    const next = channels.map((c, i) => (i === idx ? { ...c, kind: nextKind } : c))
    setChannels(next)
    void persist(next)
  }

  function changeIdentifier(idx: number, value: string) {
    setChannels((cs) => cs.map((c, i) => (i === idx ? { ...c, identifier: value } : c)))
  }

  function blurIdentifier(idx: number) {
    // Trim + save the trimmed value if it differs.
    const cur = channels[idx]
    if (!cur) return
    const trimmed = cur.identifier.trim()
    if (trimmed === savedSnapshot[idx]?.identifier && trimmed === cur.identifier) {
      return // no change to save
    }
    const next = channels.map((c, i) =>
      i === idx ? { ...c, identifier: trimmed } : c,
    )
    setChannels(next)
    void persist(next)
  }

  function togglePrimary(idx: number) {
    if (channels.length <= 1) return // single-channel: Primary inert
    const cur = channels[idx]
    if (!cur || cur.primary) return // clicking Primary on already-primary row = no-op
    const next = channels.map((c, i) => ({ ...c, primary: i === idx }))
    setChannels(next)
    void persist(next)
  }

  function removeRow(idx: number) {
    if (channels.length <= 1) return // single-channel: Remove disabled
    const removed = channels[idx]
    let next = channels.filter((_, i) => i !== idx)
    // If we removed the Primary, auto-promote the first remaining.
    if (removed?.primary && next.length > 0 && !next.some((c) => c.primary)) {
      next = next.map((c, i) => ({ ...c, primary: i === 0 }))
    }
    setChannels(next)
    void persist(next)
  }

  function addRow() {
    const newRow: ChannelEntry = {
      kind: 'Email',
      identifier: '',
      primary: channels.length === 0,
    }
    const next = [...channels, newRow]
    setChannels(next)
    justAddedRef.current = true
    // Don't persist yet — wait for blur of the empty identifier OR explicit save.
  }

  function enterEdit() {
    setEditing(true)
  }

  function exitEdit() {
    // Final blur-save pass: any pending in-flight typed-but-not-blurred
    // identifier persists via blurIdentifier handlers as user tabs out.
    // If channels diverged from snapshot since last persist (e.g. user added a
    // row but didn't blur), persist now.
    const dirty =
      channels.length !== savedSnapshot.length ||
      channels.some(
        (c, i) =>
          c.kind !== savedSnapshot[i]?.kind ||
          c.identifier.trim() !== savedSnapshot[i]?.identifier ||
          c.primary !== savedSnapshot[i]?.primary,
      )
    if (dirty) {
      void persist(channels.map((c) => ({ ...c, identifier: c.identifier.trim() })))
    }
    setEditing(false)
  }

  // ── Display mode (read-only chips) ───────────────────────────────────
  if (!editing) {
    if (savedSnapshot.length === 0) {
      // Render an Edit affordance even when empty so the user can add the
      // first channel without going through the AddPitchModal path.
      return (
        <section className="channels-strip">
          <div className="channels-strip-head">
            <span className="channels-strip-h">Channels</span>
            <button type="button" className="btn-ghost-mini" onClick={enterEdit}>
              ✎ Edit channels
            </button>
          </div>
          <div className="channels-strip-empty">
            No channels on file. Add an email, IG handle, or any of 9 kinds.
          </div>
        </section>
      )
    }
    return (
      <section className="channels-strip">
        <div className="channels-strip-head">
          <span className="channels-strip-h">
            Channels
            {notice?.kind === 'saved' ? (
              <span className="channels-strip-h-sub">· saved</span>
            ) : null}
          </span>
          <button type="button" className="btn-ghost-mini" onClick={enterEdit}>
            ✎ Edit channels
          </button>
        </div>
        <div className="channels-strip-rows">
          {savedSnapshot.map((ch, i) => (
            <span key={i} className="channel-chip">
              <span className={`ch-dot ${CHANNEL_KIND_CLASS[ch.kind]}`} />
              {ch.identifier ? <span>{ch.identifier}</span> : null}
              <span className="ch-label">{ch.kind}</span>
              {ch.primary ? <span className="ch-primary">Primary</span> : null}
            </span>
          ))}
        </div>
      </section>
    )
  }

  // ── Edit mode (rows + Add + Done in head) ────────────────────────────
  const singleChannel = channels.length <= 1
  return (
    <section className="channels-strip is-edit">
      <div className="channels-strip-head">
        <span className="channels-strip-h">
          Channels
          {notice?.kind === 'saved' ? (
            <span className="channels-strip-h-sub is-accent">· auto-saved</span>
          ) : null}
          {notice?.kind === 'error' ? (
            <span className="channels-strip-h-sub is-error">
              · ⚠ {notice.message}
            </span>
          ) : null}
          {submitting ? <span className="channels-strip-h-sub">· saving…</span> : null}
        </span>
        <button
          type="button"
          className="btn-pill-mini"
          onClick={exitEdit}
          disabled={submitting}
        >
          ✓ Done
        </button>
      </div>

      <div className="ch-edit-rows">
        {channels.map((ch, i) => {
          const wrapClass = `ch-edit-picker-wrap ${CHANNEL_KIND_CLASS[ch.kind] ?? ''}`
          return (
            <div className="ch-edit-row" key={i}>
              <span className={wrapClass}>
                <select
                  className="ch-edit-picker"
                  value={ch.kind}
                  onChange={(e) => changeKind(i, e.target.value as ChannelKind)}
                  disabled={submitting}
                  aria-label={`Channel kind for row ${i + 1}`}
                >
                  {VALID_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </span>
              <input
                ref={i === channels.length - 1 ? newRowFocusRef : undefined}
                type="text"
                className="ch-edit-input"
                value={ch.identifier}
                onChange={(e) => changeIdentifier(i, e.target.value)}
                onBlur={() => blurIdentifier(i)}
                placeholder={placeholderFor(ch.kind)}
                disabled={submitting}
                aria-label={`Identifier for ${ch.kind}`}
              />
              <button
                type="button"
                className={`ch-edit-primary ${ch.primary ? 'is-on' : ''}`}
                onClick={() => togglePrimary(i)}
                disabled={singleChannel || submitting}
                title={
                  singleChannel
                    ? 'Single channel — Primary auto-set'
                    : ch.primary
                      ? 'Primary'
                      : 'Make Primary'
                }
              >
                {ch.primary ? '★ Primary' : '☆ Primary'}
              </button>
              <button
                type="button"
                className="ch-edit-remove"
                onClick={() => removeRow(i)}
                disabled={singleChannel || submitting}
                aria-label={`Remove ${ch.kind} channel`}
                title={singleChannel ? 'Single channel — cannot remove' : 'Remove'}
              >
                ✕
              </button>
            </div>
          )
        })}
        <button
          type="button"
          className="ch-edit-add"
          onClick={addRow}
          disabled={submitting}
        >
          + Add channel
        </button>
      </div>
    </section>
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
