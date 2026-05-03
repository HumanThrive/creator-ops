'use client'

import { useState } from 'react'
import { AddPitchModal } from './AddPitchModal'

interface AddPitchTriggerProps {
  className?: string
  label?: string
}

export function AddPitchTrigger({
  className = 'rounded bg-black px-3 py-1.5 text-sm font-medium text-white',
  label = 'Add Pitch',
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
