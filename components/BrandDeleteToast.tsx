'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

// FR-11 #92 (design Ask 06 Outcome 3) — the clean-delete optimistic-defer Undo
// toast. A 0-pitch / 0-contact brand deleted from its detail page routes here to
// the list with a sessionStorage hand-off (BrandsList reads it, hides the row,
// mounts this). The toast holds the row for 5s; if Undo isn't pressed, the real
// hard DELETE fires and the list refreshes. Undo (or navigating away) unmounts
// this → the effect cleanup clears the timer → the DELETE never fires.
//
// No codebase precedent (FR-8's contact delete is confirm-then-delete, no toast).

interface BrandDeleteToastProps {
  brandId: string
  brandName: string
  onDone: () => void // clears BrandsList's pending state (commit OR undo)
}

const WINDOW_MS = 5000

export function BrandDeleteToast({
  brandId,
  brandName,
  onDone,
}: BrandDeleteToastProps) {
  const router = useRouter()
  const [seconds, setSeconds] = useState(5)
  const firedRef = useRef(false)

  useEffect(() => {
    const tick = setInterval(
      () => setSeconds((s) => Math.max(0, s - 1)),
      1000,
    )
    const timer = setTimeout(async () => {
      firedRef.current = true
      try {
        await fetch(`/api/brands/${brandId}/delete`, { method: 'POST' })
      } catch {
        // Best-effort — if the DELETE fails, router.refresh re-renders the brand
        // back into the list (it was only hidden client-side, never removed).
      }
      router.refresh()
      onDone()
    }, WINDOW_MS)
    return () => {
      clearInterval(tick)
      clearTimeout(timer)
    }
    // One pending delete per mount; brandId identifies it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandId])

  return (
    <div className="toast-host">
      <div className="toast" role="status">
        <span className="toast-dot" aria-hidden />
        <span className="toast-msg">
          <b>{brandName}</b> removed
        </span>
        <button type="button" className="toast-undo" onClick={onDone}>
          ↺ Undo
        </button>
        <span className="toast-timer">{seconds}s</span>
      </div>
    </div>
  )
}
