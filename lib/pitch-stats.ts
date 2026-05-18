import type { Pitch } from '@/lib/types/pitch'
import type { Deal } from '@/lib/types/deal'

export interface CurrencyTotal {
  currency: string // uppercase, trimmed
  amount: number
}

export interface PitchStats {
  pitchCount: number
  brandCount: number
  /** Lifetime totals from `pitches.budget_amount` across all pitches (original
   *  offers, direction-agnostic). Used for "Total tracked" displays such as
   *  the /app/brands aggregate cell. */
  currencyTotals: CurrencyTotal[] // sorted desc by amount
  /** "In pipeline" totals derived from `deals` table where stage is non-terminal.
   *  Per FR-4 AC7.3 (2026-05-17): reads from `deals.current_budget_amount` filtered
   *  to stages inbox / negotiating / confirmed; excludes delivered + rejected
   *  (terminal stages) + NULL budgets (typical for non-cash deals). */
  pipelineCurrencyTotals: CurrencyTotal[] // sorted desc by amount
}

function normalizeBrand(b: string | null): string | null {
  if (!b) return null
  const trimmed = b.trim().toLowerCase()
  return trimmed || null
}

function normalizeCurrency(c: string | null): string | null {
  if (!c) return null
  const trimmed = c.trim().toUpperCase()
  return trimmed || null
}

export function computePitchStats(
  pitches: Pitch[],
  deals: Deal[]
): PitchStats {
  // Pitches saved (AC7.1) — direction-agnostic, deal-state-agnostic
  const pitchCount = pitches.length

  // Brands tracked (AC7.2) — distinct normalized brand_name across all pitches
  const brandKeys = new Set<string>()
  for (const p of pitches) {
    const k = normalizeBrand(p.brand_name)
    if (k) brandKeys.add(k)
  }

  // Lifetime currency totals — sum pitches.budget_amount (original offers).
  // Used for /app/brands aggregate "Total tracked" display.
  const lifetimeSums = new Map<string, number>()
  for (const p of pitches) {
    const c = normalizeCurrency(p.budget_currency)
    if (!c || !p.budget_amount || p.budget_amount <= 0) continue
    lifetimeSums.set(c, (lifetimeSums.get(c) ?? 0) + p.budget_amount)
  }
  const currencyTotals: CurrencyTotal[] = Array.from(lifetimeSums.entries())
    .map(([currency, amount]) => ({ currency, amount }))
    .sort((a, b) => b.amount - a.amount)

  // In pipeline (AC7.3) — sum deals.current_budget_amount where stage is
  // non-terminal (inbox / negotiating / confirmed). NULL budgets excluded.
  // Direction-agnostic (both inbound + outbound count).
  const pipelineSums = new Map<string, number>()
  for (const d of deals) {
    if (d.stage !== 'inbox' && d.stage !== 'negotiating' && d.stage !== 'confirmed') continue
    if (!d.current_budget_amount || d.current_budget_amount <= 0) continue
    const c = normalizeCurrency(d.current_budget_currency)
    if (!c) continue
    pipelineSums.set(c, (pipelineSums.get(c) ?? 0) + d.current_budget_amount)
  }
  const pipelineCurrencyTotals: CurrencyTotal[] = Array.from(
    pipelineSums.entries()
  )
    .map(([currency, amount]) => ({ currency, amount }))
    .sort((a, b) => b.amount - a.amount)

  return {
    pitchCount,
    brandCount: brandKeys.size,
    currencyTotals,
    pipelineCurrencyTotals,
  }
}

export interface BrandSummary {
  key: string // normalized lowercase+trim, or '__unknown__' for the NULL bucket
  displayName: string // most-recent casing variant from pitches in this group
  isUnknown: boolean
  pitchCount: number
  lastContactAt: string // ISO timestamp of most-recent pitch with this brand
  currencyTotals: CurrencyTotal[] // sorted desc by amount
}

export interface BrandSummaries {
  known: BrandSummary[] // sortable; sort is consumer's call
  unknown: BrandSummary | null // present only when 1+ pitches have NULL brand_name
}

const UNKNOWN_KEY = '__unknown__'

export function computeBrandSummaries(pitches: Pitch[]): BrandSummaries {
  // Group pitches by normalized brand key (or unknown bucket for NULL brand_name).
  const groups = new Map<string, Pitch[]>()
  for (const p of pitches) {
    const key = normalizeBrand(p.brand_name) ?? UNKNOWN_KEY
    const list = groups.get(key)
    if (list) list.push(p)
    else groups.set(key, [p])
  }

  const summaries: BrandSummary[] = []
  let unknown: BrandSummary | null = null

  for (const [key, groupPitches] of groups.entries()) {
    // Sort group by created_at desc so the first element gives most-recent metadata.
    const sorted = [...groupPitches].sort((a, b) =>
      a.created_at < b.created_at ? 1 : -1
    )
    const mostRecent = sorted[0]
    const isUnknown = key === UNKNOWN_KEY
    const displayName = isUnknown
      ? '(Unknown brand)'
      : mostRecent.brand_name?.trim() ?? '(Unknown brand)'

    const sumsByCurrency = new Map<string, number>()
    for (const p of groupPitches) {
      const c = normalizeCurrency(p.budget_currency)
      if (!c || !p.budget_amount || p.budget_amount <= 0) continue
      sumsByCurrency.set(c, (sumsByCurrency.get(c) ?? 0) + p.budget_amount)
    }
    const currencyTotals: CurrencyTotal[] = Array.from(sumsByCurrency.entries())
      .map(([currency, amount]) => ({ currency, amount }))
      .sort((a, b) => b.amount - a.amount)

    const summary: BrandSummary = {
      key,
      displayName,
      isUnknown,
      pitchCount: groupPitches.length,
      lastContactAt: sorted[0].created_at,
      currencyTotals,
    }

    if (isUnknown) unknown = summary
    else summaries.push(summary)
  }

  return { known: summaries, unknown }
}

export function brandSlug(displayName: string): string {
  return encodeURIComponent(displayName)
}

export const UNKNOWN_BRAND_SLUG = '__unknown__'

export interface AvgDeal {
  currency: string
  amount: number
  pitchesInDominantCurrency: number
  totalPitchesWithBudget: number
}

export interface BrandDetail {
  displayName: string
  isUnknown: boolean
  pitches: Pitch[] // sorted desc by created_at
  pitchCount: number
  currencyTotals: CurrencyTotal[]
  avgDeal: AvgDeal | null
  firstContactAt: string // ISO
  lastContactAt: string // ISO
}

function computeAvgDeal(pitches: Pitch[]): AvgDeal | null {
  const buckets = new Map<string, { sum: number; count: number }>()
  let totalWithBudget = 0
  for (const p of pitches) {
    const c = normalizeCurrency(p.budget_currency)
    if (!c || !p.budget_amount || p.budget_amount <= 0) continue
    const existing = buckets.get(c) ?? { sum: 0, count: 0 }
    existing.sum += p.budget_amount
    existing.count += 1
    buckets.set(c, existing)
    totalWithBudget += 1
  }
  if (buckets.size === 0) return null

  let dominant: { currency: string; sum: number; count: number } | null = null
  for (const [currency, { sum, count }] of buckets.entries()) {
    if (!dominant || sum > dominant.sum) dominant = { currency, sum, count }
  }
  return {
    currency: dominant!.currency,
    amount: dominant!.sum / dominant!.count,
    pitchesInDominantCurrency: dominant!.count,
    totalPitchesWithBudget: totalWithBudget,
  }
}

// Resolve a URL slug back to a brand bucket and return the full detail payload,
// or null if no pitches match (caller should silent-redirect to /app/brands per
// spec §6.4).
export function findBrandDetail(
  pitches: Pitch[],
  slug: string
): BrandDetail | null {
  const isUnknownSlug = slug === UNKNOWN_BRAND_SLUG
  let matched: Pitch[]

  if (isUnknownSlug) {
    matched = pitches.filter((p) => normalizeBrand(p.brand_name) === null)
  } else {
    let decoded: string
    try {
      decoded = decodeURIComponent(slug)
    } catch {
      return null
    }
    const targetKey = decoded.trim().toLowerCase()
    if (!targetKey) return null
    matched = pitches.filter((p) => normalizeBrand(p.brand_name) === targetKey)
  }

  if (matched.length === 0) return null

  const sorted = [...matched].sort((a, b) =>
    a.created_at < b.created_at ? 1 : -1
  )
  const mostRecent = sorted[0]
  const oldest = sorted[sorted.length - 1]

  const sumsByCurrency = new Map<string, number>()
  for (const p of matched) {
    const c = normalizeCurrency(p.budget_currency)
    if (!c || !p.budget_amount || p.budget_amount <= 0) continue
    sumsByCurrency.set(c, (sumsByCurrency.get(c) ?? 0) + p.budget_amount)
  }
  const currencyTotals: CurrencyTotal[] = Array.from(sumsByCurrency.entries())
    .map(([currency, amount]) => ({ currency, amount }))
    .sort((a, b) => b.amount - a.amount)

  const displayName = isUnknownSlug
    ? '(Unknown brand)'
    : mostRecent.brand_name?.trim() ?? '(Unknown brand)'

  return {
    displayName,
    isUnknown: isUnknownSlug,
    pitches: sorted,
    pitchCount: sorted.length,
    currencyTotals,
    avgDeal: computeAvgDeal(matched),
    firstContactAt: oldest.created_at,
    lastContactAt: mostRecent.created_at,
  }
}

const CURRENCY_SYMBOL: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
}

export function formatCurrencyAmount(currency: string, amount: number): string {
  const symbol = CURRENCY_SYMBOL[currency] ?? ''
  const rounded = Math.round(amount).toLocaleString('en-US')
  return `${symbol}${rounded}`
}
