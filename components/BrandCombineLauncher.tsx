'use client'

// BrandCombineLauncher — owns the "load merge inputs → open BrandCombineWizard →
// commit via merge_brands RPC → post-success nav" lifecycle for Brand Combine.
// Brand-axis fork of CombineLauncher (FR-9 #83). Keeps the wizard pure UI; this
// layer is the integration glue. Mounted by the four FR-10 entry points.
//
// Seed shapes (FR-10 Story 1 + Story 4):
//   - pair  — both brands known up front → jump straight to loading both graphs.
//             · rename-collision: survivor = name-owner, loser = renamed (AC1.1)
//             · select-two: survivor = more-pitches, loser = the other (AC1.4)
//   - pick  — one brand known + typeahead for the other.
//             · delete-block: known = blocked brand (loser); pick the survivor (AC1.2)
//             · create-collision: known = existing brand (survivor); pick the
//               loser dupe — "Combine into ⟨existing⟩" (AC1.3)
//
// The loader always orders survivorId first, so the wizard's defaultSurvivor is
// always 'survivor'. Commit goes through the browser supabase client calling the
// SECURITY INVOKER merge_brands RPC directly (RLS-safe; no API route — FR-9 pattern).

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { BrandCombineWizard } from '@/components/BrandCombineWizard'
import {
  loadBrandMergeInputs,
  searchBrandsByName,
  type BrandSearchHit,
} from '@/lib/load-brand-merge-inputs'
import type { BrandMergeInputs, BrandMergePayload } from '@/lib/brand-merge'

export type BrandCombineSeed =
  | { mode: 'pair'; survivorId: string; loserId: string }
  | {
      mode: 'pick'
      knownId: string
      knownName: string
      // Whether the known brand is the survivor ("Combine into ⟨known⟩",
      // create-collision) or the loser (delete-block).
      knownRole: 'survivor' | 'loser'
    }

export interface BrandCombineLauncherProps {
  seed: BrandCombineSeed
  onClose: () => void
}

type Phase =
  | { kind: 'picking' }
  | { kind: 'loading'; survivorId: string; loserId: string }
  | { kind: 'ready'; inputs: BrandMergeInputs }
  | { kind: 'error'; message: string }

export function BrandCombineLauncher({ seed, onClose }: BrandCombineLauncherProps) {
  const router = useRouter()

  const [phase, setPhase] = useState<Phase>(() =>
    seed.mode === 'pair'
      ? { kind: 'loading', survivorId: seed.survivorId, loserId: seed.loserId }
      : { kind: 'picking' },
  )

  // Loader effect — fires whenever phase enters 'loading'.
  useEffect(() => {
    if (phase.kind !== 'loading') return
    let cancelled = false
    loadBrandMergeInputs(phase.survivorId, phase.loserId)
      .then((inputs) => {
        if (!cancelled) setPhase({ kind: 'ready', inputs })
      })
      .catch((err: Error) => {
        if (cancelled) return
        console.error('BrandCombineLauncher: loadBrandMergeInputs failed', err)
        setPhase({
          kind: 'error',
          message: err.message || 'Failed to load brand data',
        })
      })
    return () => {
      cancelled = true
    }
  }, [phase])

  // Typeahead pick → loading. survivor/loser derived from the known brand's role.
  const onPick = useCallback(
    (hit: BrandSearchHit) => {
      if (seed.mode !== 'pick') return
      const survivorId = seed.knownRole === 'survivor' ? seed.knownId : hit.id
      const loserId = seed.knownRole === 'survivor' ? hit.id : seed.knownId
      setPhase({ kind: 'loading', survivorId, loserId })
    },
    [seed],
  )

  // Commit — the merge_brands plpgsql RPC. 23505 on the brand-name UNIQUE means
  // a THIRD brand grabbed the resolved name between wizard-open and commit.
  const onCommit = useCallback(
    async (
      payload: BrandMergePayload,
    ): Promise<{ success: true } | { success: false; error: string }> => {
      const supabase = createClient()
      const { error } = await supabase.rpc('merge_brands', {
        p_survivor_id: payload.p_survivor_id,
        p_loser_id: payload.p_loser_id,
        p_name: payload.p_name,
        p_contact_resolutions: payload.p_contact_resolutions,
      })
      if (error) {
        const message = error.message.includes('brands_user_lower_name_uniq')
          ? 'That name is already used by another brand'
          : error.message
        return { success: false, error: message }
      }
      return { success: true }
    },
    [],
  )

  const onWizardClose = useCallback(() => onClose(), [onClose])

  // Success-close: land on the survivor's /app/brands page (AC3.5) + refresh.
  const onWizardSuccessClose = useCallback(() => {
    if (phase.kind === 'ready') {
      const s = phase.inputs.survivor
      router.push(`/app/brands/${s.slug || s.id}`)
      router.refresh()
    }
    onClose()
  }, [phase, router, onClose])

  if (phase.kind === 'picking') {
    if (seed.mode !== 'pick') return null
    return (
      <PickOther
        knownId={seed.knownId}
        knownName={seed.knownName}
        onPick={onPick}
        onCancel={onClose}
      />
    )
  }
  if (phase.kind === 'loading') return <LoadingShell onClose={onClose} />
  if (phase.kind === 'error')
    return <ErrorShell message={phase.message} onClose={onClose} />

  return (
    <BrandCombineWizard
      inputs={phase.inputs}
      defaultSurvivor="survivor"
      onClose={onWizardClose}
      onSuccessClose={onWizardSuccessClose}
      onCommit={onCommit}
    />
  )
}

// ============================================================================
// PickOther — typeahead step (delete-block + create-collision entries)
// ============================================================================

function PickOther(p: {
  knownId: string
  knownName: string
  onPick: (hit: BrandSearchHit) => void
  onCancel: () => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<BrandSearchHit[]>([])
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    const q = query.trim()
    if (!q) return // nothing to search; visibleResults derives to [] below
    // All setState lives inside the debounce callback (not the effect body) so
    // the effect holds no synchronous setState (react-hooks/set-state-in-effect).
    const handle = setTimeout(() => {
      setSearching(true)
      searchBrandsByName(q, p.knownId)
        .then((hits) => setResults(hits))
        .finally(() => setSearching(false))
    }, 220)
    return () => clearTimeout(handle)
  }, [query, p.knownId])

  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      if (ev.key === 'Escape') p.onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [p])

  // Derive (don't store) the empty-query case so the search effect holds no
  // synchronous setState (react-hooks/set-state-in-effect).
  const visibleResults = query.trim() ? results : []

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
        aria-label="Pick the duplicate brand to combine with"
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
            Find the other <b>{p.knownName}</b>
            <span className="dot">.</span>
          </h2>
          <p className="modal-p">
            Search your brands by name. Pick the duplicate you want to combine
            with {p.knownName} — the two will fold into one.
          </p>
          <div className="modal-field">
            <input
              type="text"
              className="modal-field-input"
              autoFocus
              placeholder="Start typing a brand name…"
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
          {!searching && query.trim() && visibleResults.length === 0 && (
            <p className="modal-p" style={{ color: 'var(--ink-4)' }}>
              No other brands match. Try a different spelling.
            </p>
          )}
          {visibleResults.length > 0 && (
            <div
              style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}
            >
              {visibleResults.map((hit) => (
                <button
                  key={hit.id}
                  type="button"
                  className="path-card"
                  onClick={() => p.onPick(hit)}
                >
                  <span className="path-card-h">{hit.name}</span>
                  <span className="path-card-p">
                    {hit.slug ? `/${hit.slug}` : 'routes by id'}
                  </span>
                  <span className="path-card-cta">Pick →</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <footer className="modal-foot">
          <span className="modal-foot-help">Pick one to continue</span>
          <button type="button" className="btn-ghost" onClick={p.onCancel}>
            Cancel
          </button>
        </footer>
      </div>
    </div>
  )
}

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
          <span className="modal-band-l">Combine Brands</span>
        </header>
        <div className="modal-body">
          <p className="modal-p" style={{ color: 'var(--ink-3)' }}>
            Loading both brands&rsquo; records…
          </p>
        </div>
      </div>
    </div>
  )
}

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
          <span className="modal-band-l">Combine Brands</span>
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
            Couldn&rsquo;t load brand data<span className="dot">.</span>
          </h2>
          <p className="modal-p">{message}</p>
          <p className="modal-p" style={{ color: 'var(--ink-3)' }}>
            Try again in a moment. If it persists, the brand records may have
            changed in another tab — refresh the page and re-try.
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
