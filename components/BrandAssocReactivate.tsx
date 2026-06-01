'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// FR-8 S5 (slice #76) — Reactivate pill on ENDED Brand card foot.
// Per AC5.4: flips ended → Prior (not Current — re-promotion to Current is
// future work via auto-reactivate-on-new-pitch, AC5.5 deferred per task
// #76 v1-trim "defer auto-reactivate (manual suffices v1)").
//
// No confirm modal — the action is small + reversible. Per spec D4 "no confirm
// modal — `↺ Undo` toast for 5s carries the weight." Undo toast deferred to
// v1.1 — v1 ships with a simple inline status line below the pill on success.

interface BrandAssocReactivateProps {
  contactId: string
  brandId: string
}

export function BrandAssocReactivate({
  contactId,
  brandId,
}: BrandAssocReactivateProps) {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleClick() {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/contact-brands/reactivate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contact_id: contactId, brand_id: brandId }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || !body.success) {
        throw new Error(body.error ?? `http_${res.status}`)
      }
      // Refresh server component so the card flips back to Prior visually.
      router.refresh()
    } catch (err) {
      setError((err as Error).message)
      setSubmitting(false)
    }
  }

  return (
    <span className="brand-card-reactivate">
      <button
        type="button"
        className="row-action-pill"
        onClick={handleClick}
        disabled={submitting}
      >
        {submitting ? '…' : '↺ Reactivate'}
      </button>
      {error ? (
        <span className="brand-card-reactivate-err" role="status">
          ⚠ {error}
        </span>
      ) : null}
    </span>
  )
}
