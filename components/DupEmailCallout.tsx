'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CombineLauncher } from '@/components/CombineLauncher'
import { findContactByPrimaryEmail } from '@/lib/load-merge-inputs'

// FR-8 S4 (slice #78) — DupEmailCallout per spec Delta 5.
// Inline accent-bordered callout that surfaces on save (NOT on blur per Delta 5
// "don't harass the user mid-typing") when /api/contacts/update returns
// 'primary_email_collision' (HTTP 409 on the partial UNIQUE
// contacts_user_primary_email_uniq index).
//
// FR-9 #83 (2026-06-02): "Combine into the existing Contact" wires to the real
// CombineLauncher when editingContactId is set (EDIT flow).
//
// Smoke iteration 2026-06-02 (Founder direction, §2.3-2.5): CREATE flow no
// longer falls back to FR9PlaceholderModal — instead, the primary CTA becomes
// "Open <owner-name> Contact" and routes to the email-owner's
// /app/people/[slug-or-id] page. From there the user can run Combine via
// the EDIT-flow surfaces if they decide that's the right move. The eager
// owner lookup powers the button label rendering ("Open <name> Contact"
// rather than the bare "Open Contact").

type Owner = { id: string; slug: string | null; display_name: string | null }

interface DupEmailCalloutProps {
  email: string
  // EDIT flow: the existing Contact being edited that hit the email collision.
  // CREATE flow (NewContactModal): undefined — the new contact doesn't exist
  // as a row yet, so merge can't seat the loser side. CTA navigates to the
  // email-owner's contact page instead (per Founder direction 2026-06-02).
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
  const router = useRouter()
  const isCreateFlow = !editingContactId

  // CREATE flow — eager-lookup the owner on mount so the button label can
  // render "Open <name> Contact" on first paint. EDIT flow defers the lookup
  // to button click (existing behavior — owner data only needed for the
  // CombineLauncher mount payload).
  const [owner, setOwner] = useState<Owner | null>(null)
  const [ownerLoaded, setOwnerLoaded] = useState(false)

  useEffect(() => {
    if (!isCreateFlow) return
    let cancelled = false
    findContactByPrimaryEmail(email).then((result) => {
      if (cancelled) return
      setOwner(result)
      setOwnerLoaded(true)
    })
    return () => {
      cancelled = true
    }
  }, [email, isCreateFlow])

  // EDIT flow — launcher mount state + click-time lookup.
  const [launcherKeeperId, setLauncherKeeperId] = useState<string | null>(null)
  const [resolvingEdit, setResolvingEdit] = useState(false)

  async function onEditCombineClick() {
    setResolvingEdit(true)
    const result = await findContactByPrimaryEmail(email)
    setResolvingEdit(false)
    if (!result) {
      // Race condition: owner contact was deleted between the 409 and the
      // Combine click. Dismiss + let user retry the save (now unblocked).
      console.warn('DupEmailCallout: no email owner found for', email)
      onDismiss()
      return
    }
    setLauncherKeeperId(result.id)
  }

  function onOpenOwnerClick() {
    if (!owner) {
      // Race: owner row was deleted between the 409 and the click.
      console.warn('DupEmailCallout: owner missing at navigate time')
      onDismiss()
      return
    }
    router.push(`/app/people/${owner.slug || owner.id}`)
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
        {isCreateFlow ? (
          // CREATE flow: stacked + centered. Primary CTA = "Open <name> Contact"
          // (eager-lookup owner; navigates to /app/people/[slug-or-id]).
          // Secondary = "Use a different email" on its own line.
          <div className="dup-email-callout-actions is-stacked">
            <button
              type="button"
              className="btn-pill"
              onClick={onOpenOwnerClick}
              disabled={!ownerLoaded}
            >
              {!ownerLoaded
                ? 'Looking up…'
                : `Open ${owner?.display_name ?? 'the existing'} Contact`}
            </button>
            <button
              type="button"
              className="row-action-pill"
              onClick={onDismiss}
            >
              Use a different email
            </button>
          </div>
        ) : (
          // EDIT flow: inline horizontal (existing behavior).
          <div className="dup-email-callout-actions">
            <button
              type="button"
              className="btn-pill"
              onClick={onEditCombineClick}
              disabled={resolvingEdit}
            >
              {resolvingEdit ? 'Looking up…' : 'Combine into the existing Contact'}
            </button>
            <button
              type="button"
              className="row-action-pill"
              onClick={onDismiss}
            >
              Use a different email
            </button>
          </div>
        )}
        <span className="dup-email-callout-sub">
          Save blocked · duplicate Primary Email
        </span>
      </div>
      {launcherKeeperId && editingContactId ? (
        <CombineLauncher
          knownContactId={editingContactId}
          knownContactName={editingContactName ?? '(this Contact)'}
          preselectedKeeperId={launcherKeeperId}
          onClose={() => setLauncherKeeperId(null)}
        />
      ) : null}
    </>
  )
}
