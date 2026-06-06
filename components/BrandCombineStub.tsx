'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import type { ExistingBrand } from '@/components/DupBrandCallout'

// FR-11 #90 (design Ask 05 stub) — the Combine "coming soon" modal. Brand Combine
// (FR-10) isn't built; this is the graceful placeholder the dup-name callout +
// (later) the delete-blocked path-card open. Reads as "a path exists, just not
// yet" — never a broken link. Mirror of FR-8's FR9PlaceholderModal, richer per
// the design (Coming-soon tag + a preview of what Combine will do + live exits).

interface BrandCombineStubProps {
  existing: ExistingBrand
  onClose: () => void
}

export function BrandCombineStub({ existing, onClose }: BrandCombineStubProps) {
  const router = useRouter()
  const canOpen = existing.id !== ''

  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      if (ev.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="pitch-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="modal-card brand-combine-stub" role="dialog" aria-modal="true">
        <header className="modal-band">
          <span className="modal-band-l">Combine brands</span>
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
          <div className="stub-card">
            <span className="stub-tag">Coming soon</span>
            <h3 className="stub-h">
              Combine isn&rsquo;t ready yet<span className="dot">.</span>
            </h3>
            <p className="stub-p">
              Merging two brands &mdash; folding all pitches, deals and contacts
              into one keeper record &mdash; lands in a <b>later pass</b>. We
              didn&rsquo;t want to fake it. For now, give this brand a different
              name{canOpen ? <>, or open the existing <b>{existing.name}</b> and add your pitch there</> : null}.
            </p>
          </div>
          <div className="change-block">
            <span className="change-block-h">When it ships, Combine will</span>
            <span className="change-row">
              Move every pitch onto the <b>keeper</b> brand
            </span>
            <span className="change-row">
              Re-link contacts &amp; deals · keep all history
            </span>
            <span className="change-row">
              Retire the duplicate, leaving one clean record
            </span>
          </div>
        </div>

        <footer className="modal-foot">
          <span className="modal-foot-help">We&rsquo;ll notify you when it&rsquo;s live</span>
          <div style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
            {canOpen ? (
              <button
                type="button"
                className="btn-pill is-ghost"
                onClick={() =>
                  router.push(`/app/brands/${existing.slug ?? existing.id}`)
                }
              >
                Open {existing.name} →
              </button>
            ) : null}
            <button type="button" className="btn-pill" onClick={onClose}>
              Got it
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
