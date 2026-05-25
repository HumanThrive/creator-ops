import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { BrandHistoryTable } from '@/components/BrandHistoryTable'
import { BrandStatsStrip } from '@/components/BrandStatsStrip'
import {
  BrandContactsTable,
  type BrandContactRow,
  type ContactRole,
} from '@/components/BrandContactsTable'
import { findBrandDetail } from '@/lib/pitch-stats'
import { formatFullDate, formatRelativeTime } from '@/lib/format'
import type { Pitch } from '@/lib/types/pitch'
import type { Deal } from '@/lib/types/deal'
import type { Activity } from '@/lib/types/activity'

interface BrandDetailPageProps {
  params: Promise<{ brand: string }>
}

export async function generateMetadata({
  params,
}: BrandDetailPageProps): Promise<Metadata> {
  const { brand: brandSlug } = await params
  const supabase = await createClient()
  const { data: pitches } = await supabase
    .from('pitches')
    .select('*')
    .order('created_at', { ascending: false })
  const detail = findBrandDetail((pitches ?? []) as Pitch[], [], brandSlug)
  return {
    title: detail ? detail.displayName : 'Brands',
  }
}

export default async function BrandDetailPage({ params }: BrandDetailPageProps) {
  const supabase = await createClient()

  const { brand: brandSlug } = await params

  const [pitchesResult, allDealsResult] = await Promise.all([
    supabase
      .from('pitches')
      .select('*')
      .order('created_at', { ascending: false }),
    supabase.from('deals').select('*'),
  ])
  const pitches = pitchesResult.data
  const allDeals = (allDealsResult.data ?? []) as Deal[]

  const detail = findBrandDetail(
    (pitches ?? []) as Pitch[],
    allDeals,
    brandSlug,
  )
  if (!detail) redirect('/app/brands')

  const pitchIds = detail.pitches.map((p) => p.id)

  // FR-7 W71: resolve brand_id from any backfilled pitch under this Brand.
  // Migration 2 ensured every pre-FR-7 pitch carries brand_id; if no pitch
  // in detail.pitches has brand_id, fall back to "no FR-7 surface" mode
  // (still render the legacy history table; skip new strips).
  const brandId =
    detail.pitches.find((p) => p.brand_id !== null)?.brand_id ?? null

  const [activitiesResult, tagsResult, contactBrandsResult] = await Promise.all([
    supabase
      .from('activities')
      .select('*')
      .in('pitch_id', pitchIds)
      .order('created_at', { ascending: true }),
    supabase
      .from('entity_tags')
      .select('ref_id, tags(slug)')
      .eq('ref_type', 'pitch')
      .in('ref_id', pitchIds),
    // FR-7 W71: contact_brands pivot rows + contacts JOIN for the contacts
    // table. Joined contact row gives display_name + channels; pivot gives
    // the per-Brand role enum. The join is RLS-safe per user_id denormalization
    // on the pivot table.
    brandId
      ? supabase
          .from('contact_brands')
          .select('contact_id, role, contacts(id, display_name, channels)')
          .eq('brand_id', brandId)
      : Promise.resolve({
          data: [] as {
            contact_id: string
            role: string | null
            contacts: {
              id: string
              display_name: string | null
              channels: Array<{
                kind: string
                identifier: string
                primary: boolean
              }>
            } | null
          }[],
          error: null,
        }),
  ])

  const dealsByPitchId: Record<string, Deal | undefined> = {}
  for (const deal of allDeals) {
    if (pitchIds.includes(deal.pitch_id)) {
      dealsByPitchId[deal.pitch_id] = deal
    }
  }

  const activitiesByPitchId: Record<string, Activity[]> = {}
  for (const a of activitiesResult.data ?? []) {
    const activity = a as Activity
    const bucket = activitiesByPitchId[activity.pitch_id] ?? []
    bucket.push(activity)
    activitiesByPitchId[activity.pitch_id] = bucket
  }

  const tagsByPitchId: Record<string, string[]> = {}
  for (const row of tagsResult.data ?? []) {
    const refId = (row as { ref_id: string }).ref_id
    const tagRel = (row as { tags: { slug: string } | { slug: string }[] | null }).tags
    if (!tagRel) continue
    const slugs = Array.isArray(tagRel) ? tagRel.map((t) => t.slug) : [tagRel.slug]
    const bucket = tagsByPitchId[refId] ?? []
    bucket.push(...slugs)
    tagsByPitchId[refId] = bucket
  }

  // ─── FR-7 W71: BrandStatsStrip aggregations ────────────────────────
  // Pitches = count of pitches under this brand (from detail).
  // Closed total = SUM(current_budget_amount) over deals.stage='delivered'
  //   for pitches under this brand. PL synthesis (handoff 2026-05-25 [11:13]):
  //   single dominant currency only at v1 — pick the currency with the
  //   largest delivered sum; show fallback "—" when there's no closed deal.
  // Contacts = count of distinct contact_id in contact_brands under this brand.
  let closedAccByCurrency = new Map<string, number>()
  let closedDealCount = 0
  let inFlightCount = 0
  let declinedCount = 0
  for (const pid of pitchIds) {
    const d = dealsByPitchId[pid]
    if (!d) continue
    if (d.stage === 'delivered') {
      closedDealCount++
      if (d.current_budget_amount && d.current_budget_currency) {
        const cur = d.current_budget_currency
        closedAccByCurrency.set(
          cur,
          (closedAccByCurrency.get(cur) ?? 0) + d.current_budget_amount,
        )
      }
    } else if (d.stage === 'rejected') {
      declinedCount++
    } else {
      inFlightCount++
    }
  }
  let topClosedCurrency: string | null = null
  let topClosedAmount = 0
  for (const [cur, amt] of closedAccByCurrency.entries()) {
    if (amt > topClosedAmount) {
      topClosedAmount = amt
      topClosedCurrency = cur
    }
  }

  const contactBrandsRows = (contactBrandsResult.data as
    | {
        contact_id: string
        role: string | null
        contacts: {
          id: string
          display_name: string | null
          channels: Array<{
            kind: string
            identifier: string
            primary: boolean
          }>
        } | null
      }[]
    | null) ?? []

  const contactsCount = new Set(contactBrandsRows.map((r) => r.contact_id)).size

  // Role distribution sub-line for the Contacts stat cell.
  const roleCounts: Record<string, number> = {}
  for (const r of contactBrandsRows) {
    if (r.role) roleCounts[r.role] = (roleCounts[r.role] ?? 0) + 1
  }
  const rolePartsArr: string[] = []
  for (const [role, n] of Object.entries(roleCounts)) {
    rolePartsArr.push(`${n} ${role}`)
  }
  const contactsSub = rolePartsArr.length > 0
    ? rolePartsArr.join(' · ')
    : null

  // ─── FR-7 W71: BrandContactsTable per-row aggregations ─────────────
  // For each contact_brands row, aggregate from the already-loaded
  // detail.pitches + allDeals (no extra round trips). pitchesUnderBrand =
  // pitches WHERE brand_id = X AND contact_id = Y. lastTouchDate = MAX of
  // those pitches.created_at. lastCloseAmount/Currency/Date = most recent
  // delivered deal for those pitches.
  const otherBrandsByContact = new Map<string, number>()
  if (contactBrandsRows.length > 0) {
    const contactIds = Array.from(
      new Set(contactBrandsRows.map((r) => r.contact_id)),
    )
    const otherBrandsResult = await supabase
      .from('contact_brands')
      .select('contact_id, brand_id')
      .in('contact_id', contactIds)
    for (const row of (otherBrandsResult.data ?? []) as Array<{
      contact_id: string
      brand_id: string
    }>) {
      if (row.brand_id === brandId) continue
      otherBrandsByContact.set(
        row.contact_id,
        (otherBrandsByContact.get(row.contact_id) ?? 0) + 1,
      )
    }
  }

  const brandContactRows: BrandContactRow[] = contactBrandsRows
    .filter((r) => r.contacts !== null)
    .map((r) => {
      const contact = r.contacts!
      const pitchesForContact = detail.pitches.filter(
        (p) => p.contact_id === r.contact_id,
      )
      const lastTouch = pitchesForContact[0]?.created_at ?? null
      let lastCloseAmount: number | null = null
      let lastCloseCurrency: string | null = null
      let lastCloseDate: string | null = null
      for (const p of pitchesForContact) {
        const d = dealsByPitchId[p.id]
        if (!d || d.stage !== 'delivered') continue
        // Pick the deal with the latest updated_at among delivered ones.
        if (!lastCloseDate || d.updated_at > lastCloseDate) {
          lastCloseAmount = d.current_budget_amount ?? null
          lastCloseCurrency = d.current_budget_currency ?? null
          lastCloseDate = d.updated_at
        }
      }
      return {
        contactId: r.contact_id,
        displayName: contact.display_name,
        channels: (contact.channels ?? []).map((c) => ({
          kind: c.kind as BrandContactRow['channels'][number]['kind'],
          identifier: c.identifier,
          primary: c.primary,
        })),
        role: (r.role as ContactRole | null) ?? null,
        pitchesUnderBrand: pitchesForContact.length,
        lastCloseAmount,
        lastCloseCurrency,
        lastCloseDate,
        lastTouchDate: lastTouch,
        otherBrandsCount: otherBrandsByContact.get(r.contact_id) ?? 0,
      }
    })
    // Sort by recency of last touch (descending); contacts with no pitches
    // under this brand sink to the bottom.
    .sort((a, b) => {
      if (!a.lastTouchDate && !b.lastTouchDate) return 0
      if (!a.lastTouchDate) return 1
      if (!b.lastTouchDate) return -1
      return b.lastTouchDate.localeCompare(a.lastTouchDate)
    })

  const repeatLabel = detail.pitchCount === 1 ? '1st touch' : 'Repeat customer'
  const kicker = detail.isUnknown
    ? `Unknown sender · ${detail.pitchCount} ${detail.pitchCount === 1 ? 'pitch' : 'pitches'}`
    : `${repeatLabel} · since ${formatFullDate(detail.firstContactAt)}`

  const pitchesSubParts: string[] = []
  if (closedDealCount > 0)
    pitchesSubParts.push(
      `${closedDealCount} closed`,
    )
  if (inFlightCount > 0) pitchesSubParts.push(`${inFlightCount} in flight`)
  if (declinedCount > 0) pitchesSubParts.push(`${declinedCount} declined`)
  const pitchesSub = pitchesSubParts.length > 0 ? pitchesSubParts.join(' · ') : null

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

      {/* FR-7 W71 — BrandStatsStrip replaces the pre-FR-7 5-cell bd-headstrip
          per design canon §39 Surface B. First contact / Last contact / Avg
          deal cells are dropped from this surface — they remain in the
          page-sub line above for context. */}
      <BrandStatsStrip
        pitchesCount={detail.pitchCount}
        pitchesSub={pitchesSub}
        closedTotalAmount={topClosedAmount}
        closedTotalCurrency={topClosedCurrency}
        closedTotalSub={
          closedDealCount > 0
            ? `${closedDealCount} closed deal${closedDealCount === 1 ? '' : 's'}`
            : 'No closed deals yet'
        }
        contactsCount={contactsCount}
        contactsSub={contactsSub}
      />

      {/* FR-7 W71 — BrandContactsTable inserted between StatsStrip and
          BrandHistoryTable per design canon §39 surface ordering. */}
      <section className="brand-section">
        <div className="brand-section-h">
          <span className="brand-section-h-l">
            Contacts
            <span className="brand-section-h-l-meta">
              {contactsCount === 0
                ? 'none yet'
                : `${contactsCount} ${contactsCount === 1 ? 'contact' : 'contacts'}`}
            </span>
          </span>
        </div>
        <BrandContactsTable rows={brandContactRows} />
      </section>

      <BrandHistoryTable
        pitches={detail.pitches}
        dealsByPitchId={dealsByPitchId}
        activitiesByPitchId={activitiesByPitchId}
        tagsByPitchId={tagsByPitchId}
      />
    </div>
  )
}
