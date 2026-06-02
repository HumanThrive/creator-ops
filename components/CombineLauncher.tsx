'use client'

// CombineLauncher — owns the "load merge inputs + open CombineWizard + commit
// + post-success nav" lifecycle. Mounted by entry points (DupEmailCallout,
// DeleteBlockedModal "Combine duplicates" path-card, /app/people select-two).
// Keeps CombineWizard pure UI; this layer carries the integration glue.
//
// FR-9 #83. Replaces FR9PlaceholderModal at the two FR-8 stub mount sites.
//
// Behavior per entry point:
//   - preselectedKeeperId set       → skip picker; jump straight to loading
//                                     both contacts' graphs + mount wizard
//                                     (DupEmailCallout: keeper = email-owner)
//   - preselectedKeeperId null      → render typeahead picker first; user
//                                     selects the OTHER contact to combine
//                                     with the knownContact; default keeper =
//                                     the picked other per AC1.2 (the known
//                                     is the blocked Contact = loser).
//
// Spec: workspace/build-requests/FR-9-contact-merge.md
//   AC1.1 (DupEmailCallout entry; defaultSurvivor='survivor' = email-owner)
//   AC1.2 (DeleteBlockedModal entry; defaultSurvivor='survivor' = picked-other)
//   AC1.4 (fresh-read at wizard-open)
//   AC3.5 (post-success nav to /app/people/[survivor.slug])
//   AC3.6 (commit error surface)

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { CombineWizard } from '@/components/CombineWizard'
import {
  loadMergeInputs,
  searchContactsByName,
  type ContactSearchHit,
} from '@/lib/load-merge-inputs'
import type { MergeInputs, MergePayload } from '@/lib/contact-merge'

export interface CombineLauncherProps {
  // The contact known at launch time. Always the LOSER in the eventual merge
  // (per AC1.1: editing-contact-that-hit-collision is loser, email-owner is
  // keeper; AC1.2: blocked Contact is loser, picked-other is keeper).
  knownContactId: string
  knownContactName: string
  // If set, the other contact is pre-known (DupEmailCallout case). When null,
  // user picks via typeahead first.
  preselectedKeeperId: string | null
  onClose: () => void
}

type Phase =
  | { kind: 'picking' } // user picks via typeahead (only when preselectedKeeperId is null)
  | { kind: 'loading'; keeperId: string } // loading both contacts' graphs
  | { kind: 'ready'; inputs: MergeInputs } // wizard mounted
  | { kind: 'error'; message: string } // load failure

export function CombineLauncher(props: CombineLauncherProps) {
  const { knownContactId, knownContactName, preselectedKeeperId, onClose } = props
  const router = useRouter()

  const [phase, setPhase] = useState<Phase>(() =>
    preselectedKeeperId
      ? { kind: 'loading', keeperId: preselectedKeeperId }
      : { kind: 'picking' },
  )

  // Loader effect — fires whenever phase enters 'loading' state.
  useEffect(() => {
    if (phase.kind !== 'loading') return
    let cancelled = false
    // survivor = keeper (picked-other or email-owner); loser = knownContact.
    loadMergeInputs(phase.keeperId, knownContactId)
      .then((inputs) => {
        if (cancelled) return
        setPhase({ kind: 'ready', inputs })
      })
      .catch((err: Error) => {
        if (cancelled) return
        console.error('CombineLauncher: loadMergeInputs failed', err)
        setPhase({
          kind: 'error',
          message: err.message || 'Failed to load contact data',
        })
      })
    return () => {
      cancelled = true
    }
  }, [phase, knownContactId])

  // Commit handler — called by CombineWizard on Combine confirm. Wraps the
  // merge_contacts plpgsql RPC and surfaces success/error back to the wizard.
  const onCommit = useCallback(
    async (payload: MergePayload): Promise<{ success: true } | { success: false; error: string }> => {
      const supabase = createClient()
      const { error } = await supabase.rpc('merge_contacts', {
        p_survivor_id: payload.p_survivor_id,
        p_loser_id: payload.p_loser_id,
        p_display_name: payload.p_display_name,
        p_channels: payload.p_channels,
        p_brand_resolutions: payload.p_brand_resolutions,
      })
      if (error) {
        // Map the most common server-side failure modes to creator-native copy.
        // 23505 unique_violation surfaces when the resolved Primary Email
        // collides with a THIRD contact (created between wizard-open and
        // commit); user can fix by picking a different Primary or aborting
        // and re-doing on the third contact's pair.
        const message = error.message.includes('contacts_user_primary_email_uniq')
          ? 'Primary Email is already in use by another contact'
          : error.message
        return { success: false, error: message }
      }
      return { success: true }
    },
    [],
  )

  // Cancel-shape close: ESC / backdrop / Cancel button / ✕ — does NOT navigate.
  // User stays on whatever surface they came from (DupEmailCallout's parent
  // detail page, DeleteBlockedModal's contact detail page, /app/people).
  // Smoke fix 2026-06-02 §1 "Cancel button bug" — prior version navigated to
  // survivor on every close regardless of commit status.
  const onWizardClose = useCallback(() => {
    onClose()
  }, [onClose])

  // Success-shape close: Step 4 Done "Open <keeper> →" only. Navigates to
  // survivor's /app/people page (AC3.5) + refreshes. Survivor's slug isn't
  // in the wizard-side state, so we navigate by id — the [person]/page.tsx
  // route handles uuid + slug lookups equally (per FR-8 slug-routing).
  const onWizardSuccessClose = useCallback(() => {
    if (phase.kind === 'ready') {
      router.push(`/app/people/${phase.inputs.survivor.id}`)
      router.refresh()
    }
    onClose()
  }, [phase, router, onClose])

  if (phase.kind === 'picking') {
    return (
      <PickOther
        knownContactId={knownContactId}
        knownContactName={knownContactName}
        onPick={(hit) => setPhase({ kind: 'loading', keeperId: hit.id })}
        onCancel={onClose}
      />
    )
  }

  if (phase.kind === 'loading') {
    return <LoadingShell onClose={onClose} />
  }

  if (phase.kind === 'error') {
    return <ErrorShell message={phase.message} onClose={onClose} />
  }

  // ready
  return (
    <CombineWizard
      inputs={phase.inputs}
      defaultSurvivor="survivor"
      onClose={onWizardClose}
      onSuccessClose={onWizardSuccessClose}
      onCommit={onCommit}
    />
  )
}

// ============================================================================
// PickOther — typeahead step for the DeleteBlockedModal entry point
// ============================================================================

interface PickOtherProps {
  knownContactId: string
  knownContactName: string
  onPick: (hit: ContactSearchHit) => void
  onCancel: () => void
}

function PickOther(p: PickOtherProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ContactSearchHit[]>([])
  const [searching, setSearching] = useState(false)

  // Debounced search — fires after 220ms of input idle to avoid hammering DB.
  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      return
    }
    setSearching(true)
    const handle = setTimeout(() => {
      searchContactsByName(query, p.knownContactId)
        .then((hits) => setResults(hits))
        .finally(() => setSearching(false))
    }, 220)
    return () => clearTimeout(handle)
  }, [query, p.knownContactId])

  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      if (ev.key === 'Escape') p.onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [p])

  return (
    <div
      className="pitch-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) p.onCancel()
      }}
    >
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-label="Pick the duplicate to combine with"
      >
        <header className="modal-band">
          <span className="modal-band-l">Pick the duplicate</span>
          <button
            type="button"
            className="pitch-modal-close"
            onClick={p.onCancel}
            aria-label="Close"
          >
            ✕
          </button>
        </header>
        <div className="modal-body">
          <h2 className="modal-h">
            Find the other <b>{p.knownContactName}</b>
            <span className="dot">.</span>
          </h2>
          <p className="modal-p">
            Search by name. Pick the Contact you want to combine{' '}
            {p.knownContactName} with — the one with the correct spelling, the
            other half of the typo.
          </p>
          <div className="modal-field">
            <input
              type="text"
              className="modal-field-input"
              autoFocus
              placeholder="Start typing a name…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ minHeight: 'unset' }}
            />
          </div>
          {searching && (
            <p className="modal-p" style={{ color: 'var(--ink-4)' }}>
              Searching…
            </p>
          )}
          {!searching && query.trim() && results.length === 0 && (
            <p className="modal-p" style={{ color: 'var(--ink-4)' }}>
              No matches. Try a different spelling, or close and end a brand
              link instead.
            </p>
          )}
          {results.length > 0 && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                marginTop: 4,
              }}
            >
              {results.map((hit) => (
                <button
                  key={hit.id}
                  type="button"
                  className="path-card"
                  onClick={() => p.onPick(hit)}
                >
                  <span className="path-card-h">
                    {hit.display_name ?? '(no name)'}
                  </span>
                  <span className="path-card-p">
                    {hit.primary_email ?? 'no email on file'}
                    {hit.slug && (
                      <span style={{ color: 'var(--ink-4)', marginLeft: 8 }}>
                        /{hit.slug}
                      </span>
                    )}
                  </span>
                  <span className="path-card-cta">Pick →</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <footer className="modal-foot">
          <span className="modal-foot-help">
            Pick one to continue
          </span>
          <button type="button" className="btn-ghost" onClick={p.onCancel}>
            Cancel
          </button>
        </footer>
      </div>
    </div>
  )
}

// ============================================================================
// LoadingShell — brief loading state while merge inputs are fetched
// ============================================================================

function LoadingShell({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="pitch-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="modal-card" role="dialog" aria-modal="true">
        <header className="modal-band">
          <span className="modal-band-l">Combine Contacts</span>
        </header>
        <div className="modal-body">
          <p className="modal-p" style={{ color: 'var(--ink-3)' }}>
            Loading both contacts&rsquo; records…
          </p>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// ErrorShell — surfaces a load failure with a Close action
// ============================================================================

function ErrorShell({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div
      className="pitch-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="modal-card" role="dialog" aria-modal="true">
        <header className="modal-band">
          <span className="modal-band-l">Combine Contacts</span>
          <button
            type="button"
            className="pitch-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </header>
        <div className="modal-body">
          <h2 className="modal-h">
            Couldn&rsquo;t load contact data<span className="dot">.</span>
          </h2>
          <p className="modal-p">{message}</p>
          <p className="modal-p" style={{ color: 'var(--ink-3)' }}>
            Try again in a moment. If it persists, the contact records may
            have changed in another tab — refresh the page and re-try.
          </p>
        </div>
        <footer className="modal-foot">
          <span className="modal-foot-help">Load failed</span>
          <button type="button" className="btn-pill" onClick={onClose}>
            Close
          </button>
        </footer>
      </div>
    </div>
  )
}
