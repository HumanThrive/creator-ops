'use client'

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from 'react'
import { useRouter } from 'next/navigation'
import { CombineLauncher } from '@/components/CombineLauncher'
import { UnlinkModal } from '@/components/UnlinkModal'
import { useReducedMotion } from '@/lib/hooks/useReducedMotion'
import type { ContactRole } from '@/lib/types/contact'

// FR-8 S4 (slice #78) — DeleteBlockedModal per spec Delta 5.
// INFORMATIONAL modal — NOT a destructive-confirm. Renders when delete is
// blocked-if-linked (pitch_count > 0). Voice-ladder discipline + brand-stance
// kicker + path-cards layout. NO force-delete escape hatch.
//
// FR-8 #78 smoke-fix 2026-05-31: "End a Brand link" path-card now wires to
// UnlinkModal per spec D5 ("→ Delta 4 unlink modal") for single-active-brand
// contacts (direct fast-path, no picker).
//
// FR-8 Delta 7 (post-ship 2026-05-31 19:49) — multi-brand BRAND-LINK PICKER.
// When the contact has ≥2 active brand-links, the path-card click swaps the
// modal body in-place (Variant A) from path-cards → picker. Animation per
// Claude Design Surface 4b spec — auto-height morph via measure-lock-replace
// -measure-set-release sequence (you cannot transition `height: auto`),
// scoped --s4b-* tokens, forward-only row stagger, focus moves to picker
// heading, reduced-motion → instant swap, re-entrancy guarded.
//
// 10 ACs live in docs/design/design_handoff_fr8_brand_link_picker/README.md.

export type PickerLinkTag = 'is-current' | 'is-home' | 'is-concurrent' | 'is-prior' | null

export interface ActiveBrandLink {
  brand_id: string
  brand_name: string
  pitch_count_for_pair: number
  closed_deal_count?: number
  closed_deal_amount_display?: string | null
  // Picker row data (Delta 7):
  role: ContactRole | null
  last_pitch_at: string | null
  state_tag: PickerLinkTag
}

interface DeleteBlockedModalProps {
  contactId: string
  contactName: string
  pitchCount: number
  brandCount: number
  activeBrandLinks: ActiveBrandLink[]
  onClose: () => void
}

type Phase = 'idle' | 'leaving' | 'entering' | 'settling'
type BodyState = 'paths' | 'picker'

// Animation timing (must mirror --s4b-* tokens in design-system.css)
const LEAVE_MS = 130
const HEIGHT_MS = 280
const HEIGHT_BUFFER_MS = 40

export function DeleteBlockedModal({
  contactId,
  contactName,
  pitchCount,
  brandCount: initialBrandCount,
  activeBrandLinks,
  onClose,
}: DeleteBlockedModalProps) {
  const router = useRouter()
  // FR-9 #83 (2026-06-02) — Combine duplicates path-card opens the real
  // CombineLauncher (typeahead-pick second contact → load merge inputs →
  // mount CombineWizard). Replaces the FR-8-era FR9PlaceholderModal stub.
  // The blocked Contact is always the LOSER per AC1.2; user picks the keeper.
  const [combineOpen, setCombineOpen] = useState(false)
  const [unlinkPair, setUnlinkPair] = useState<ActiveBrandLink | null>(null)

  // Live brand count overrides the prop after each unlink — the prop is a
  // snapshot from the preflight API at modal-open time and goes stale once
  // the user starts ending links. activeBrandLinks is refreshed via
  // router.refresh() on every successful unlink (see onUnlinked below).
  const brandCount = activeBrandLinks.length
  void initialBrandCount  // prop kept for API stability; live value supersedes

  // Body-swap state machine (Delta 7)
  const [bodyState, setBodyState] = useState<BodyState>('paths')
  const [phase, setPhase] = useState<Phase>('idle')
  const swapRef = useRef<HTMLDivElement | null>(null)
  const innerRef = useRef<HTMLDivElement | null>(null)
  const animatingRef = useRef(false)
  const pickerHRef = useRef<HTMLHeadingElement | null>(null)
  const endLinkCardRef = useRef<HTMLButtonElement | null>(null)
  const reduceMotion = useReducedMotion()

  const singleBrand = activeBrandLinks.length === 1 ? activeBrandLinks[0] : null
  const hasActiveLinks = activeBrandLinks.length > 0

  // ESC closes the whole modal (not just the current body state — modal close X owns absolute close)
  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      if (ev.key === 'Escape' && !combineOpen && !unlinkPair && !animatingRef.current) {
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, combineOpen, unlinkPair])

  // Focus management — runs after a body swap settles
  const focusFor = useCallback((next: BodyState) => {
    if (next === 'picker' && pickerHRef.current) {
      pickerHRef.current.focus({ preventScroll: true })
    } else if (next === 'paths' && endLinkCardRef.current) {
      endLinkCardRef.current.focus({ preventScroll: true })
    }
  }, [])

  // Drive the body swap: measure-lock-replace-measure-set-release sequence
  // adapted to React. The vanilla reference is `#s4bDemo` in the Surface 4b
  // stress-test HTML; this is the same machine, React-flavored.
  const requestSwap = useCallback(
    (next: BodyState) => {
      if (animatingRef.current || next === bodyState) return
      if (reduceMotion) {
        setBodyState(next)
        // Focus after the React commit lands (no animation to wait for)
        requestAnimationFrame(() => focusFor(next))
        return
      }
      animatingRef.current = true
      // Lock current height in px so the height transition has a baseline
      if (swapRef.current) {
        const startH = swapRef.current.getBoundingClientRect().height
        swapRef.current.style.height = `${startH}px`
      }
      setPhase('leaving')
      // After --s4b-out: swap React-rendered body + enter the 'entering' phase
      // (which puts the new inner into enter-start state — opacity 0, +10px)
      setTimeout(() => {
        setBodyState(next)
        setPhase('entering')
      }, LEAVE_MS)
    },
    [bodyState, reduceMotion, focusFor],
  )

  // On 'entering' commit: measure target height, force reflow, set the height
  // transition target, then next-frame remove enter-start to fade-in the body.
  //
  // Founder smoke 2026-06-01: measure off the FRESHLY-swapped inner element
  // via getBoundingClientRect (mirrors vanilla reference `#s4bDemo`). The
  // earlier port read `swap.scrollHeight`, which is unreliable when the
  // wrapper has `overflow: hidden` AND a locked-smaller explicit height —
  // some engines return the constrained value (locked height) instead of
  // content extent, which produces a no-op transition in the EXPAND direction
  // (paths → picker). The shrink direction (picker → paths) worked because
  // content fits inside the locked-larger box. Inner's bounding rect has no
  // such ambiguity — it's the element's own layout box.
  useLayoutEffect(() => {
    if (phase !== 'entering' || !swapRef.current || !innerRef.current) return
    const swap = swapRef.current
    const inner = innerRef.current
    const targetH = inner.getBoundingClientRect().height
    // Force reflow on the freshly-mutated subtree so the enter-start state is
    // committed before we transition out of it.
    void inner.offsetHeight
    swap.style.height = `${targetH}px`
    const raf = requestAnimationFrame(() => setPhase('settling'))
    return () => cancelAnimationFrame(raf)
  }, [phase])

  // Auto-swap picker → paths when active brand-links drop below 2 (after a
  // successful unlink refreshed activeBrandLinks via router.refresh). The
  // picker is only meaningful for ≥2 active links; 1 remaining → paths body's
  // single-brand fast-path CTA covers it cleanly; 0 remaining → paths body's
  // "no active brand-link to end" empty state. Founder smoke 2D.13 2026-06-01.
  useEffect(() => {
    if (bodyState !== 'picker') return
    if (activeBrandLinks.length >= 2) return
    if (animatingRef.current) return
    requestSwap('paths')
  }, [bodyState, activeBrandLinks.length, requestSwap])

  // On 'settling' commit: wait HEIGHT_MS + BUFFER, then release height to auto
  // (so later reflows like the >5-row scroll cap behave) + flip phase to idle.
  useLayoutEffect(() => {
    if (phase !== 'settling') return
    const swap = swapRef.current
    const t = setTimeout(() => {
      if (swap) swap.style.height = 'auto'
      setPhase('idle')
      animatingRef.current = false
      focusFor(bodyState)
    }, HEIGHT_MS + HEIGHT_BUFFER_MS)
    return () => clearTimeout(t)
  }, [phase, bodyState, focusFor])

  // Inner CSS classes driven by phase. Mirrors the vanilla CSS state machine:
  //   leaving:   .swap-inner .is-leaving        (fade out + lift -8px)
  //   entering:  .swap-inner .enter .enter-start (primed off-screen)
  //   settling:  .swap-inner .enter              (transitioning to default)
  //   idle:      .swap-inner                     (no transitions)
  const innerClasses = ['swap-inner']
  if (phase === 'leaving') innerClasses.push('is-leaving')
  if (phase === 'entering') innerClasses.push('enter', 'enter-start')
  if (phase === 'settling') innerClasses.push('enter')

  // Action: "End a Brand link" path-card click
  function onEndBrandLinkClick() {
    if (!hasActiveLinks) {
      // No active brand-links — dismiss (history-only contact has no link to end)
      onClose()
      return
    }
    if (singleBrand) {
      // Fast-path per spec D7: 1 active link → skip picker, open UnlinkModal directly
      setUnlinkPair(singleBrand)
      return
    }
    // Multi-brand → swap body to picker
    requestSwap('picker')
  }

  function onPickerRowClick(link: ActiveBrandLink) {
    setUnlinkPair(link)
  }

  function onBackToOptions() {
    requestSwap('paths')
  }

  return (
    <>
      <div
        className="pitch-modal-overlay"
        onClick={(e) => {
          if (e.target === e.currentTarget && !animatingRef.current) onClose()
        }}
      >
        <div
          className="modal-card delete-blocked-modal"
          role="dialog"
          aria-modal="true"
        >
          <header className="modal-band">
            <span className="modal-band-l">
              {/* Adaptive kicker per Founder smoke 2D Case A 2026-06-01 + PL
                  lock (FR-8 Drafting Log 11:52 BKK): name the specific
                  remaining block when the user has cleared every brand-link.
                  Both variants are stance-shaped per Delta 5 voice ladder. */}
              {bodyState === 'paths'
                ? activeBrandLinks.length === 0
                  ? "Can't delete · pitches still anchor this contact"
                  : "Can't delete · history is attached"
                : "Can't delete · history is attached"}
            </span>
            <button
              type="button"
              className="pitch-modal-close"
              onClick={onClose}
              aria-label="Close"
              disabled={phase !== 'idle'}
            >
              ✕
            </button>
          </header>

          {/* SWAP WRAPPER — height-morphing container; React renders bodyState
              inside; phase classes on the inner drive the cross-fade. */}
          <div className="swap" ref={swapRef}>
            <div className={innerClasses.join(' ')} ref={innerRef}>
              {bodyState === 'paths' ? (
                <PathsBody
                  contactName={contactName}
                  pitchCount={pitchCount}
                  brandCount={brandCount}
                  activeLinksCount={activeBrandLinks.length}
                  singleBrand={singleBrand}
                  hasActiveLinks={hasActiveLinks}
                  onCombineClick={() => setCombineOpen(true)}
                  onEndBrandLinkClick={onEndBrandLinkClick}
                  endLinkCardRef={endLinkCardRef}
                />
              ) : (
                <PickerBody
                  contactName={contactName}
                  activeBrandLinks={activeBrandLinks}
                  onRowClick={onPickerRowClick}
                  onBack={onBackToOptions}
                  pickerHRef={pickerHRef}
                  isEntering={phase === 'entering' || phase === 'settling'}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {combineOpen ? (
        <CombineLauncher
          knownContactId={contactId}
          knownContactName={contactName}
          preselectedKeeperId={null}
          onClose={() => setCombineOpen(false)}
        />
      ) : null}
      {unlinkPair ? (
        <UnlinkModal
          contactId={contactId}
          brandId={unlinkPair.brand_id}
          brandName={unlinkPair.brand_name}
          contactName={contactName}
          pitchCountForPair={unlinkPair.pitch_count_for_pair}
          closedDealCount={unlinkPair.closed_deal_count}
          closedDealAmountDisplay={unlinkPair.closed_deal_amount_display}
          onClose={() => setUnlinkPair(null)}
          onUnlinked={() => {
            // Founder smoke 2D.13 2026-06-01: keep DeleteBlockedModal open so
            // the user can resume their delete-contact flow after resolving a
            // brand-link block. Refresh page data (updates the brand-chain on
            // the Contact-detail page AND the activeBrandLinks prop powering
            // the picker rows). The picker/paths auto-swap effect below
            // handles bodyState reconciliation when the active count drops
            // below 2.
            setUnlinkPair(null)
            router.refresh()
          }}
        />
      ) : null}
    </>
  )
}

// ─── Body sub-renders ──────────────────────────────────────────────────

interface PathsBodyProps {
  contactName: string
  pitchCount: number
  brandCount: number
  activeLinksCount: number
  singleBrand: ActiveBrandLink | null
  hasActiveLinks: boolean
  onCombineClick: () => void
  onEndBrandLinkClick: () => void
  endLinkCardRef: RefObject<HTMLButtonElement | null>
}

function PathsBody({
  contactName,
  pitchCount,
  brandCount,
  activeLinksCount,
  singleBrand,
  hasActiveLinks,
  onCombineClick,
  onEndBrandLinkClick,
  endLinkCardRef,
}: PathsBodyProps) {
  return (
    <div className="modal-body">
      <h2 className="modal-h">
        {contactName} has{' '}
        <span style={{ color: 'var(--accent)' }}>
          {pitchCount} {pitchCount === 1 ? 'pitch' : 'pitches'}
        </span>{' '}
        on the record<span className="dot">.</span>
      </h2>

      <p className="modal-p">
        <b>SupaSpike won&rsquo;t do that.</b> Deleting the Contact would
        break the link back to every pitch they were on — and the
        relationship history is the thing the CRM is here to remember.
      </p>

      <div className="modal-block">
        <span className="modal-block-h">What&rsquo;s anchoring them</span>
        <ul className="modal-block-list">
          <li>
            <b>
              {pitchCount} {pitchCount === 1 ? 'pitch' : 'pitches'}
            </b>{' '}
            on the record — each one references this Contact via the
            pitch ↔ contact pivot.
          </li>
          {brandCount > 0 ? (
            <li>
              <b>
                {brandCount}{' '}
                {brandCount === 1 ? 'active brand link' : 'active brand links'}
              </b>{' '}
              on the directory — each tells &ldquo;who at which brand&rdquo;
              for future inbound.
            </li>
          ) : null}
        </ul>
      </div>

      {/* "Two ways forward" header + the End-a-link path-card both render only
          when the contact still has active brand-links to end. Once every
          brand-link is cleared (Case A), Combine becomes the sole path-card
          and the singular framing matches singular path. Founder smoke 2D Case
          A 2026-06-01 + PL lock (FR-8 Drafting Log 11:52 BKK). */}
      {hasActiveLinks ? (
        <span className="modal-block-h" style={{ marginTop: 6 }}>
          Two ways forward
        </span>
      ) : null}
      <div className={`path-cards${hasActiveLinks ? '' : ' is-single'}`}>
        <button
          type="button"
          className="path-card is-recommended"
          onClick={onCombineClick}
        >
          <span className="path-card-tag">Recommended</span>
          <span className="path-card-h">Combine duplicates</span>
          <span className="path-card-p">
            If {contactName} is a typo or split-record, merge them into
            the canonical Contact. Pitches and brand-links re-point;
            nothing destroyed.
          </span>
          <span className="path-card-cta">Open merge →</span>
        </button>
        {hasActiveLinks ? (
          <button
            type="button"
            className="path-card"
            ref={endLinkCardRef}
            onClick={onEndBrandLinkClick}
          >
            <span className="path-card-h">End a Brand link</span>
            <span className="path-card-p">
              {singleBrand ? (
                <>
                  Ends {contactName}&rsquo;s link to{' '}
                  <b>{singleBrand.brand_name}</b>. Pitches stay; the link
                  moves to <em>ended</em> with optional reason capture.
                </>
              ) : (
                <>
                  {contactName} is on <b>{activeLinksCount}</b> active
                  brand-links — pick which one to end.
                </>
              )}
            </span>
            <span className="path-card-cta">
              {singleBrand
                ? `End link to ${singleBrand.brand_name} →`
                : 'Pick a brand →'}
            </span>
          </button>
        ) : null}
      </div>

      <div className="blocked-card-foot modal-foot">
        <span className="modal-foot-help">
          SupaSpike doesn&rsquo;t delete history. By design.
        </span>
      </div>
    </div>
  )
}

interface PickerBodyProps {
  contactName: string
  activeBrandLinks: ActiveBrandLink[]
  onRowClick: (link: ActiveBrandLink) => void
  onBack: () => void
  pickerHRef: RefObject<HTMLHeadingElement | null>
  isEntering: boolean
}

// Volume-cap threshold per spec Delta 7: >5 active links → scroll within cap
const SCROLL_CAP_THRESHOLD = 5

function PickerBody({
  contactName,
  activeBrandLinks,
  onRowClick,
  onBack,
  pickerHRef,
  isEntering,
}: PickerBodyProps) {
  const count = activeBrandLinks.length
  const isScrollCapped = count > SCROLL_CAP_THRESHOLD

  const rowsClassList = ['link-rows']
  if (isEntering) rowsClassList.push('is-entering')
  if (isScrollCapped) rowsClassList.push('is-scroll')

  return (
    <div className="modal-body picker-body">
      <div className="picker-head">
        <span className="picker-kicker">End a brand link · pick one</span>
        <h3 className="picker-h" tabIndex={-1} ref={pickerHRef}>
          Pick the brand link to end<span className="dot">.</span>
        </h3>
        <p className="picker-sub">
          {contactName} is linked to <b>{count}</b> active{' '}
          {count === 1 ? 'brand' : 'brands'}. Ending a link removes{' '}
          {contactName} from <b>that</b> brand only — every other link, and
          all its pitch history, stays put.
        </p>
      </div>

      {isScrollCapped ? (
        <span className="picker-scroll-count">
          {count} active links · scroll for all
        </span>
      ) : null}

      <div className={rowsClassList.join(' ')}>
        {activeBrandLinks.map((link) => (
          <LinkRow key={link.brand_id} link={link} onPick={() => onRowClick(link)} />
        ))}
      </div>

      <span className="picker-hint">
        Any link you end can be reactivated later from {contactName}&rsquo;s
        page.
      </span>

      <div className="blocked-card-foot modal-foot picker-foot">
        <button type="button" className="picker-back" onClick={onBack}>
          ← Back to options
        </button>
        <span className="modal-foot-help">
          SupaSpike doesn&rsquo;t delete history. By design.
        </span>
      </div>
    </div>
  )
}

function LinkRow({ link, onPick }: { link: ActiveBrandLink; onPick: () => void }) {
  const rowClass = ['link-row']
  if (link.state_tag === 'is-home') rowClass.push('is-home')

  const tagText: Record<NonNullable<PickerLinkTag>, string> = {
    'is-current': 'Current',
    'is-home': 'Home',
    'is-concurrent': 'Concurrent',
    'is-prior': 'Prior',
  }

  return (
    <button
      type="button"
      className={rowClass.join(' ')}
      onClick={onPick}
      aria-label={`End ${link.brand_name} link`}
    >
      <div className="link-row-avatar">{initial(link.brand_name)}</div>
      <div className="link-row-id">
        <span className="link-row-name-line">
          <span className="link-row-name">{link.brand_name}</span>
          {link.state_tag ? (
            <span className={`link-tag ${link.state_tag}`}>
              {tagText[link.state_tag]}
            </span>
          ) : null}
        </span>
        <span className="link-row-sub">
          {link.role ? (
            <>
              <span className="link-role">{link.role}</span>
              <span className="sep">·</span>
            </>
          ) : null}
          <b>{link.pitch_count_for_pair}</b>{' '}
          {link.pitch_count_for_pair === 1 ? 'pitch' : 'pitches'}
          {link.last_pitch_at ? (
            <>
              <span className="sep">·</span>
              last {formatPickerDate(link.last_pitch_at)}
            </>
          ) : null}
        </span>
      </div>
      <span className="link-row-cta">End link →</span>
    </button>
  )
}

function initial(name: string): string {
  const t = name.trim()
  if (!t) return '·'
  return t.charAt(0).toUpperCase()
}

const SHORT_MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const

function formatPickerDate(iso: string): string {
  const d = new Date(iso)
  const month = SHORT_MONTHS[d.getMonth()]
  return `${month} ${d.getDate()}`
}
