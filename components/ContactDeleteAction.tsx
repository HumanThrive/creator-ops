'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { DeleteBlockedModal } from '@/components/DeleteBlockedModal'
import { DeleteConfirmModal } from '@/components/DeleteConfirmModal'

// Active-brand-link shape passed through from the Contact-detail page (which
// already computes brand-pair pitch counts + closed-deal aggregates + tag
// derivation for the stacked BrandCard render). Mirrors UnlinkModal's
// expected scope-data so DeleteBlockedModal's "End a Brand link" path-card
// can mount UnlinkModal directly on the single-brand fast-path AND render
// the multi-brand picker rows per Delta 7 (avatar + name + tag + role +
// pitch count + last-touch).
import type { PickerLinkTag } from '@/components/DeleteBlockedModal'
import type { ContactRole } from '@/lib/types/contact'

export interface ActiveBrandLinkForDelete {
  brand_id: string
  brand_name: string
  pitch_count_for_pair: number
  closed_deal_count?: number
  closed_deal_amount_display?: string | null
  // Delta 7 picker fields:
  role: ContactRole | null
  last_pitch_at: string | null
  state_tag: PickerLinkTag
}

// FR-8 S4 (slice #78) — delete affordance on Contact-detail page.
// Quiet placement — a small destructive-styled link in a footer area, NOT a
// big red button in the header (the spec's voice ladder discourages alarm).
//
// Two paths:
//   - Zero history → confirm via toast-style undo (v1 ships immediate delete +
//     undo-toast 5s; the toast itself acts as the confirmation). On success
//     router.push('/app/people') back to the list.
//   - Has history → server returns 409 { blocked, pitch_count, brand_count,
//     contact_name } → mount DeleteBlockedModal w/ path-cards.
//
// v1-trim: Undo on zero-history delete is simplified — the toast is a
// confirmation-then-execute pattern (click Delete → 5s window where Undo
// aborts the navigation). True undo (resurrect a deleted row) would need a
// soft-delete column on contacts; spec R2 explicitly rejected that for v1.

interface ContactDeleteActionProps {
  contactId: string
  contactName: string
  activeBrandLinks: ActiveBrandLinkForDelete[]
}

type Status =
  | { kind: 'idle' }
  | { kind: 'checking' }        // preflight in flight (deciding which modal to open)
  | { kind: 'confirming' }      // no-history → confirm modal open; awaiting Cancel / Delete
  | { kind: 'deleting' }        // confirm-Delete pressed; real DELETE in flight
  | { kind: 'blocked'; pitchCount: number; brandCount: number; contactName: string }
  | { kind: 'error'; message: string }

export function ContactDeleteAction({
  contactId,
  contactName,
  activeBrandLinks,
}: ContactDeleteActionProps) {
  const router = useRouter()
  const [status, setStatus] = useState<Status>({ kind: 'idle' })

  async function onDeleteClick() {
    // Preflight before opening any modal — has-history contacts go straight to
    // DeleteBlockedModal (no confirm-then-blocked chain that conflicts on
    // voice); no-history contacts go to DeleteConfirmModal. Founder smoke
    // 2D.2 2026-06-01.
    setStatus({ kind: 'checking' })
    try {
      const res = await fetch(
        `/api/contacts/${contactId}/delete?check_only=1`,
        { method: 'POST' },
      )
      const body = await res.json().catch(() => ({}))
      if (res.status === 409 && body.blocked) {
        setStatus({
          kind: 'blocked',
          pitchCount: body.pitch_count ?? 0,
          brandCount: body.brand_count ?? 0,
          contactName: body.contact_name ?? contactName,
        })
        return
      }
      if (!res.ok) {
        throw new Error(body.error ?? `http_${res.status}`)
      }
      // Preflight clear — open the confirm modal.
      setStatus({ kind: 'confirming' })
    } catch (err) {
      setStatus({ kind: 'error', message: (err as Error).message })
    }
  }

  async function onConfirmDelete() {
    setStatus({ kind: 'deleting' })
    try {
      const res = await fetch(`/api/contacts/${contactId}/delete`, {
        method: 'POST',
      })
      if (res.status === 409) {
        // Race fallback — history appeared between preflight and DELETE.
        // Swap the confirm modal for the blocked modal.
        const body = await res.json().catch(() => ({}))
        setStatus({
          kind: 'blocked',
          pitchCount: body.pitch_count ?? 0,
          brandCount: body.brand_count ?? 0,
          contactName: body.contact_name ?? contactName,
        })
        return
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `http_${res.status}`)
      }
      // Zero-history delete succeeded. Navigate back to the list.
      router.push('/app/people')
    } catch (err) {
      setStatus({ kind: 'error', message: (err as Error).message })
    }
  }

  function dismissConfirm() {
    setStatus({ kind: 'idle' })
  }

  function dismissBlocked() {
    setStatus({ kind: 'idle' })
  }

  function dismissError() {
    setStatus({ kind: 'idle' })
  }

  return (
    <div className="contact-danger-zone">
      <span className="contact-danger-zone-l">Other actions</span>
      {/* ZERO-SHIFT swap slot — locks min-height so idle button / deleting
          status / error span all render in the same vertical box. Mirrors
          [[role-popover-notice height-lock]] established earlier this smoke. */}
      <span className="contact-delete-slot">
        {status.kind === 'idle' || status.kind === 'confirming' || status.kind === 'error' ? (
          <button
            type="button"
            className="contact-delete-link"
            onClick={onDeleteClick}
          >
            ⌫ Delete contact
          </button>
        ) : null}
        {status.kind === 'checking' || status.kind === 'deleting' ? (
          <span className="contact-delete-status">Checking…</span>
        ) : null}
        {status.kind === 'error' ? (
          <span className="contact-danger-zone-err" role="status">
            ⚠ {status.message}{' '}
            <button
              type="button"
              className="row-action-pill"
              onClick={dismissError}
              style={{ marginLeft: 8 }}
            >
              Dismiss
            </button>
          </span>
        ) : null}
      </span>
      {status.kind === 'confirming' ? (
        <DeleteConfirmModal
          contactName={contactName}
          onCancel={dismissConfirm}
          onConfirm={onConfirmDelete}
        />
      ) : null}
      {status.kind === 'blocked' ? (
        <DeleteBlockedModal
          contactId={contactId}
          contactName={status.contactName}
          pitchCount={status.pitchCount}
          brandCount={status.brandCount}
          activeBrandLinks={activeBrandLinks}
          onClose={dismissBlocked}
        />
      ) : null}
    </div>
  )
}
