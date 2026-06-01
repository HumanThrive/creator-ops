'use client'

import { useState } from 'react'
import { NewContactModal } from '@/components/NewContactModal'

// FR-8 S2 (slice #79) — small client-side trigger for the New Contact modal.
// Used by both:
//   - PeopleList section-head '+ New Contact' affordance
//   - PeopleEmptyState CTA on /app/people when zero contacts exist
//
// Keeps modal-open state local to the trigger so the surrounding server
// components don't need 'use client'.

interface NewContactTriggerProps {
  className?: string  // 'section-action' on PeopleList; 'btn-pill' on empty state
  label?: string
}

export function NewContactTrigger({
  className = 'section-action',
  label = '+ New Contact',
}: NewContactTriggerProps) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => setOpen(true)}
      >
        {label}
      </button>
      {open ? <NewContactModal onClose={() => setOpen(false)} /> : null}
    </>
  )
}
