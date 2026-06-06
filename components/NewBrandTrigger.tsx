'use client'

import { useState } from 'react'
import { NewBrandModal } from '@/components/NewBrandModal'

// FR-11 #90 (Story 1) — the "+ New Brand" affordance. Ghost pill in the
// brands-list tools row (+ the brands empty state); opens NewBrandModal.
// Mirror of NewContactTrigger / AddPitchTrigger.

interface NewBrandTriggerProps {
  className?: string
  label?: string
}

export function NewBrandTrigger({
  className = 'btn-pill is-ghost',
  label = '+ New Brand',
}: NewBrandTriggerProps) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {label}
      </button>
      {open && <NewBrandModal onClose={() => setOpen(false)} />}
    </>
  )
}
