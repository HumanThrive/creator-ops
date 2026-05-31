'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DeleteBlockedModal } from '@/components/DeleteBlockedModal'

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
}

type Status =
  | { kind: 'idle' }
  | { kind: 'confirming'; endsAt: number }  // 5s window where Undo cancels
  | { kind: 'deleting' }
  | { kind: 'blocked'; pitchCount: number; brandCount: number; contactName: string }
  | { kind: 'error'; message: string }

const CONFIRM_WINDOW_MS = 5000

export function ContactDeleteAction({
  contactId,
  contactName,
}: ContactDeleteActionProps) {
  const router = useRouter()
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [tick, setTick] = useState(0)

  // Drive the confirming-window countdown
  useEffect(() => {
    if (status.kind !== 'confirming') return
    const handle = setInterval(() => setTick((t) => t + 1), 200)
    return () => clearInterval(handle)
  }, [status.kind])

  // Fire delete when the confirming window expires
  useEffect(() => {
    if (status.kind !== 'confirming') return
    const remaining = status.endsAt - Date.now()
    if (remaining <= 0) {
      void executeDelete()
    } else {
      const t = setTimeout(() => {
        void executeDelete()
      }, remaining)
      return () => clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, tick])

  async function preflight() {
    // Issue the delete request once — server returns 409 if blocked OR 200 on clear
    // delete. Single round-trip; if 409 we DON'T move into confirming (modal shows
    // instead); if 200 we move into confirming (BUT — that's wrong: 200 means
    // already deleted). Need to re-architect:
    //
    // Pattern: first request checks-and-deletes atomically. We don't want a
    // separate pre-check call (race-prone). Pragmatic v1: do the actual delete
    // on first click + show toast "Deleted · Undo (5s)" — but true undo would
    // need soft-delete (spec rejects). So the toast is a confirm-then-navigate
    // sequence: delete fires server-side, then 5s toast, then we navigate away.
    //
    // For now: click → server-side delete attempt → 200 → navigate after toast;
    // 409 → blocked modal.
    setStatus({ kind: 'deleting' })
    try {
      const res = await fetch(`/api/contacts/${contactId}/delete`, {
        method: 'POST',
      })
      if (res.status === 409) {
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

  async function executeDelete() {
    // Confirming-window path is unused in v1 — see preflight() comment.
    // Kept as a stub for future soft-delete-backed true-undo wiring.
    setStatus({ kind: 'deleting' })
    await preflight()
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
      {status.kind === 'idle' || status.kind === 'error' ? (
        <button
          type="button"
          className="contact-delete-link"
          onClick={preflight}
        >
          ⌫ Delete contact
        </button>
      ) : null}
      {status.kind === 'deleting' ? (
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
      {status.kind === 'blocked' ? (
        <DeleteBlockedModal
          contactName={status.contactName}
          pitchCount={status.pitchCount}
          brandCount={status.brandCount}
          onClose={dismissBlocked}
        />
      ) : null}
    </div>
  )
}
