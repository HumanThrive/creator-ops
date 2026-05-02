'use client'

import { useState } from 'react'
import { AddPitchModal } from './AddPitchModal'

export function AddPitchTrigger() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded bg-black px-3 py-1.5 text-sm font-medium text-white"
      >
        Add Pitch
      </button>
      {open && <AddPitchModal onClose={() => setOpen(false)} />}
    </>
  )
}
