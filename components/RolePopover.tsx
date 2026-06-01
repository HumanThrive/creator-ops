'use client'

import { useEffect, useRef, useState } from 'react'
import type { ContactRole } from '@/lib/types/contact'
import { ROLE_CLASS } from '@/lib/types/contact'

// FR-8 S5 (slice #76) — RolePopover per spec Delta 4.
// One component, two mount points: Contact-detail stacked Brand card +
// BrandContactsTable row. Items: 5 roles + "No role" + dashed "Unlink from
// Brand" (above-divider). Inline auto-save on role pick + Undo-pill 5s in
// the card foot. "Unlink from Brand" closes popover + asks parent to open
// the UnlinkModal (parent owns modal mount).
//
// Variant `card-foot` = positioned for stacked Brand card head; trigger is
// the role-pill-edit chip with caret. Variant `table-row` = stopPropagation
// + same popover; container needs `overflow: visible`.

const ROLE_ORDER: ContactRole[] = ['PR', 'Brand team', 'Connector', 'Founder', 'Other']

interface RolePopoverProps {
  contactId: string
  brandId: string
  initialRole: ContactRole | null
  variant?: 'card-foot' | 'table-row'
  onRoleChange?: (newRole: ContactRole | null) => void
  onUnlinkRequested: () => void
}

type Notice =
  | { kind: 'saving'; targetRole: ContactRole | null }
  | { kind: 'saved'; prevRole: ContactRole | null; nextRole: ContactRole | null }
  | { kind: 'reverted' }
  | { kind: 'error'; message: string }
  | null

// Unified TTL for saved/reverted/error (Founder smoke 2026-06-01: was 5s/4s, → 3s).
// 'saving' has NO TTL — it stays until the in-flight fetch resolves to saved/error.
const NOTICE_TTL_MS = 3000
// Exit animation duration — must match @keyframes role-popover-notice-fade-out in
// design-system.css. Drives the unmount delay after .is-leaving is applied.
const EXIT_ANIM_MS = 200

export function RolePopover({
  contactId,
  brandId,
  initialRole,
  variant = 'card-foot',
  onRoleChange,
  onUnlinkRequested,
}: RolePopoverProps) {
  const [role, setRole] = useState<ContactRole | null>(initialRole)
  const [open, setOpen] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)
  const [isLeaving, setIsLeaving] = useState(false)
  const wrapRef = useRef<HTMLSpanElement | null>(null)

  // Centralized notice setter: resets the leaving phase so a new notice
  // arriving mid-leave cancels the exit animation and replaces the content.
  function showNotice(next: Notice) {
    setIsLeaving(false)
    setNotice(next)
  }
  function dismissNotice() {
    setIsLeaving(true)
  }

  // Outside-click + Escape close
  useEffect(() => {
    if (!open) return
    function onDown(ev: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(ev.target as Node)) {
        setOpen(false)
      }
    }
    function onKey(ev: KeyboardEvent) {
      if (ev.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // 3s wait → flip to leaving phase. Skip 'saving' (it manages itself via fetch
  // resolution; the 3s countdown only starts AFTER the save resolves). Skip if
  // already leaving (a new notice arriving via showNotice resets isLeaving).
  useEffect(() => {
    if (!notice || notice.kind === 'saving' || isLeaving) return
    const t = setTimeout(() => setIsLeaving(true), NOTICE_TTL_MS)
    return () => clearTimeout(t)
  }, [notice, isLeaving])

  // Leaving phase → after the exit animation completes, unmount the notice.
  // Matches @keyframes role-popover-notice-fade-out duration in design-system.css.
  useEffect(() => {
    if (!isLeaving) return
    const t = setTimeout(() => {
      setNotice(null)
      setIsLeaving(false)
    }, EXIT_ANIM_MS)
    return () => clearTimeout(t)
  }, [isLeaving])

  async function persistRole(next: ContactRole | null, prev: ContactRole | null) {
    const res = await fetch('/api/contact-brands/set-role', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contact_id: contactId, brand_id: brandId, role: next }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error ?? `http_${res.status}`)
    }
  }

  async function handlePick(next: ContactRole | null) {
    setOpen(false)
    if (next === role) return
    const prev = role
    // Optimistic UI update + immediate 'saving' notice (no countdown during this).
    setRole(next)
    onRoleChange?.(next)
    showNotice({ kind: 'saving', targetRole: next })
    try {
      await persistRole(next, prev)
      showNotice({ kind: 'saved', prevRole: prev, nextRole: next })
    } catch (err) {
      // Failure: revert role + flip notice to error (3s auto-dismiss + click-dismiss).
      setRole(prev)
      onRoleChange?.(prev)
      showNotice({ kind: 'error', message: (err as Error).message })
    }
  }

  async function handleUndo() {
    if (!notice || notice.kind !== 'saved') return
    const { prevRole, nextRole } = notice
    const target = prevRole
    // Optimistic revert + 'saving' notice for the undo round-trip too.
    setRole(target)
    onRoleChange?.(target)
    showNotice({ kind: 'saving', targetRole: target })
    try {
      await persistRole(target, nextRole)
      showNotice({ kind: 'reverted' })
    } catch (err) {
      // Revert failed — restore the saved state so DB and UI agree.
      setRole(nextRole)
      onRoleChange?.(nextRole)
      showNotice({ kind: 'error', message: (err as Error).message })
    }
  }

  function handleUnlinkItemClick() {
    setOpen(false)
    onUnlinkRequested()
  }

  // Trigger pill mirrors role state with role-pill-edit + .ROLE_CLASS variant.
  const triggerClass = role
    ? `role-pill-edit ${ROLE_CLASS[role]}`
    : 'role-pill-edit is-empty'
  const triggerLabel = role ?? 'No role'

  const stopRowPropagation = variant === 'table-row'

  // In `table-row` variant the popover lives inside a Next.js <Link> row.
  // stopPropagation alone isn't enough — it prevents React's Link onClick
  // from firing but the browser's native anchor-activation still navigates.
  // preventDefault stops the browser-level default; stopPropagation stops
  // React-level bubble. Need both. Founder smoke 3.2 2026-06-01.
  function guardClick(e: React.MouseEvent) {
    if (stopRowPropagation) {
      e.preventDefault()
      e.stopPropagation()
    }
  }

  return (
    <span
      ref={wrapRef}
      className="role-popover"
      onClick={guardClick}
    >
      <button
        type="button"
        className={triggerClass}
        onClick={(e) => {
          guardClick(e)
          setOpen((v) => !v)
        }}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        {triggerLabel}
      </button>

      {open ? (
        <div className="role-popover-menu" role="menu">
          {ROLE_ORDER.map((r) => (
            <button
              key={r}
              type="button"
              role="menuitemradio"
              aria-checked={role === r}
              className={`role-popover-item ${role === r ? 'is-on' : ''}`}
              onClick={(e) => {
                guardClick(e)
                handlePick(r)
              }}
            >
              {r} <span className="check">{role === r ? '✓' : '·'}</span>
            </button>
          ))}
          <button
            type="button"
            role="menuitemradio"
            aria-checked={role === null}
            className={`role-popover-item ${role === null ? 'is-on' : ''}`}
            onClick={(e) => {
              guardClick(e)
              handlePick(null)
            }}
          >
            No role <span className="check">{role === null ? '✓' : '·'}</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="role-popover-item is-danger"
            onClick={(e) => {
              guardClick(e)
              handleUnlinkItemClick()
            }}
          >
            Unlink from Brand <span className="check">→</span>
          </button>
        </div>
      ) : null}

      {notice ? (
        <span
          className={`role-popover-notice is-${notice.kind} ${isLeaving ? 'is-leaving' : ''}`}
          role="status"
          aria-live="polite"
        >
          {notice.kind === 'saving' ? (
            <>Saving · {notice.targetRole ?? 'No role'}…</>
          ) : notice.kind === 'saved' ? (
            <>
              Saved · {notice.nextRole ?? 'No role'}{' '}
              <button
                type="button"
                className="row-action-pill"
                onClick={(e) => {
                  guardClick(e)
                  handleUndo()
                }}
              >
                ↺ Undo
              </button>
            </>
          ) : notice.kind === 'reverted' ? (
            <>↺ Reverted</>
          ) : (
            <>
              ⚠ {notice.message}{' '}
              <button
                type="button"
                className="role-popover-notice-close"
                onClick={(e) => {
                  guardClick(e)
                  dismissNotice()
                }}
                aria-label="Dismiss error"
              >
                ✕
              </button>
            </>
          )}
        </span>
      ) : null}
    </span>
  )
}
