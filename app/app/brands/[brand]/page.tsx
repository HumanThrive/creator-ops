import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { BrandHistoryTable } from '@/components/BrandHistoryTable'
import { findBrandDetail, formatCurrencyAmount } from '@/lib/pitch-stats'
import { formatFullDate, formatRelativeTime } from '@/lib/format'
import type { Pitch } from '@/lib/types/pitch'
import type { Deal } from '@/lib/types/deal'
import type { Activity } from '@/lib/types/activity'

interface BrandDetailPageProps {
  params: Promise<{ brand: string }>
}

export default async function BrandDetailPage({ params }: BrandDetailPageProps) {
  const supabase = await createClient()

  const { brand: brandSlug } = await params

  const { data: pitches } = await supabase
    .from('pitches')
    .select('*')
    .order('created_at', { ascending: false })

  const detail = findBrandDetail((pitches ?? []) as Pitch[], brandSlug)
  // Spec §6.4: silent redirect when slug doesn't resolve to a brand the user has.
  if (!detail) redirect('/app/brands')

  // Per FR-4 S5 (AC5.1–AC5.3): fetch the deal + activity log for each pitch in
  // this brand's set so the timeline renders direction-aware rows + current
  // deal state + per-pitch activity log subsection.
  const pitchIds = detail.pitches.map((p) => p.id)
  const [dealsResult, activitiesResult] = await Promise.all([
    supabase.from('deals').select('*').in('pitch_id', pitchIds),
    supabase
      .from('activities')
      .select('*')
      .in('pitch_id', pitchIds)
      .order('created_at', { ascending: true }),
  ])

  const dealsByPitchId: Record<string, Deal | undefined> = {}
  for (const d of dealsResult.data ?? []) {
    const deal = d as Deal
    dealsByPitchId[deal.pitch_id] = deal
  }

  const activitiesByPitchId: Record<string, Activity[]> = {}
  for (const a of activitiesResult.data ?? []) {
    const activity = a as Activity
    const bucket = activitiesByPitchId[activity.pitch_id] ?? []
    bucket.push(activity)
    activitiesByPitchId[activity.pitch_id] = bucket
  }

  const repeatLabel = detail.pitchCount === 1 ? '1st touch' : 'Repeat customer'
  const kicker = detail.isUnknown
    ? `Unknown sender · ${detail.pitchCount} ${detail.pitchCount === 1 ? 'pitch' : 'pitches'}`
    : `${repeatLabel} · since ${formatFullDate(detail.firstContactAt)}`

  return (
    <div className="page">
      <Link href="/app/brands" className="page-back">
        ← All brands
      </Link>
      <div className="page-head">
        <div className="page-head-l">
          <span className="kicker">{kicker}</span>
          <h1 className="page-h1">{detail.displayName}.</h1>
          <p className="page-sub">
            {detail.pitchCount} {detail.pitchCount === 1 ? 'pitch' : 'pitches'} · Last
            contact {formatRelativeTime(detail.lastContactAt)} · Tracked since{' '}
            {formatFullDate(detail.firstContactAt)}.
          </p>
        </div>
      </div>

      <div className="bd-headstrip">
        <div className="bd-meta">
          <div className="bd-meta-cell">
            <span className="bd-meta-l">Pitches</span>
            <span className="bd-meta-v">
              {String(detail.pitchCount).padStart(2, '0')}
            </span>
          </div>
          <div className="bd-meta-cell">
            <span className="bd-meta-l">Tracked total</span>
            <TrackedTotal totals={detail.currencyTotals} />
          </div>
          <div className="bd-meta-cell">
            <span className="bd-meta-l">Avg deal</span>
            <AvgDealValue avgDeal={detail.avgDeal} />
          </div>
        </div>
        <div className="bd-meta cols-2">
          <div className="bd-meta-cell">
            <span className="bd-meta-l">First contact</span>
            <span className="bd-meta-v" style={{ fontSize: 22 }}>
              {formatFullDate(detail.firstContactAt)}
            </span>
          </div>
          <div className="bd-meta-cell">
            <span className="bd-meta-l">Last contact</span>
            <span className="bd-meta-v" style={{ fontSize: 22 }}>
              {formatFullDate(detail.lastContactAt)}
            </span>
          </div>
        </div>
      </div>

      <BrandHistoryTable
        pitches={detail.pitches}
        dealsByPitchId={dealsByPitchId}
        activitiesByPitchId={activitiesByPitchId}
      />
    </div>
  )
}

function TrackedTotal({ totals }: { totals: { currency: string; amount: number }[] }) {
  const [primary, secondary, ...rest] = totals
  if (!primary) {
    return <span className="bd-meta-v" style={{ fontSize: 18, color: 'var(--ink-4)' }}>—</span>
  }
  // Tracked total is the accent-highlighted cell per design.
  const overflow = rest.length
  return (
    <>
      <span className="bd-meta-v accent">
        {formatCurrencyAmount(primary.currency, primary.amount)}
        <sup>{primary.currency}</sup>
      </span>
      {(secondary || overflow > 0) && (
        <span className="font-mono text-xs text-ink-3 mt-1">
          {secondary &&
            `+ ${formatCurrencyAmount(secondary.currency, secondary.amount)} ${secondary.currency}`}
          {secondary && overflow > 0 && ' · '}
          {overflow > 0 &&
            `+ ${overflow} other ${overflow === 1 ? 'currency' : 'currencies'}`}
        </span>
      )}
    </>
  )
}

function AvgDealValue({
  avgDeal,
}: {
  avgDeal: import('@/lib/pitch-stats').AvgDeal | null
}) {
  if (!avgDeal) {
    return <span className="bd-meta-v" style={{ fontSize: 18, color: 'var(--ink-4)' }}>—</span>
  }
  const isMixed = avgDeal.pitchesInDominantCurrency < avgDeal.totalPitchesWithBudget
  return (
    <>
      <span className="bd-meta-v">
        {formatCurrencyAmount(avgDeal.currency, avgDeal.amount)}
        <sup>{avgDeal.currency}</sup>
      </span>
      {isMixed && (
        <span className="font-mono text-xs text-ink-3 mt-1">
          ({avgDeal.pitchesInDominantCurrency} of {avgDeal.totalPitchesWithBudget} pitches in {avgDeal.currency})
        </span>
      )}
    </>
  )
}
