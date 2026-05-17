'use client'

import { useState } from 'react'
import { AddPitchModal } from './AddPitchModal'

interface AddPitchTriggerProps {
  className?: string
  label?: string
}

export function AddPitchTrigger({
  className = 'btn-pill',
  label = 'Add pitch',
}: AddPitchTriggerProps) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {label}
      </button>
      {open && <AddPitchModal onClose={() => setOpen(false)} />}
    </>
  )
}
