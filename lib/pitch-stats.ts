// Pitch-level + global ($ tracked / pipeline) aggregation.
// Brand-grouping + brand-detail moved to lib/brand-stats.ts (CR-7 re-platform —
// the /app/brands surface now keys on the canonical brands table, not text).

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

/**
 * CR-6 2026-05-19 — "Deal IS the thing." Brand-page aggregations (per-brand
 * totals, lifetime totals, avg-deal, per-pitch CashCell) prefer the negotiated
 * deal value over the original pitch ask. Falls back to pitch.budget_* when no
 * deal exists OR the deal hasn't set a budget yet. Rejected-stage deals still
 * count as "engaged on" — historical track record, not current pipeline.
 */
export function effectiveBudget(
  pitch: Pitch,
  deal: Deal | null | undefined,
): { amount: number; currency: string } | null {
  if (deal && deal.current_budget_amount && deal.current_budget_amount > 0) {
    const c = normalizeCurrency(deal.current_budget_currency)
    if (c) return { amount: deal.current_budget_amount, currency: c }
  }
  if (pitch.budget_amount && pitch.budget_amount > 0) {
    const c = normalizeCurrency(pitch.budget_currency)
    if (c) return { amount: pitch.budget_amount, currency: c }
  }
  return null
}

function buildDealMap(deals: Deal[]): Map<string, Deal> {
  const m = new Map<string, Deal>()
  for (const d of deals) m.set(d.pitch_id, d)
  return m
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

  // Lifetime currency totals — effective budget per pitch (deal value when
  // negotiated, pitch.budget_amount fallback). Used for /app/brands tools-row
  // "$X TRACKED" line.
  const dealMap = buildDealMap(deals)
  const lifetimeSums = new Map<string, number>()
  for (const p of pitches) {
    const eff = effectiveBudget(p, dealMap.get(p.id))
    if (!eff) continue
    lifetimeSums.set(eff.currency, (lifetimeSums.get(eff.currency) ?? 0) + eff.amount)
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
