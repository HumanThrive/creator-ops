'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { createClient } from '@/lib/supabase/client'
import type { Pitch, PitchSourceChannel } from '@/lib/types/pitch'
import { PITCH_SOURCE_CHANNELS } from '@/lib/types/pitch'
import { formatSourceChannel } from '@/lib/format'
import {
  EntityTypeahead,
  type BrandMatch,
  type ContactMatch,
  type ContactCreatePayload,
} from '../EntityTypeahead'

export interface PitchEditDraft {
  brand_name: string | null
  sender_name: string | null
  sender_email: string | null
  deliverables: string[]
  budget_amount: number | null
  budget_currency: string | null
  deadline: string | null
  industry: string | null
  source_channel: PitchSourceChannel | null
  source_subject: string | null
  // FR-7 W69 — typeahead-resolved FK overrides. Null = no re-link (RPC's
  // COALESCE preserves existing FK). Non-null = explicit re-link to the
  // entity the user picked / created in the typeahead. AC7.2 v1 ships
  // resolution-at-submit (mirrors AddPitchModal); the AC's "immediate
  // re-link" framing is held for Founder smoke + UX decision.
  brand_id_override: string | null
  contact_id_override: string | null
  thread_id_override: string | null
}

interface EditDetailsOverlayProps {
  pitch: Pitch
  onClose: () => void
  onSaveRequest: (draft: PitchEditDraft) => Promise<void>
}

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
  const isInbound = pitch.direction === 'inbound'

  // Real fields — persist via /api/pitches/update on save.
  const [brand, setBrand] = useState(pitch.brand_name ?? '')
  const [sender, setSender] = useState(pitch.sender_name ?? '')
  const [budget, setBudget] = useState(
    formatBudgetForInput(pitch.budget_amount, pitch.budget_currency),
  )
  const [deadline, setDeadline] = useState(pitch.deadline ?? '')
  const [deliverables, setDeliverables] = useState<string[]>([...pitch.deliverables])

  // FR-6 real fields.
  const [industry, setIndustry] = useState(pitch.industry ?? '')
  const [senderEmail, setSenderEmail] = useState(pitch.sender_email ?? '')
  const [sourceSubject, setSourceSubject] = useState(pitch.source_subject ?? '')
  const [sourceChannel, setSourceChannel] = useState<string>(pitch.source_channel ?? '')

  // FR-7 W69 — typeahead chip + override state. Chips are seeded from the
  // pitch's existing FKs so the user opens the overlay with the current
  // link visible as a chip (not as plain text + dropdown). Override is
  // non-null only when the user explicitly picks an entity from the
  // dropdown OR creates a new one inline. Free-typing without dropdown
  // interaction = override stays null = RPC's COALESCE preserves the
  // current brand_id / contact_id (per AC7.6 default no-typeahead-action).
  const [brandChip, setBrandChip] = useState<{ label: string } | null>(
    pitch.brand_id ? { label: pitch.brand_name ?? '(no name)' } : null,
  )
  const [contactChip, setContactChip] = useState<{ label: string } | null>(
    pitch.contact_id ? { label: pitch.sender_name ?? '(no name)' } : null,
  )
  const [brandIdOverride, setBrandIdOverride] = useState<string | null>(
    pitch.brand_id ?? null,
  )
  const [contactIdOverride, setContactIdOverride] = useState<string | null>(
    pitch.contact_id ?? null,
  )
  const [threadIdOverride, setThreadIdOverride] = useState<string | null>(null)

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

  // Lookup-or-create thread for a (user_id, contact_id) pair. Mirrors the
  // /api/pitches/save route's thread resolution (uses ON CONFLICT race
  // handling). Required when the user re-links Contact: pitches.thread_id
  // must move to a thread anchored at the new Contact (per AC7.5).
  async function resolveThreadForContact(contactId: string): Promise<string | null> {
    const sb = createClient()
    const {
      data: { user: currentUser },
    } = await sb.auth.getUser()
    if (!currentUser) return null
    const existing = await sb
      .from('threads')
      .select('id')
      .eq('user_id', currentUser.id)
      .eq('contact_id', contactId)
      .maybeSingle()
    if (existing.data?.id) return existing.data.id
    const inserted = await sb
      .from('threads')
      .insert({ user_id: currentUser.id, contact_id: contactId })
      .select('id')
      .single()
    if (inserted.error) {
      // Race: another concurrent INSERT got there first. Re-SELECT.
      const reread = await sb
        .from('threads')
        .select('id')
        .eq('user_id', currentUser.id)
        .eq('contact_id', contactId)
        .maybeSingle()
      return reread.data?.id ?? null
    }
    return (inserted.data as { id: string }).id
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    const { amount, currency } = parseBudgetInput(budget)
    const sourceChannelValue: PitchSourceChannel | null =
      sourceChannel && (PITCH_SOURCE_CHANNELS as readonly string[]).includes(sourceChannel)
        ? (sourceChannel as PitchSourceChannel)
        : null

    // If Contact was re-linked (override differs from pitch.contact_id),
    // resolve the matching thread_id so the pitch moves to the new
    // Contact's thread per AC7.5. Resolution skipped when override is
    // null (RPC's COALESCE preserves existing thread_id) OR when
    // override matches existing contact_id (already linked correctly).
    let resolvedThreadId = threadIdOverride
    const contactRelinked =
      contactIdOverride !== null && contactIdOverride !== pitch.contact_id
    if (contactRelinked && resolvedThreadId === null) {
      resolvedThreadId = await resolveThreadForContact(contactIdOverride)
      if (resolvedThreadId === null) {
        setError('Could not resolve thread for the selected contact.')
        setSaving(false)
        return
      }
    }

    try {
      await onSaveRequest({
        brand_name: brand.trim() || null,
        sender_name: sender.trim() || null,
        sender_email: senderEmail.trim() || null,
        deliverables: deliverables.map((d) => d.trim()).filter(Boolean),
        budget_amount: amount,
        budget_currency: currency,
        deadline: deadline.trim() || null,
        industry: industry.trim() || null,
        source_channel: sourceChannelValue,
        source_subject: sourceSubject.trim() || null,
        brand_id_override: brandIdOverride,
        contact_id_override: contactIdOverride,
        thread_id_override: resolvedThreadId,
      })
      // Parent closes the overlay after a successful save + refetch.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.')
      setSaving(false)
    }
  }

  // Portal out of the parent modal's DOM tree — see W64 commit notes:
  // parent `.pdetail-scrim` `backdrop-filter` creates a containing block
  // for `position: fixed` descendants.
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
              <EntityTypeahead
                kind="brand"
                value={brand}
                selected={brandChip}
                onSelectedChange={setBrandChip}
                onChange={(v) => {
                  setBrand(v)
                  // Free-typing invalidates a prior explicit-selection.
                  setBrandIdOverride(null)
                }}
                onSelectExisting={(b: BrandMatch | null) => {
                  if (b) {
                    setBrand(b.name)
                    setBrandIdOverride(b.id)
                  } else {
                    setBrandIdOverride(null)
                  }
                }}
                onCreateNew={async (typed: string) => {
                  // Client-side Brand INSERT — /api/pitches/update is a
                  // forward-stub (no resolution), so EditDetailsOverlay
                  // resolves Create-new client-side. Mirrors the Contact
                  // create-new pattern in AddPitchModal.
                  try {
                    const sb = createClient()
                    const {
                      data: { user: currentUser },
                    } = await sb.auth.getUser()
                    if (!currentUser) {
                      console.error(
                        '[EditDetailsOverlay] brand create skipped — no user session',
                      )
                      return
                    }
                    // ON CONFLICT (user_id, lower(name)) DO NOTHING handles
                    // the race where a parallel save just inserted the same
                    // brand. Fall back to a re-SELECT on conflict.
                    const inserted = await sb
                      .from('brands')
                      .insert({ user_id: currentUser.id, name: typed })
                      .select('id')
                      .single()
                    let newId: string | null = null
                    if (inserted.error) {
                      const reread = await sb
                        .from('brands')
                        .select('id')
                        .eq('user_id', currentUser.id)
                        .ilike('name', typed)
                        .maybeSingle()
                      newId = reread.data?.id ?? null
                    } else {
                      newId = (inserted.data as { id: string }).id
                    }
                    if (!newId) {
                      console.error(
                        '[EditDetailsOverlay] brand create failed to resolve id',
                      )
                      return
                    }
                    setBrand(typed)
                    setBrandIdOverride(newId)
                  } catch (e) {
                    console.error(
                      '[EditDetailsOverlay] brand create unexpected:',
                      e,
                    )
                  }
                }}
                placeholder="Brand name"
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
              {isInbound ? (
                <EntityTypeahead
                  kind="contact"
                  value={sender}
                  selected={contactChip}
                  onSelectedChange={setContactChip}
                  onChange={(v) => {
                    setSender(v)
                    setContactIdOverride(null)
                    setThreadIdOverride(null)
                  }}
                  onSelectExisting={(c: ContactMatch | null) => {
                    if (c) {
                      const primaryEmail = c.channels?.find(
                        (ch) => ch.kind === 'Email' && ch.primary,
                      )
                      setSender(c.display_name ?? '')
                      if (primaryEmail?.identifier) {
                        setSenderEmail(primaryEmail.identifier)
                      }
                      setContactIdOverride(c.id)
                      // Thread re-resolution happens at save time (one
                      // round-trip on save vs one on every selection).
                      setThreadIdOverride(null)
                    } else {
                      setContactIdOverride(null)
                      setThreadIdOverride(null)
                    }
                  }}
                  onCreateNew={async (payload: ContactCreatePayload) => {
                    try {
                      const sb = createClient()
                      const {
                        data: { user: currentUser },
                      } = await sb.auth.getUser()
                      if (!currentUser) {
                        console.error(
                          '[EditDetailsOverlay] contact create skipped — no user session',
                        )
                        return
                      }
                      const normalizedChannels = payload.channels.map((c) => ({
                        ...c,
                        identifier:
                          c.kind === 'Email'
                            ? c.identifier.trim().toLowerCase()
                            : c.identifier.trim(),
                      }))
                      const { data, error } = await sb
                        .from('contacts')
                        .insert({
                          user_id: currentUser.id,
                          display_name: payload.display_name,
                          channels: normalizedChannels,
                        })
                        .select('id')
                        .single()
                      if (error) {
                        console.error(
                          '[EditDetailsOverlay] contact create failed:',
                          error.message,
                        )
                        return
                      }
                      const newId = (data as { id: string }).id
                      const primaryEmail = normalizedChannels.find(
                        (c) => c.kind === 'Email' && c.primary,
                      )
                      if (payload.display_name) setSender(payload.display_name)
                      if (primaryEmail?.identifier) {
                        setSenderEmail(primaryEmail.identifier)
                      }
                      setContactIdOverride(newId)
                      setThreadIdOverride(null)
                    } catch (e) {
                      console.error(
                        '[EditDetailsOverlay] contact create unexpected:',
                        e,
                      )
                    }
                  }}
                  placeholder="Sender name"
                  seedEmail={senderEmail || null}
                />
              ) : (
                // Outbound pitches don't carry a Contact (AC1.5); render a
                // plain input for free-text sender_name (unused for FK
                // resolution but preserved in the audit trail).
                <input
                  className="pdetail-cr8-overlay-input"
                  value={sender}
                  onChange={(e) => setSender(e.target.value)}
                />
              )}
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

            <div className="pdetail-cr8-overlay-field">
              <label className="pdetail-cr8-overlay-field-l">Source channel</label>
              <select
                className="pdetail-cr8-overlay-input"
                value={sourceChannel}
                onChange={(e) => setSourceChannel(e.target.value)}
              >
                <option value="">— None —</option>
                {PITCH_SOURCE_CHANNELS.map((c) => (
                  <option key={c} value={c}>
                    {formatSourceChannel(c)}
                  </option>
                ))}
              </select>
            </div>
            <div className="pdetail-cr8-overlay-field">
              <label className="pdetail-cr8-overlay-field-l">Source subject</label>
              <input
                className="pdetail-cr8-overlay-input"
                value={sourceSubject}
                onChange={(e) => setSourceSubject(e.target.value)}
                placeholder="Email subject line (if any)"
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
