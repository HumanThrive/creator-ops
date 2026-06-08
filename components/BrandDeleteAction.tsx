'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  BrandDeleteBlockedModal,
  type BlockedPitchRow,
} from '@/components/BrandDeleteBlockedModal'
import {
  BrandUnlinkConfirmModal,
  type AffectedContact,
} from '@/components/BrandUnlinkConfirmModal'
import { BrandDeleteConfirmModal } from '@/components/BrandDeleteConfirmModal'

// FR-11 #92 (Story 3) — the ✕ Delete brand affordance on the brand detail header
// rail. Preflights (?check_only=1) then branches on what's anchored:
//   pitch_count > 0                      → blocked modal (Cancel only)
//   pitch_count 0, contact_link_count >0 → contact-unlink confirm → delete
//   pitch_count 0, contact_link_count  0 → clean: confirm gate (accidental-click
//                                          guard) → optimistic-defer Undo toast
//                                          (stash + route; the real DELETE fires
//                                           on the list — BrandDeleteToast)
//
// recentPitches (≤3) come pre-computed from the populated detail page for the
// blocked modal; on the 0-pitch empty detail they're [] (blocked can't fire).

const PENDING_KEY = 'pendingBrandDelete'

interface BrandDeleteActionProps {
  brandId: string
  brandName: string
  brandSlug: string | null
  pitchCount: number
  recentPitches: BlockedPitchRow[]
}

type Status =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'blocked'; pitchCount: number; brandName: string }
  | { kind: 'unlinkConfirm'; contactLinkCount: number; affected: AffectedContact[] }
  | { kind: 'cleanConfirm' }
  | { kind: 'deleting' }
  | { kind: 'error'; message: string }

export function BrandDeleteAction({
  brandId,
  brandName,
  brandSlug,
  pitchCount,
  recentPitches,
}: BrandDeleteActionProps) {
  const router = useRouter()
  const [status, setStatus] = useState<Status>({ kind: 'idle' })

  async function onDeleteClick() {
    setStatus({ kind: 'checking' })
    try {
      const res = await fetch(`/api/brands/${brandId}/delete?check_only=1`, {
        method: 'POST',
      })
      const body = await res.json().catch(() => ({}))
      if (res.status === 409 && body.blocked) {
        setStatus({
          kind: 'blocked',
          pitchCount: body.pitch_count ?? pitchCount,
          brandName: body.brand_name ?? brandName,
        })
        return
      }
      if (!res.ok) throw new Error(body.error ?? `http_${res.status}`)
      // Deletable (0 pitches).
      if ((body.contact_link_count ?? 0) > 0) {
        setStatus({
          kind: 'unlinkConfirm',
          contactLinkCount: body.contact_link_count,
          affected: (body.affected_contacts as AffectedContact[]) ?? [],
        })
      } else {
        // Clean (0 pitches, 0 contacts): interpose the accidental-click confirm
        // before the optimistic-defer flow. The 5s Undo toast still follows.
        setStatus({ kind: 'cleanConfirm' })
      }
    } catch (err) {
      setStatus({ kind: 'error', message: (err as Error).message })
    }
  }

  function commitClean() {
    // Hand off to the list's toast host; the real DELETE fires there after the 5s
    // Undo window. The detail page is the deleted brand's page, so route away.
    try {
      sessionStorage.setItem(
        PENDING_KEY,
        JSON.stringify({ id: brandId, name: brandName }),
      )
    } catch {
      // sessionStorage unavailable — fall through to navigation; the brand simply
      // won't be hidden/undoable, but it also won't be deleted (no orphan state).
    }
    router.push('/app/brands')
  }

  async function onUnlinkConfirm() {
    setStatus({ kind: 'deleting' })
    try {
      const res = await fetch(`/api/brands/${brandId}/delete`, { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      if (res.status === 409 && body.blocked) {
        // Race: a pitch landed between preflight and delete (AC3.4).
        setStatus({
          kind: 'blocked',
          pitchCount: body.pitch_count ?? 0,
          brandName: body.brand_name ?? brandName,
        })
        return
      }
      if (!res.ok || !body.success) throw new Error(body.error ?? `http_${res.status}`)
      router.push('/app/brands')
    } catch (err) {
      setStatus({ kind: 'error', message: (err as Error).message })
    }
  }

  return (
    <div className="brand-del">
      <button
        type="button"
        className="bd-del-btn"
        onClick={onDeleteClick}
        disabled={status.kind === 'checking' || status.kind === 'deleting'}
      >
        ✕ Delete brand
      </button>
      {status.kind === 'error' ? (
        <span className="brand-del-err" role="status">
          ⚠ {status.message}
        </span>
      ) : null}

      {status.kind === 'blocked' ? (
        <BrandDeleteBlockedModal
          brandName={status.brandName}
          pitchCount={status.pitchCount}
          recentPitches={recentPitches}
          existing={{ id: brandId, name: status.brandName, slug: brandSlug }}
          onClose={() => setStatus({ kind: 'idle' })}
        />
      ) : null}

      {status.kind === 'unlinkConfirm' ? (
        <BrandUnlinkConfirmModal
          brandName={brandName}
          contactLinkCount={status.contactLinkCount}
          affected={status.affected}
          onCancel={() => setStatus({ kind: 'idle' })}
          onConfirm={onUnlinkConfirm}
        />
      ) : null}

      {status.kind === 'cleanConfirm' ? (
        <BrandDeleteConfirmModal
          brandName={brandName}
          onCancel={() => setStatus({ kind: 'idle' })}
          onConfirm={commitClean}
        />
      ) : null}
    </div>
  )
}
