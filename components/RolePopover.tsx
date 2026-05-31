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
  | { kind: 'saved'; prevRole: ContactRole | null; nextRole: ContactRole | null }
  | { kind: 'reverted' }
  | { kind: 'error'; message: string }
  | null

const NOTICE_TTL_MS = 5000
const ERROR_TTL_MS = 4000

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
  const wrapRef = useRef<HTMLSpanElement | null>(null)

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

  // Notice auto-dismiss
  useEffect(() => {
    if (!notice) return
    const ttl = notice.kind === 'error' ? ERROR_TTL_MS : NOTICE_TTL_MS
    const t = setTimeout(() => setNotice(null), ttl)
    return () => clearTimeout(t)
  }, [notice])

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
    setRole(next)
    onRoleChange?.(next)
    try {
      await persistRole(next, prev)
      setNotice({ kind: 'saved', prevRole: prev, nextRole: next })
    } catch (err) {
      setRole(prev)
      onRoleChange?.(prev)
      setNotice({ kind: 'error', message: (err as Error).message })
    }
  }

  async function handleUndo() {
    if (!notice || notice.kind !== 'saved') return
    const { prevRole, nextRole } = notice
    const target = prevRole
    setRole(target)
    onRoleChange?.(target)
    setNotice(null)
    try {
      await persistRole(target, nextRole)
      setNotice({ kind: 'reverted' })
    } catch (err) {
      // Revert failed — restore the saved state so DB and UI agree.
      setRole(nextRole)
      onRoleChange?.(nextRole)
      setNotice({ kind: 'error', message: (err as Error).message })
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

  return (
    <span
      ref={wrapRef}
      className="role-popover"
      onClick={(e) => {
        if (stopRowPropagation) e.stopPropagation()
      }}
    >
      <button
        type="button"
        className={triggerClass}
        onClick={(e) => {
          if (stopRowPropagation) e.stopPropagation()
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
                if (stopRowPropagation) e.stopPropagation()
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
              if (stopRowPropagation) e.stopPropagation()
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
              if (stopRowPropagation) e.stopPropagation()
              handleUnlinkItemClick()
            }}
          >
            Unlink from Brand <span className="check">→</span>
          </button>
        </div>
      ) : null}

      {notice ? (
        <span className={`role-popover-notice is-${notice.kind}`} role="status">
          {notice.kind === 'saved' ? (
            <>
              Saved · {notice.nextRole ?? 'No role'}{' '}
              <button
                type="button"
                className="row-action-pill"
                onClick={(e) => {
                  if (stopRowPropagation) e.stopPropagation()
                  handleUndo()
                }}
              >
                ↺ Undo
              </button>
            </>
          ) : notice.kind === 'reverted' ? (
            <>↺ Reverted</>
          ) : (
            <>⚠ {notice.message}</>
          )}
        </span>
      ) : null}
    </span>
  )
}
