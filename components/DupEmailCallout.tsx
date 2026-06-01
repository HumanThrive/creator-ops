'use client'

import { useState } from 'react'
import { FR9PlaceholderModal } from '@/components/FR9PlaceholderModal'
import { CombineLauncher } from '@/components/CombineLauncher'
import { findContactByPrimaryEmail } from '@/lib/load-merge-inputs'

// FR-8 S4 (slice #78) — DupEmailCallout per spec Delta 5.
// Inline accent-bordered callout that surfaces on save (NOT on blur per Delta 5
// "don't harass the user mid-typing") when /api/contacts/update returns
// 'primary_email_collision' (HTTP 409 on the partial UNIQUE
// contacts_user_primary_email_uniq index).
//
// FR-9 #83 (2026-06-02): "Combine into the existing Contact" wires to the
// real CombineLauncher when editingContactId is set (EDIT flow). When
// editingContactId is undefined (CREATE flow — new contact not yet persisted,
// no row to merge), the Combine button falls back to the FR9PlaceholderModal
// with a "save flow doesn't support Combine" message. Save first, then merge
// from the existing-contact's surface.

interface DupEmailCalloutProps {
  email: string
  // EDIT flow: the existing Contact being edited that hit the email collision.
  // CREATE flow (NewContactModal): undefined — the new contact doesn't exist
  // as a row yet, so merge can't seat the loser side. Combine button shows
  // a placeholder routing the user to fix the email separately.
  editingContactId?: string
  editingContactName?: string
  onDismiss: () => void
}

export function DupEmailCallout({
  email,
  editingContactId,
  editingContactName,
  onDismiss,
}: DupEmailCalloutProps) {
  // Two modes: 'launcher' opens CombineLauncher (EDIT flow); 'placeholder' opens
  // the FR9PlaceholderModal (CREATE flow — no editing row to seat the loser).
  const [combineMode, setCombineMode] = useState<
    null | { kind: 'launcher'; keeperId: string } | { kind: 'placeholder' }
  >(null)
  const [resolving, setResolving] = useState(false)

  async function onCombineClick() {
    if (!editingContactId) {
      // CREATE flow — no DB row for the "duplicate" side; surface the
      // placeholder. The save-first guidance lives in FR9PlaceholderModal copy
      // for now; future polish replaces with creator-native "open <owner>"
      // routing.
      setCombineMode({ kind: 'placeholder' })
      return
    }
    setResolving(true)
    const owner = await findContactByPrimaryEmail(email)
    setResolving(false)
    if (!owner) {
      // Race condition: owner contact was deleted between the 409 and the
      // Combine click. Dismiss + let user retry the save (now unblocked).
      console.warn('DupEmailCallout: no email owner found for', email)
      onDismiss()
      return
    }
    setCombineMode({ kind: 'launcher', keeperId: owner.id })
  }

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
            onClick={onCombineClick}
            disabled={resolving}
          >
            {resolving ? 'Looking up…' : 'Combine into the existing Contact'}
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
      {combineMode?.kind === 'launcher' && editingContactId ? (
        <CombineLauncher
          knownContactId={editingContactId}
          knownContactName={editingContactName ?? '(this Contact)'}
          preselectedKeeperId={combineMode.keeperId}
          onClose={() => setCombineMode(null)}
        />
      ) : null}
      {combineMode?.kind === 'placeholder' ? (
        <FR9PlaceholderModal onClose={() => setCombineMode(null)} />
      ) : null}
    </>
  )
}
