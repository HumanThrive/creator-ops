import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { BrandHistoryTable } from '@/components/BrandHistoryTable'
import { BrandStatsStrip } from '@/components/BrandStatsStrip'
import { AddPitchTrigger } from '@/components/AddPitchTrigger'
import {
  BrandContactsTable,
  type BrandContactRow,
  type ContactRole,
} from '@/components/BrandContactsTable'
import { computeBrandDetail, UNKNOWN_BRAND_SLUG } from '@/lib/brand-stats'
import { formatFullDate, formatRelativeTime } from '@/lib/format'
import type { Pitch } from '@/lib/types/pitch'
import type { Deal } from '@/lib/types/deal'
import type { Activity } from '@/lib/types/activity'

interface BrandDetailPageProps {
  params: Promise<{ brand: string }>
}

// uuid v4 detection — Postgres gen_random_uuid() shape (mirrors people/[person]).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface ResolvedBrand {
  id: string
  name: string
  slug: string | null
  previous_slugs: string[]
  created_at: string
}

interface ContactBrandsJoinRow {
  contact_id: string
  role: string | null
  contacts: {
    id: string
    display_name: string | null
    channels: Array<{ kind: string; identifier: string; primary: boolean }>
  } | null
}

// CR-7 S3 dual-route resolution (mirrors resolveContactByParam, FR-8 #75) plus
// the legacy lower(name) tier brands need that contacts didn't: old
// /app/brands/<encoded-name> URLs 301 to the canonical slug. Match order —
//   uuid → current slug → previous_slugs (301) → legacy lower(name) (301).
// `redirectTo` is non-null when the segment was a prior slug or a legacy name.
async function resolveBrandByParam(
  supabase: SupabaseClient,
  param: string,
): Promise<{ brand: ResolvedBrand | null; redirectTo: string | null }> {
  const cols = 'id, name, slug, previous_slugs, created_at'

  if (UUID_RE.test(param)) {
    const { data } = await supabase
      .from('brands')
      .select(cols)
      .eq('id', param)
      .maybeSingle()
    return { brand: (data as ResolvedBrand | null) ?? null, redirectTo: null }
  }

  // Current slug — canonical, no redirect.
  const { data: slugMatch } = await supabase
    .from('brands')
    .select(cols)
    .eq('slug', param)
    .maybeSingle()
  if (slugMatch) return { brand: slugMatch as ResolvedBrand, redirectTo: null }

  // Prior slug → 301 to the current canonical slug.
  const { data: prevMatch } = await supabase
    .from('brands')
    .select(cols)
    .contains('previous_slugs', [param])
    .maybeSingle()
  if (prevMatch && (prevMatch as ResolvedBrand).slug) {
    const m = prevMatch as ResolvedBrand
    return { brand: m, redirectTo: `/app/brands/${m.slug}` }
  }

  // Legacy old URL: encodeURIComponent(name) → decode + case-insensitive name
  // match (unique per user via brands_user_lower_name_uniq) → 301 to canonical.
  let decoded: string
  try {
    decoded = decodeURIComponent(param)
  } catch {
    return { brand: null, redirectTo: null }
  }
  const { data: nameMatch } = await supabase
    .from('brands')
    .select(cols)
    .ilike('name', decoded)
    .maybeSingle()
  if (nameMatch) {
    const m = nameMatch as ResolvedBrand
    return { brand: m, redirectTo: `/app/brands/${m.slug ?? m.id}` }
  }

  return { brand: null, redirectTo: null }
}

export async function generateMetadata({
  params,
}: BrandDetailPageProps): Promise<Metadata> {
  const { brand: param } = await params
  if (param === UNKNOWN_BRAND_SLUG) return { title: '(Unknown brand)' }
  const supabase = await createClient()
  const { brand } = await resolveBrandByParam(supabase, param)
  return { title: brand ? brand.name : 'Brands' }
}

export default async function BrandDetailPage({ params }: BrandDetailPageProps) {
  const supabase = await createClient()
  const { brand: param } = await params

  // ─── Resolve brand identity (CR-7: brand_id-canonical) ───────────────
  let brandId: string | null
  let displayName: string
  let isUnknown: boolean
  // Real brands only — the Unknown bucket never reaches the 0-pitch empty panel.
  let brandCreatedAt = ''

  if (param === UNKNOWN_BRAND_SLUG) {
    brandId = null
    displayName = '(Unknown brand)'
    isUnknown = true
  } else {
    const { brand, redirectTo } = await resolveBrandByParam(supabase, param)
    if (redirectTo) redirect(redirectTo) // 301 prior-slug / legacy-name → canonical
    if (!brand) redirect('/app/brands')
    brandId = brand.id
    displayName = brand.name
    isUnknown = false
    brandCreatedAt = brand.created_at
  }

  // ─── Load this brand's pitches by FK (NULL brand_id for the Unknown bucket) ─
  const baseQuery = supabase
    .from('pitches')
    .select('*')
    .order('created_at', { ascending: false })
  const { data: pitchData } = brandId
    ? await baseQuery.eq('brand_id', brandId)
    : await baseQuery.is('brand_id', null)

  const detail = computeBrandDetail((pitchData ?? []) as Pitch[])
  // FR-11 AC1.4 — a real 0-pitch brand is a valid destination: render the
  // empty-state panel (its rename/delete header rail lands in #91/#92). Only an
  // empty Unknown bucket still bounces.
  if (!detail) {
    if (isUnknown) redirect('/app/brands')
    return <BrandEmptyDetail displayName={displayName} createdAt={brandCreatedAt} />
  }

  const pitchIds = detail.pitches.map((p) => p.id)

  const [activitiesResult, tagsResult, allDealsResult, contactBrandsResult] =
    await Promise.all([
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
      supabase.from('deals').select('*').in('pitch_id', pitchIds),
      // contacts table keys on brand_id; the Unknown bucket has none.
      brandId
        ? supabase
            .from('contact_brands')
            .select('contact_id, role, contacts(id, display_name, channels)')
            .eq('brand_id', brandId)
            .is('ended_at', null)
        : Promise.resolve({ data: [] as ContactBrandsJoinRow[], error: null }),
    ])

  const allDeals = (allDealsResult.data ?? []) as Deal[]

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
  // Closed total = SUM(current_budget_amount) over deals.stage='delivered' for
  // pitches under this brand. Single dominant currency at v1 — pick the currency
  // with the largest delivered sum; "—" fallback when there's no closed deal.
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

  const contactBrandsRows =
    (contactBrandsResult.data as ContactBrandsJoinRow[] | null) ?? []

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
  const contactsSub = rolePartsArr.length > 0 ? rolePartsArr.join(' · ') : null

  // ─── FR-7 W71: BrandContactsTable per-row aggregations ─────────────
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
  const kicker = isUnknown
    ? `Unknown sender · ${detail.pitchCount} ${detail.pitchCount === 1 ? 'pitch' : 'pitches'}`
    : `${repeatLabel} · since ${formatFullDate(detail.firstContactAt)}`

  const pitchesSubParts: string[] = []
  if (closedDealCount > 0) pitchesSubParts.push(`${closedDealCount} closed`)
  if (inFlightCount > 0) pitchesSubParts.push(`${inFlightCount} in flight`)
  if (declinedCount > 0) pitchesSubParts.push(`${declinedCount} declined`)
  const pitchesSub = pitchesSubParts.length > 0 ? pitchesSubParts.join(' · ') : null

  return (
    <>
      <div className="subnav">
        <Link href="/app/brands" className="back">
          <span>←</span>Back to Brands
        </Link>
        <span className="sep">·</span>
        <span>Brands</span>
        <span className="sep">·</span>
        <span className="here">{displayName}</span>
      </div>
    <div className="page">
      <div className="page-head">
        <div className="page-head-l">
          <span className="kicker">{kicker}</span>
          <h1 className="page-h1">{displayName}.</h1>
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
        <BrandContactsTable
          rows={brandContactRows}
          brandId={brandId ?? ''}
          brandName={displayName}
        />
      </section>

      {/* FR-7 W71 smoke fix — wrap BrandHistoryTable in brand-section so
          the "Pitch history" kicker matches design canon §39 (was missing
          on first ship; caught at Founder smoke 2026-05-26). */}
      <section className="brand-section">
        <div className="brand-section-h">
          <span className="brand-section-h-l">
            Pitch history
            <span className="brand-section-h-l-meta">
              {detail.pitchCount === 1 ? '1 pitch' : `${detail.pitchCount} pitches · newest first`}
            </span>
          </span>
        </div>
        <BrandHistoryTable
          pitches={detail.pitches}
          dealsByPitchId={dealsByPitchId}
          activitiesByPitchId={activitiesByPitchId}
          tagsByPitchId={tagsByPitchId}
        />
      </section>
    </div>
    </>
  )
}

// FR-11 AC1.4 — the 0-pitch brand detail (design Ask 03 "inviting empty panel").
// Normally the StatsStrip + History + Contacts tables carry this page; with zero
// pitches there's nothing to fill them, so the body collapses to one dashed-slate
// panel that teaches the next action. The page-head keeps the brand identity; the
// rename/delete header rail is added by #91/#92.
function BrandEmptyDetail({
  displayName,
  createdAt,
}: {
  displayName: string
  createdAt: string
}) {
  return (
    <>
      <div className="subnav">
        <Link href="/app/brands" className="back">
          <span>←</span>Back to Brands
        </Link>
        <span className="sep">·</span>
        <span>Brands</span>
        <span className="sep">·</span>
        <span className="here">{displayName}</span>
      </div>
      <div className="page">
        <div className="page-head">
          <div className="page-head-l">
            <span className="kicker">
              Added {formatRelativeTime(createdAt)} &middot; no pitches yet
            </span>
            <h1 className="page-h1">{displayName}.</h1>
          </div>
        </div>

        <div className="empty-panel">
          <span className="empty-panel-kicker">No pitches yet</span>
          <h2 className="empty-panel-h">
            Ready for its first pitch<span className="dot">.</span>
          </h2>
          <p className="empty-panel-p">
            <b>{displayName}</b> is on your board, but nothing&rsquo;s tracked
            against it yet. Paste a brand-deal message &mdash; received or sent
            &mdash; and the AI extracts the budget, deliverables and deal terms,
            then files them here. Stats and history fill in from the first pitch.
          </p>
          <div className="empty-panel-cta-row">
            <AddPitchTrigger className="btn-pill" label="Paste a pitch ↘" />
            <AddPitchTrigger
              className="btn-pill is-ghost"
              label="Log an outbound pitch ↗"
            />
          </div>
          <div className="empty-panel-steps">
            <span className="empty-step">
              <b>Next</b> &middot; pitch lands here
            </span>
            <span className="empty-step">&rarr; stats fill in</span>
            <span className="empty-step">&rarr; contacts link automatically</span>
          </div>
        </div>
      </div>
    </>
  )
}
