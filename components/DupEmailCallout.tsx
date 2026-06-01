'use client'

import { useState } from 'react'
import { FR9PlaceholderModal } from '@/components/FR9PlaceholderModal'

// FR-8 S4 (slice #78) — DupEmailCallout per spec Delta 5.
// Inline accent-bordered callout that surfaces on save (NOT on blur per Delta 5
// "don't harass the user mid-typing") when /api/contacts/update returns
// 'primary_email_collision' (HTTP 409 on the partial UNIQUE
// contacts_user_primary_email_uniq index).
//
// v1 ships callout with merge-path + use-different-email path. The link-card
// to the other Contact (avatar + name + role + brand-chain + Open →) is
// deferred to v1.1 since it requires an extra fetch to identify the other
// contact by Primary Email lookup.

interface DupEmailCalloutProps {
  email: string
  onDismiss: () => void  // user clicks "Use a different email" → revert UI
}

export function DupEmailCallout({ email, onDismiss }: DupEmailCalloutProps) {
  const [fr9Open, setFr9Open] = useState(false)

  return (
    <>
      <div className="dup-email-callout" role="alert">
        <div className="dup-email-callout-head">
          <span className="dup-email-callout-kicker">
            That email already belongs to a Contact
          </span>
          <button
            type="button"
            className="dup-email-callout-close"
            onClick={onDismiss}
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
        <p className="dup-email-callout-p">
          <b>{email}</b> is already the Primary Email on another Contact in
          your directory. The most common cause is a misspelled name across
          two pitches — they&rsquo;re the same person, recorded twice.
        </p>
        <div className="dup-email-callout-actions">
          <button
            type="button"
            className="btn-pill"
            onClick={() => setFr9Open(true)}
          >
            Combine into the existing Contact
          </button>
          <button
            type="button"
            className="row-action-pill"
            onClick={onDismiss}
          >
            Use a different email
          </button>
        </div>
        <span className="dup-email-callout-sub">
          Save blocked · duplicate Primary Email
        </span>
      </div>
      {fr9Open ? <FR9PlaceholderModal onClose={() => setFr9Open(false)} /> : null}
    </>
  )
}
