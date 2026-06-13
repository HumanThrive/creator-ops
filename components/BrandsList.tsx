'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import type { BrandSummary } from '@/lib/brand-stats'
import type { CurrencyTotal } from '@/lib/pitch-stats'
import { formatCurrencyAmount } from '@/lib/pitch-stats'
import { formatRelativeTime } from '@/lib/format'
import { NewBrandTrigger } from '@/components/NewBrandTrigger'
import { BrandDeleteToast } from '@/components/BrandDeleteToast'
import { BrandCombineLauncher } from '@/components/BrandCombineLauncher'

const PENDING_DELETE_KEY = 'pendingBrandDelete'

type SortMode = 'recent' | 'value'

interface BrandsListProps {
  known: BrandSummary[]
  unknown: BrandSummary | null
  currencyTotals: CurrencyTotal[] // global, for the tools-row "$X TRACKED" line
}

// A picked brand carries everything onCombineClick needs (id + name + pitch
// count for the default-survivor pick) so the click is resilient to a re-sorted
// or re-rendered list — mirror of PeopleList's selection map.
interface SelectedBrand {
  id: string
  name: string
  pitch_count: number
}

function primaryAmount(b: BrandSummary): number {
  return b.currencyTotals[0]?.amount ?? 0
}

function trackedSummary(currencyTotals: CurrencyTotal[]): string | null {
  if (currencyTotals.length === 0) return null
  const [primary, secondary, ...rest] = currencyTotals
  const parts = [`${formatCurrencyAmount(primary.currency, primary.amount)} ${primary.currency}`]
  if (secondary) {
    parts.push(`${formatCurrencyAmount(secondary.currency, secondary.amount)} ${secondary.currency}`)
  }
  if (rest.length > 0) {
    parts.push(`+ ${rest.length} other ${rest.length === 1 ? 'currency' : 'currencies'}`)
  }
  return parts.join(' · ')
}

export function BrandsList({ known, unknown, currencyTotals }: BrandsListProps) {
  const router = useRouter()
  const [sort, setSort] = useState<SortMode>('recent')
  // FR-11 #92 — a clean delete from a detail page hands off here via
  // sessionStorage; hide the row optimistically + mount the 5s Undo toast (which
  // fires the real DELETE, or cancels it on Undo / unmount).
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(
    null,
  )

  // FR-10 #97 — Story 4 proactive select-two (mirrors the /app/people affordance).
  // "Select" flips rows into click-to-toggle; "Combine" enables at exactly two
  // real brands selected (AC-M3 pairwise; the Unknown bucket is never selectable).
  const [selectionMode, setSelectionMode] = useState(false)
  const [selected, setSelected] = useState<Map<string, SelectedBrand>>(
    () => new Map(),
  )
  const [combineOpen, setCombineOpen] = useState<{
    survivorId: string
    loserId: string
  } | null>(null)
  // Names shown in the combine-bar. Captured when exactly two are selected and
  // NOT cleared on drop, so the names persist while the bar animates out.
  const [barPair, setBarPair] = useState<[string, string] | null>(null)

  useEffect(() => {
    const raw = sessionStorage.getItem(PENDING_DELETE_KEY)
    if (!raw) return
    sessionStorage.removeItem(PENDING_DELETE_KEY)
    try {
      const parsed = JSON.parse(raw) as { id: string; name: string }
      // One-shot post-hydration consume of the cross-navigation hand-off. Can't
      // be a lazy useState initializer (sessionStorage is undefined during SSR);
      // fires once on mount, no cascade — the rule's perf concern doesn't apply.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (parsed?.id) setPendingDelete(parsed)
    } catch {
      /* ignore malformed hand-off */
    }
  }, [])

  // Capture the selected pair's names for the combine-bar's exit animation —
  // fires only when selection reaches two; NOT cleared on drop, so the names
  // stay put while the bar slides up. Keyed on `selected` (changes per toggle);
  // one-shot, no cascade.
  useEffect(() => {
    if (selected.size !== 2) return
    const [a, b] = Array.from(selected.values())
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBarPair([a.name, b.name])
  }, [selected])

  const toggleRow = useCallback((brand: BrandSummary) => {
    if (!brand.brand_id) return // Unknown bucket — not a real row
    const id = brand.brand_id
    setSelected((prev) => {
      const next = new Map(prev)
      if (next.has(id)) {
        next.delete(id)
        return next
      }
      if (next.size >= 2) return prev // pairwise cap (AC-M3)
      next.set(id, { id, name: brand.displayName, pitch_count: brand.pitchCount })
      return next
    })
  }, [])

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false)
    setSelected(new Map())
  }, [])

  // AC1.4 — default survivor = the brand with more linked pitches.
  function onCombineClick() {
    if (selected.size !== 2) return
    const [a, b] = Array.from(selected.values())
    const survivor = a.pitch_count >= b.pitch_count ? a : b
    const loser = survivor.id === a.id ? b : a
    setCombineOpen({ survivorId: survivor.id, loserId: loser.id })
  }

  const sortedKnown = [...known].sort((a, b) => {
    if (sort === 'value') {
      const diff = primaryAmount(b) - primaryAmount(a)
      if (diff !== 0) return diff
      return a.lastContactAt < b.lastContactAt ? 1 : -1
    }
    return a.lastContactAt < b.lastContactAt ? 1 : -1
  })

  const visibleKnown = pendingDelete
    ? sortedKnown.filter((b) => b.brand_id !== pendingDelete.id)
    : sortedKnown

  const totalBrandCount = visibleKnown.length + (unknown ? 1 : 0)
  const tracked = trackedSummary(currencyTotals)
  const canSelect = visibleKnown.length >= 2
  const barShown = selectionMode && selected.size === 2

  return (
    <>
      <div className="brands-tools">
        <span className="brands-count">
          <b>{totalBrandCount}</b> BRANDS
          {tracked && (
            <>
              {' · '}
              <b>{tracked}</b> TRACKED
            </>
          )}
        </span>
        <div className="brands-tools-r">
          {!selectionMode && (
            <div className="sort">
              <span className="sort-l">Sort</span>
              <button
                type="button"
                className={`sort-btn ${sort === 'recent' ? 'active' : ''}`}
                onClick={() => setSort('recent')}
              >
                Recent
              </button>
              <button
                type="button"
                className={`sort-btn ${sort === 'value' ? 'active' : ''}`}
                onClick={() => setSort('value')}
              >
                By value
              </button>
            </div>
          )}
          {/* FR-10 #97 — Select toggle. Hide "+ New Brand" in select mode
              (goal-directed: pick 2 → Combine via the combine-bar below). The
              Combine action itself lives in the .combine-bar (design Ask · Founder
              2026-06-13: match the select-two mockup). */}
          {selectionMode ? (
            <button
              type="button"
              className="select-toggle is-on"
              onClick={exitSelectionMode}
              aria-label="Exit selection mode"
            >
              Selecting · {selected.size} of 2
            </button>
          ) : (
            <>
              {canSelect && (
                <button
                  type="button"
                  className="select-toggle"
                  onClick={() => setSelectionMode(true)}
                  aria-label="Enter selection mode to combine two brands"
                >
                  Select
                </button>
              )}
              <NewBrandTrigger />
            </>
          )}
        </div>
      </div>

      {/* Stays mounted through select mode; the wrapper animates open/closed via
          CSS (slide-down in · slide-up + fade out). Names come from barPair so
          they persist while it collapses after the selection drops below 2. */}
      {selectionMode && (
        <div
          className={`combine-bar-wrap ${barShown ? 'is-shown' : ''}`}
          aria-hidden={!barShown}
        >
          <div className="combine-bar">
            <div className="combine-bar-l">
              <span className="combine-bar-k">2 brands selected</span>
              <span className="combine-bar-t">
                Combine <b>{barPair?.[0]}</b> + <b>{barPair?.[1]}</b> into one
                brand — keeps the bigger history, you pick the name.
              </span>
            </div>
            <div className="combine-bar-r">
              <button
                type="button"
                className="combine-clear"
                onClick={() => setSelected(new Map())}
                tabIndex={barShown ? undefined : -1}
              >
                Clear
              </button>
              <button
                type="button"
                className="btn-pill"
                onClick={onCombineClick}
                tabIndex={barShown ? undefined : -1}
              >
                Combine into one →
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={`brand-list ${selectionMode ? 'is-selection-mode' : ''}`}>
        {visibleKnown.map((b, i) => (
          <BrandRow
            key={b.routeSegment}
            brand={b}
            rank={String(i + 1).padStart(2, '0')}
            selectionMode={selectionMode}
            isSelected={b.brand_id ? selected.has(b.brand_id) : false}
            onToggle={toggleRow}
          />
        ))}
        {unknown && (
          <BrandRow
            brand={unknown}
            rank="—"
            selectionMode={selectionMode}
            isSelected={false}
            onToggle={toggleRow}
          />
        )}
      </div>
      {pendingDelete ? (
        <BrandDeleteToast
          brandId={pendingDelete.id}
          brandName={pendingDelete.name}
          onDone={() => setPendingDelete(null)}
        />
      ) : null}
      {combineOpen ? (
        <BrandCombineLauncher
          seed={{
            mode: 'pair',
            survivorId: combineOpen.survivorId,
            loserId: combineOpen.loserId,
          }}
          onClose={() => {
            setCombineOpen(null)
            exitSelectionMode()
            // Refresh to pick up the post-merge state (loser gone, survivor
            // enriched). Cheap no-op if the user cancelled mid-flow.
            router.refresh()
          }}
        />
      ) : null}
    </>
  )
}

interface BrandRowProps {
  brand: BrandSummary
  rank: string
  selectionMode: boolean
  isSelected: boolean
  onToggle: (brand: BrandSummary) => void
}

function BrandRow({ brand, rank, selectionMode, isSelected, onToggle }: BrandRowProps) {
  const selectable = selectionMode && !brand.isUnknown
  const href = `/app/brands/${brand.routeSegment}`

  // FR-11 AC1.3 — 0-pitch "Ready" row (Direction A · dashed marker). A real brand
  // with no pitches yet (just created, or emptied) reads as ready-to-track, not
  // broken: dashed Ready tag beside the name + a single next-step hint spanning
  // the data columns + a muted "No pitches" total. Same height/grid as populated.
  if (brand.pitchCount === 0 && !brand.isUnknown) {
    return (
      <RowShell
        brand={brand}
        href={href}
        baseClass="brand-row is-fresh-a"
        selectionMode={selectionMode}
        selectable={selectable}
        isSelected={isSelected}
        onToggle={onToggle}
      >
        <span className="brand-rank">{rank}</span>
        <div className="brand-name">
          <span className="brand-name-t">
            {brand.displayName}
            <span className="fresh-tag">Ready</span>
          </span>
          <span className="brand-name-sub">
            Added {formatRelativeTime(brand.lastContactAt)} &middot; no pitches yet
          </span>
        </div>
        <span className="brand-fresh-cta">
          &rarr; <em>Paste its first pitch to start tracking</em>
        </span>
        <span className="brand-total muted">No pitches</span>
        <span className="brand-arrow">&rarr;</span>
        <span className="brand-row-divider" aria-hidden="true" />
      </RowShell>
    )
  }

  const sub = brand.isUnknown
    ? `No brand extracted · ${brand.pitchCount} ${brand.pitchCount === 1 ? 'pitch' : 'pitches'}`
    : brand.pitchCount === 1
      ? '1st touch'
      : 'Repeat customer'

  return (
    <RowShell
      brand={brand}
      href={href}
      baseClass="brand-row"
      selectionMode={selectionMode}
      selectable={selectable}
      isSelected={isSelected}
      onToggle={onToggle}
    >
      <span className="brand-rank">{rank}</span>
      <div className="brand-name">
        <span className={`brand-name-t ${brand.isUnknown ? 'unknown' : ''}`}>
          {brand.displayName}
        </span>
        <span className="brand-name-sub">{sub}</span>
      </div>
      <span
        className={`brand-pitches${brand.pitchCount === 1 ? ' is-single' : ''}`}
      >
        <b>{brand.pitchCount}</b> {brand.pitchCount === 1 ? 'pitch' : 'pitches'}
      </span>
      <span className="brand-last">{formatRelativeTime(brand.lastContactAt)}</span>
      <BrandTotal brand={brand} />
      <span className="brand-arrow">→</span>
      <span className="brand-row-divider" aria-hidden="true" />
    </RowShell>
  )
}

// Wraps a brand row: a <Link> in normal mode, a click-to-toggle <button> when
// selecting a real brand, or a non-interactive <div> for the Unknown bucket
// during select mode (AC-M3 — never selectable). The select mark is rendered
// only in select mode and is absolutely positioned (CSS) so it doesn't consume a
// grid cell.
function RowShell({
  brand,
  href,
  baseClass,
  selectionMode,
  selectable,
  isSelected,
  onToggle,
  children,
}: {
  brand: BrandSummary
  href: string
  baseClass: string
  selectionMode: boolean
  selectable: boolean
  isSelected: boolean
  onToggle: (brand: BrandSummary) => void
  children: React.ReactNode
}) {
  if (!selectionMode) {
    return (
      <Link href={href} className={baseClass}>
        {children}
      </Link>
    )
  }

  const mark = <span className="brand-select-mark" aria-hidden="true" />

  if (!selectable) {
    // Unknown bucket — visible but inert during select mode.
    return (
      <div className={`${baseClass} is-noselect`} aria-disabled="true">
        {mark}
        {children}
      </div>
    )
  }

  return (
    <button
      type="button"
      className={`${baseClass}${isSelected ? ' is-selected' : ''}`}
      onClick={() => onToggle(brand)}
      aria-pressed={isSelected}
      aria-label={`${isSelected ? 'Deselect' : 'Select'} ${brand.displayName}`}
    >
      {mark}
      {children}
    </button>
  )
}

function BrandTotal({ brand }: { brand: BrandSummary }) {
  const [primary, secondary, ...rest] = brand.currencyTotals
  if (!primary) {
    return <span className="brand-total muted">No budget set</span>
  }
  const overflow = rest.length
  return (
    <span className="brand-total">
      {formatCurrencyAmount(primary.currency, primary.amount)}
      <sup>{primary.currency}</sup>
      {(secondary || overflow > 0) && (
        <span className="mix">
          {secondary &&
            `+ ${formatCurrencyAmount(secondary.currency, secondary.amount)} ${secondary.currency}`}
          {secondary && overflow > 0 && ' · '}
          {overflow > 0 &&
            `+ ${overflow} other ${overflow === 1 ? 'currency' : 'currencies'}`}
        </span>
      )}
    </span>
  )
}
