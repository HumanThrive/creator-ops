'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { AddPitchModal } from './AddPitchModal'
import type { PitchDirection } from '@/lib/types/pitch'

export function SplitButton() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [modalDirection, setModalDirection] = useState<PitchDirection | null>(
    null
  )
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const pathname = usePathname()

  useEffect(() => {
    if (!menuOpen) return
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  useEffect(() => {
    setMenuOpen(false)
  }, [pathname])

  function choose(direction: PitchDirection) {
    setMenuOpen(false)
    setModalDirection(direction)
  }

  return (
    <>
      <div className="btn-split" ref={wrapRef}>
        <button
          type="button"
          className="btn-split-main"
          aria-label="Add inbound pitch (default)"
          onClick={() => choose('inbound')}
        >
          <span className="btn-split-main-label">Add pitch</span>
        </button>
        <span className="btn-split-divider" aria-hidden />
        <button
          type="button"
          className="btn-split-caret"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label="Choose pitch direction"
          onClick={(e) => {
            e.stopPropagation()
            setMenuOpen((v) => !v)
          }}
        >
          <span className="btn-split-caret-icon" aria-hidden>
            ▾
          </span>
        </button>
        {menuOpen && (
          <div className="btn-split-menu" role="menu">
            <button
              type="button"
              className="btn-split-menu-item"
              role="menuitem"
              onClick={() => choose('inbound')}
            >
              <span className="dir-arrow" aria-hidden>
                ↘
              </span>
              <span>Add inbound pitch</span>
              <span className="btn-split-menu-item-sub">Brand → you</span>
            </button>
            <button
              type="button"
              className="btn-split-menu-item"
              role="menuitem"
              onClick={() => choose('outbound')}
            >
              <span
                className="dir-arrow"
                aria-hidden
                style={{ color: 'var(--ink)' }}
              >
                ↗
              </span>
              <span>Add outbound pitch</span>
              <span className="btn-split-menu-item-sub">You → brand</span>
            </button>
          </div>
        )}
      </div>
      {modalDirection && (
        <AddPitchModal
          direction={modalDirection}
          onClose={() => setModalDirection(null)}
        />
      )}
    </>
  )
}
