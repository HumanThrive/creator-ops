'use client'

import Link from 'next/link'
import { useState } from 'react'
import type { BrandSummary, CurrencyTotal } from '@/lib/pitch-stats'
import { brandSlug, formatCurrencyAmount } from '@/lib/pitch-stats'
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
          <BrandRow key={b.key} brand={b} rank={String(i + 1).padStart(2, '0')} />
        ))}
        {unknown && <BrandRow brand={unknown} rank="—" />}
      </div>
    </>
  )
}

function BrandRow({ brand, rank }: { brand: BrandSummary; rank: string }) {
  const sub = brand.isUnknown
    ? `No brand extracted · ${brand.pitchCount} ${brand.pitchCount === 1 ? 'pitch' : 'pitches'}`
    : brand.pitchCount === 1
      ? '1st touch'
      : 'Repeat customer'

  return (
    <Link href={`/app/brands/${brandSlug(brand.displayName)}`} className="brand-row">
      <span className="brand-rank">{rank}</span>
      <div className="brand-name">
        <span className={`brand-name-t ${brand.isUnknown ? 'unknown' : ''}`}>
          {brand.displayName}
        </span>
        <span className="brand-name-sub">{sub}</span>
      </div>
      <span className="brand-pitches">
        <b>{brand.pitchCount}</b> {brand.pitchCount === 1 ? 'pitch' : 'pitches'}
      </span>
      <span className="brand-last">{formatRelativeTime(brand.lastContactAt)}</span>
      <BrandTotal brand={brand} />
      <span className="brand-arrow">→</span>
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
