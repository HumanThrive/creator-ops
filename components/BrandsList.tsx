'use client'

import Link from 'next/link'
import { useState } from 'react'
import type { BrandSummary } from '@/lib/brand-stats'
import type { CurrencyTotal } from '@/lib/pitch-stats'
import { formatCurrencyAmount } from '@/lib/pitch-stats'
import { formatRelativeTime } from '@/lib/format'

type SortMode = 'recent' | 'value'

interface BrandsListProps {
  known: BrandSummary[]
  unknown: BrandSummary | null
  currencyTotals: CurrencyTotal[] // global, for the tools-row "$X TRACKED" line
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
  const [sort, setSort] = useState<SortMode>('recent')

  const sortedKnown = [...known].sort((a, b) => {
    if (sort === 'value') {
      const diff = primaryAmount(b) - primaryAmount(a)
      if (diff !== 0) return diff
      return a.lastContactAt < b.lastContactAt ? 1 : -1
    }
    return a.lastContactAt < b.lastContactAt ? 1 : -1
  })

  const totalBrandCount = known.length + (unknown ? 1 : 0)
  const tracked = trackedSummary(currencyTotals)

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
      </div>

      <div className="brand-list">
        {sortedKnown.map((b, i) => (
          <BrandRow key={b.routeSegment} brand={b} rank={String(i + 1).padStart(2, '0')} />
        ))}
        {unknown && <BrandRow brand={unknown} rank="—" />}
      </div>
    </>
  )
}

function BrandRow({ brand, rank }: { brand: BrandSummary; rank: string }) {
  // FR-11 AC1.3 — 0-pitch "Ready" row (Direction A · dashed marker). A real brand
  // with no pitches yet (just created, or emptied) reads as ready-to-track, not
  // broken: dashed Ready tag beside the name + a single next-step hint spanning
  // the data columns + a muted "No pitches" total. Same height/grid as populated.
  if (brand.pitchCount === 0 && !brand.isUnknown) {
    return (
      <Link
        href={`/app/brands/${brand.routeSegment}`}
        className="brand-row is-fresh-a"
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
      </Link>
    )
  }

  const sub = brand.isUnknown
    ? `No brand extracted · ${brand.pitchCount} ${brand.pitchCount === 1 ? 'pitch' : 'pitches'}`
    : brand.pitchCount === 1
      ? '1st touch'
      : 'Repeat customer'

  return (
    <Link href={`/app/brands/${brand.routeSegment}`} className="brand-row">
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
    </Link>
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
