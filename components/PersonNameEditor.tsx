'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

// FR-8 S3 (slice #77) — inline display-name editor on Contact-detail PersonHead.
// Per spec Delta 3:
//   - Variant A (inline edit + ZERO-SHIFT RULE) locked
//   - `.person-head` grid/font/x-y unchanged on edit-mode entry
//   - H1 becomes contenteditable in-place; text-decoration: underline accent
//   - `✎ Edit` pill top-right swaps to `✓ Done` in the same slot
//
// Save → POST /api/contacts/update → router.replace(new URL) when slug
// auto-update produces a new canonical slug; otherwise router.refresh() to
// pick up the rename across server-rendered surfaces.

interface PersonNameEditorProps {
  contactId: string
  initialDisplayName: string  // resolved fallback ("(no name)")
  initialDisplayNameRaw: string | null  // raw value from DB; null for no-name
  currentSlug: string | null
}

export function PersonNameEditor({
  contactId,
  initialDisplayName,
  initialDisplayNameRaw,
  currentSlug,
}: PersonNameEditorProps) {
  const router = useRouter()
  const h1Ref = useRef<HTMLHeadingElement | null>(null)
  const [editing, setEditing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Track the last-saved name so cancel reverts to it.
  const [savedName, setSavedName] = useState<string>(
    initialDisplayNameRaw ?? initialDisplayName,
  )

  // Enter edit mode: focus the H1 and place caret at end.
  useEffect(() => {
    if (!editing || !h1Ref.current) return
    const node = h1Ref.current
    node.focus()
    // Select the text node so the caret lands inside (not on the trailing dot span).
    const range = document.createRange()
    if (node.firstChild) {
      range.selectNodeContents(node.firstChild)
      range.collapse(false)
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(range)
    }
  }, [editing])

  // ESC cancels; Enter (without Shift) saves.
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
    if (h1Ref.current) {
      // Restore DOM text to the last-saved name (no parens around (no name)).
      h1Ref.current.textContent = savedName
    }
    setEditing(false)
    setError(null)
  }

  async function save() {
    if (!h1Ref.current) return
    const raw = (h1Ref.current.textContent ?? '').trim()
    // Normalize: empty string = null (Contact becomes no-name → routes by uuid).
    const next = raw.length > 0 ? raw : null
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/contacts/update', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contact_id: contactId, display_name: next }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || !body.success) {
        throw new Error(body.error ?? `http_${res.status}`)
      }
      const newSlug: string | null = body.slug ?? null
      const newName: string = body.display_name ?? '(no name)'
      setSavedName(newName)
      // Reflect in DOM in case the server normalized (e.g. trimmed) the value.
      if (h1Ref.current) h1Ref.current.textContent = newName
      setEditing(false)
      setSubmitting(false)
      // URL update if slug changed: replace current path to the new slug-URL.
      // Old slug stays routable via previous_slugs[] fallback per LD-Gap-B (b1).
      if (newSlug && newSlug !== currentSlug) {
        router.replace(`/app/people/${newSlug}`)
      } else {
        router.refresh()
      }
    } catch (err) {
      setError((err as Error).message)
      setSubmitting(false)
    }
  }

  return (
    <div className="person-h1-wrap">
      <h1
        ref={h1Ref}
        className={`person-h1 ${editing ? 'is-edit' : ''}`}
        contentEditable={editing}
        suppressContentEditableWarning
        spellCheck={false}
      >
        {savedName}
      </h1>
      <span className="dot person-h1-dot" aria-hidden="true">
        .
      </span>
      <div className="person-h1-actions">
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
            aria-label="Edit display name"
          >
            ✎ Edit
          </button>
        )}
      </div>
      {error ? (
        <span className="person-h1-err" role="status">
          ⚠ Couldn&rsquo;t save — {error}
        </span>
      ) : null}
    </div>
  )
}
