'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { generateBaseSlug } from '@/lib/slug'
import { DupBrandCallout, type ExistingBrand } from '@/components/DupBrandCallout'

// FR-11 #90 (Story 1) — name-only create modal (design Ask 01 · Take A).
// Production modal chrome (pitch-modal-overlay + modal-card) wrapping a single
// display-typed name field with a live slug preview. A brand is only a name, so
// there's no channel machinery — far thinner than NewContactModal, by design.
//
// Create-or-callout (spec R3): a name collision (409 brand_name_collision) is
// surfaced as a Combine opportunity via DupBrandCallout, never silently merged.

interface NewBrandModalProps {
  onClose: () => void
}

export function NewBrandModal({ onClose }: NewBrandModalProps) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [collision, setCollision] = useState<ExistingBrand | null>(null)

  // ESC closes (unless a submit is mid-flight)
  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      if (ev.key === 'Escape' && !submitting) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, submitting])

  const trimmed = name.trim()
  const slugPreview = generateBaseSlug(trimmed) ?? '…'

  function onNameChange(value: string) {
    setName(value)
    // Editing the name clears a standing collision/error — validate on the next
    // submit, never mid-typing (design Ask 05 · validate-on-save).
    if (collision) setCollision(null)
    if (error) setError(null)
  }

  async function submit() {
    if (!trimmed) {
      setError('Brand name required')
      return
    }
    setSubmitting(true)
    setError(null)
    setCollision(null)
    try {
      const res = await fetch('/api/brands/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      })
      const body = await res.json().catch(() => ({}))
      if (res.status === 409 && body.error === 'brand_name_collision') {
        setCollision(
          (body.existing as ExistingBrand | null) ?? {
            id: '',
            name: trimmed,
            slug: null,
          },
        )
        setSubmitting(false)
        return
      }
      if (!res.ok || !body.success) {
        throw new Error(body.error ?? `http_${res.status}`)
      }
      const { id, slug } = body as { id: string; slug: string | null }
      router.push(`/app/brands/${slug ?? id}`)
      // Don't close before navigation — the route change unmounts the modal.
    } catch (err) {
      setError((err as Error).message)
      setSubmitting(false)
    }
  }

  return (
    <div
      className="pitch-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose()
      }}
    >
      <div className="modal-card new-brand-modal" role="dialog" aria-modal="true">
        <header className="modal-band">
          <span className="modal-band-l">New Brand</span>
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
            Name the brand<span className="dot">.</span>
          </h2>

          <div className="brand-name-field-wrap">
            <span className="field-l">Brand name</span>
            <input
              type="text"
              className={`brand-name-field${collision ? ' is-error' : ''}`}
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !submitting) {
                  e.preventDefault()
                  void submit()
                }
              }}
              placeholder="Caraway"
              disabled={submitting}
              autoFocus
            />
            {collision ? (
              <DupBrandCallout
                attemptedName={trimmed}
                existing={collision}
                onDismiss={() => setCollision(null)}
              />
            ) : (
              <span className="field-hint">
                That&rsquo;s all we need &mdash; add pitches, contacts and deals to
                it later. <b>Slug</b> &middot; /app/brands/{slugPreview}
              </span>
            )}
          </div>

          {error ? (
            <p className="modal-p" style={{ color: 'var(--accent)' }}>
              ⚠ {error}
            </p>
          ) : null}
        </div>

        <footer className="modal-foot">
          <span className="modal-foot-help">↵ to create</span>
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
              className={`btn-pill${collision ? ' is-dim' : ''}`}
              onClick={submit}
              disabled={submitting || collision !== null}
            >
              {submitting ? 'Creating…' : 'Create brand'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
