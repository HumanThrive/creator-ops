import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { BrandsList } from '@/components/BrandsList'
import { AddPitchTrigger } from '@/components/AddPitchTrigger'
import { computeBrandSummaries, computePitchStats } from '@/lib/pitch-stats'
import type { Pitch } from '@/lib/types/pitch'
import type { Deal } from '@/lib/types/deal'

export const metadata: Metadata = {
  title: 'Brands',
}

export default async function BrandsPage() {
  const supabase = await createClient()

  const [pitchesResult, dealsResult] = await Promise.all([
    supabase
      .from('pitches')
      .select('*')
      .order('created_at', { ascending: false }),
    supabase.from('deals').select('*'),
  ])

  const safePitches = (pitchesResult.data ?? []) as Pitch[]
  const safeDeals = (dealsResult.data ?? []) as Deal[]
  const stats = computePitchStats(safePitches, safeDeals)
  const brands = computeBrandSummaries(safePitches)
  const error = pitchesResult.error ?? dealsResult.error

  const isEmpty = brands.known.length === 0 && brands.unknown === null

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-l">
          <span className="kicker">
            Your asset · {stats.brandCount} brands · {stats.pitchCount} pitches
          </span>
          <h1 className="page-h1">Brands.</h1>
          <p className="page-sub">
            Every brand you&rsquo;ve worked with &mdash; your relationship history at a
            glance. Each row is a relationship; click in to see every pitch.
          </p>
        </div>
      </div>

      {error ? (
        <p className="text-sm text-red-600">
          Couldn&rsquo;t load brands. Refresh to try again.
        </p>
      ) : isEmpty ? (
        <BrandsEmptyState />
      ) : (
        <BrandsList
          known={brands.known}
          unknown={brands.unknown}
          currencyTotals={stats.currencyTotals}
        />
      )}
    </div>
  )
}

function BrandsEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
      <h2 className="font-display text-5xl uppercase tracking-wide text-ink">
        No brands yet.
      </h2>
      <p className="max-w-md text-ink-3">
        Save your first pitch and your brand database starts here.
      </p>
      <AddPitchTrigger className="btn-pill" label="Add pitch" />
    </div>
  )
}
