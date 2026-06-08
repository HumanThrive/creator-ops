'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DupBrandCallout, type ExistingBrand } from '@/components/DupBrandCallout'

// FR-11 #91 (Story 2 · design Ask 04) — inline zero-shift rename on the brand
// detail H1. Mirror of PersonNameEditor: the H1 itself goes contentEditable in
// place (no sheet, no draft state), ✎ Edit ⇄ ✓ Done in the same slot, save on
// Enter. A brand has only a name, so this is the whole edit surface.
//
// Save → POST /api/brands/update → router.replace(new URL) when the slug rotated
// (old URL 301s via CR-7's previous_slugs handler), else router.refresh() to pick
// up the rename across server-rendered surfaces. Name collision → DupBrandCallout
// under the H1, stays in edit mode.

interface BrandNameEditorProps {
  brandId: string
  initialName: string
  currentSlug: string | null
}

export function BrandNameEditor({
  brandId,
  initialName,
  currentSlug,
}: BrandNameEditorProps) {
  const router = useRouter()
  const h1Ref = useRef<HTMLHeadingElement | null>(null)
  const [editing, setEditing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [collision, setCollision] = useState<ExistingBrand | null>(null)
  const [savedName, setSavedName] = useState(initialName)

  // Enter edit mode: focus the H1, caret at end.
  useEffect(() => {
    if (!editing || !h1Ref.current) return
    const node = h1Ref.current
    node.focus()
    const range = document.createRange()
    if (node.firstChild) {
      range.selectNodeContents(node.firstChild)
      range.collapse(false)
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(range)
    }
  }, [editing])

  // ESC cancels; Enter (no Shift) saves.
  useEffect(() => {
    if (!editing) return
    function onKey(ev: KeyboardEvent) {
      if (ev.key === 'Escape') {
        ev.preventDefault()
        cancel()
      } else if (ev.key === 'Enter' && !ev.shiftKey) {
        ev.preventDefault()
        void save()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing])

  function cancel() {
    if (h1Ref.current) h1Ref.current.textContent = savedName
    setEditing(false)
    setError(null)
    setCollision(null)
  }

  async function save() {
    if (!h1Ref.current) return
    const next = (h1Ref.current.textContent ?? '').trim()
    if (!next) {
      setError('Brand name required')
      return
    }
    if (next === savedName) {
      // Cosmetic no-op — exit without a write.
      setEditing(false)
      return
    }
    setSubmitting(true)
    setError(null)
    setCollision(null)
    try {
      const res = await fetch('/api/brands/update', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ brand_id: brandId, name: next }),
      })
      const body = await res.json().catch(() => ({}))
      if (res.status === 409 && body.error === 'brand_name_collision') {
        // Revert the DOM to the saved name; surface the callout, stay in edit mode.
        if (h1Ref.current) h1Ref.current.textContent = savedName
        setCollision(
          (body.existing as ExistingBrand | null) ?? {
            id: '',
            name: next,
            slug: null,
          },
        )
        setSubmitting(false)
        return
      }
      if (!res.ok || !body.success) {
        throw new Error(body.error ?? `http_${res.status}`)
      }
      const newSlug: string | null = body.slug ?? null
      const newName: string = body.name ?? next
      setSavedName(newName)
      if (h1Ref.current) h1Ref.current.textContent = newName
      setEditing(false)
      setSubmitting(false)
      if (newSlug && newSlug !== currentSlug) {
        router.replace(`/app/brands/${newSlug}`)
      } else {
        router.refresh()
      }
    } catch (err) {
      setError((err as Error).message)
      setSubmitting(false)
    }
  }

  return (
    <div className="brand-h1-wrap">
      <h1
        ref={h1Ref}
        className={`page-h1 brand-h1 ${editing ? 'is-edit' : ''}`}
        contentEditable={editing}
        suppressContentEditableWarning
        spellCheck={false}
      >
        {savedName}
      </h1>
      <span className="dot brand-h1-dot" aria-hidden="true">
        .
      </span>
      <div className="brand-h1-actions">
        {editing ? (
          <>
            <button
              type="button"
              className="btn-pill-mini"
              onClick={() => void save()}
              disabled={submitting}
            >
              {submitting ? '…' : '✓ Done'}
            </button>
            <button
              type="button"
              className="btn-ghost-mini"
              onClick={cancel}
              disabled={submitting}
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            className="btn-ghost-mini"
            onClick={() => setEditing(true)}
            aria-label="Edit brand name"
          >
            ✎ Edit
          </button>
        )}
      </div>
      {collision ? (
        <div className="brand-h1-callout">
          <DupBrandCallout
            attemptedName={savedName}
            existing={collision}
            onDismiss={() => setCollision(null)}
          />
        </div>
      ) : null}
      {error ? (
        <span className="brand-h1-err" role="status">
          ⚠ Couldn&rsquo;t save — {error}
        </span>
      ) : null}
    </div>
  )
}
