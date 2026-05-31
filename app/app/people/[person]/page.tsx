import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { BrandStatsStrip } from '@/components/BrandStatsStrip'
import { BrandAssocRoleControl } from '@/components/BrandAssocRoleControl'
import { BrandAssocReactivate } from '@/components/BrandAssocReactivate'
import { PersonNameEditor } from '@/components/PersonNameEditor'
import { ChannelsEditor } from '@/components/ChannelsEditor'
import { brandSlug, formatCurrencyAmount } from '@/lib/pitch-stats'
import { formatFullDate, formatRelativeTime } from '@/lib/format'
import type { Pitch } from '@/lib/types/pitch'
import type { Deal, DealStage } from '@/lib/types/deal'

// FR-7 W72 — Contact detail page per design canon §40 Surface C.
// FR-8 #75 — extended with dual-route handler (uuid OR slug) + previous_slugs
//            fallback + 301-redirect from old slug → current slug. Slug-NULL
//            Contacts continue to route by uuid only (Delta 6).
//
// Route: /app/people/[person] where [person] = contact UUID OR slug.
//
// Renders: PersonHead + ChannelsStrip + StatsStrip + Stacked Brand cards.
// Combined flat PitchHistory deferred per LD pick at slice (brand-card
// grouping IS the per-Brand history view; the flat list is redundant at v1
// scale of <20 pitches per contact).

// uuid v4 detection — Postgres `gen_random_uuid()` always emits this shape.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface ResolvedContactBase {
  id: string
  display_name: string | null
  channels: ChannelEntry[]
  slug: string | null
  previous_slugs: string[]
}

// Dual-route resolution. Returns the contact row + a non-null `redirectTo`
// when the requested path-segment is a *prior* slug — caller redirects to
// the current canonical slug. Returns `null` contact when not found.
async function resolveContactByParam(
  supabase: SupabaseClient,
  param: string,
): Promise<{ contact: ResolvedContactBase | null; redirectTo: string | null }> {
  const isUuid = UUID_RE.test(param)

  if (isUuid) {
    const { data } = await supabase
      .from('contacts')
      .select('id, display_name, channels, slug, previous_slugs')
      .eq('id', param)
      .maybeSingle()
    return { contact: (data as ResolvedContactBase | null) ?? null, redirectTo: null }
  }

  // Slug path — try current slug first.
  const { data: slugMatch } = await supabase
    .from('contacts')
    .select('id, display_name, channels, slug, previous_slugs')
    .eq('slug', param)
    .maybeSingle()
  if (slugMatch) {
    return { contact: slugMatch as ResolvedContactBase, redirectTo: null }
  }

  // Fall back to previous_slugs membership; 301 → current canonical slug.
  const { data: prevMatch } = await supabase
    .from('contacts')
    .select('id, display_name, channels, slug, previous_slugs')
    .contains('previous_slugs', [param])
    .maybeSingle()
  if (prevMatch && (prevMatch as ResolvedContactBase).slug) {
    const m = prevMatch as ResolvedContactBase
    return { contact: m, redirectTo: `/app/people/${m.slug}` }
  }

  return { contact: null, redirectTo: null }
}

type ChannelKind =
  | 'Email'
  | 'IG'
  | 'TikTok'
  | 'WhatsApp'
  | 'X'
  | 'IRL'
  | 'Facebook'
  | 'LinkedIn'
  | 'Website'

interface ChannelEntry {
  kind: ChannelKind
  identifier: string
  primary: boolean
}

type ContactRole = 'PR' | 'Brand team' | 'Connector' | 'Founder' | 'Other'

const ROLE_CLASS: Record<ContactRole, string> = {
  PR: '',
  'Brand team': '',
  Connector: 'is-connector',
  Founder: '',
  Other: '',
}

// (Local CHANNEL_KIND_CLASS constant removed in FR-8 #77 — channel rendering
// moved to <ChannelsEditor>. Shared mapping lives at @/lib/types/contact for
// any future inline use.)

const CURRENT_BRAND_WINDOW_DAYS = 90

interface PersonPageProps {
  params: Promise<{ person: string }>
}

export async function generateMetadata({
  params,
}: PersonPageProps): Promise<Metadata> {
  const { person: param } = await params
  const supabase = await createClient()
  const { contact } = await resolveContactByParam(supabase, param)
  return {
    title: contact?.display_name ? `${contact.display_name} · Contact` : 'Contact',
  }
}

interface ContactRow {
  id: string
  display_name: string | null
  channels: ChannelEntry[]
}

interface ContactBrandRow {
  brand_id: string
  role: string | null
  ended_at: string | null
  ended_reason: string | null
  brands: { id: string; name: string } | null
}

export default async function ContactDetailPage({ params }: PersonPageProps) {
  const supabase = await createClient()
  const { person: param } = await params

  // ─── Dual-route resolution (FR-8 #75): uuid OR slug OR previous_slugs ─
  const { contact: resolved, redirectTo } = await resolveContactByParam(
    supabase,
    param,
  )
  if (redirectTo) redirect(redirectTo) // 301 from prior slug → current slug
  if (!resolved) notFound()
  const contactId = resolved.id
  const contact: ContactRow = {
    id: resolved.id,
    display_name: resolved.display_name,
    channels: resolved.channels,
  }

  // ─── Load all brand associations + pitches via pivots + deals ────────
  // FR-8 #76 AC5.6: include ended associations in this load — the Contact-
  // detail page renders them with the ENDED visual canon (Delta 4 — dashed
  // border + dimmed head + ENDED tag + Reactivate pill in foot). The lens /
  // BrandContactsTable surfaces filter ended_at NULL at their query boundary.
  const [contactBrandsRes, contactPitchesRes] = await Promise.all([
    supabase
      .from('contact_brands')
      .select('brand_id, role, ended_at, ended_reason, brands(id, name)')
      .eq('contact_id', contactId),
    supabase
      .from('contact_pitches')
      .select('pitch_id, pitches(*)')
      .eq('contact_id', contactId),
  ])

  const contactBrands = (contactBrandsRes.data as ContactBrandRow[] | null) ?? []
  const pitchRows = (contactPitchesRes.data as
    | { pitch_id: string; pitches: Pitch | null }[]
    | null) ?? []
  const pitches: Pitch[] = pitchRows
    .map((r) => r.pitches)
    .filter((p): p is Pitch => p !== null)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))

  // Deals for the pitches above — gives stage + budget aggregation per row.
  const pitchIds = pitches.map((p) => p.id)
  const dealsRes = pitchIds.length > 0
    ? await supabase.from('deals').select('*').in('pitch_id', pitchIds)
    : { data: [] as Deal[], error: null }
  const allDeals = (dealsRes.data as Deal[] | null) ?? []
  const dealByPitchId = new Map<string, Deal>()
  for (const d of allDeals) {
    dealByPitchId.set(d.pitch_id, d)
  }

  // ─── Aggregates for StatsStrip ───────────────────────────────────────
  let closedAccByCurrency = new Map<string, number>()
  let closedCount = 0
  for (const d of allDeals) {
    if (d.stage === 'delivered') {
      closedCount++
      if (d.current_budget_amount && d.current_budget_currency) {
        const cur = d.current_budget_currency
        closedAccByCurrency.set(
          cur,
          (closedAccByCurrency.get(cur) ?? 0) + d.current_budget_amount,
        )
      }
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
  const brandAssociationsCount = contactBrands.length

  // ─── Stacked Brand cards: bucket pitches per Brand association ───────
  // "Current" Brand heuristic (Gap 3 (a) LD-picks per FR-7 spec): Brand with
  // most recent pitch within the last 90 days. "Concurrent client" pill
  // (middleman case): when a Contact has 2+ Brand-associations with
  // overlapping active windows (defined as a pitch in the last 90 days for
  // each Brand).
  // FR-8 #76 AC5.6: ended associations are excluded from active heuristics
  // (Current / Concurrent / Prior). They get their own ENDED tag (overrides
  // all three) + Variant 1 visual treatment (dashed border + dimmed head +
  // Reactivate pill). Build the ended-id set up-front so the recent/all maps
  // skip those brand_ids entirely.
  const endedBrandIds = new Set<string>()
  for (const cb of contactBrands) {
    if (cb.ended_at) endedBrandIds.add(cb.brand_id)
  }
  const now = Date.now()
  const DAY_MS = 24 * 60 * 60 * 1000
  const recentByBrandId = new Map<string, number>() // brand_id -> count of pitches in last N days
  const allByBrandId = new Map<string, Pitch[]>()
  for (const p of pitches) {
    if (!p.brand_id) continue
    const bucket = allByBrandId.get(p.brand_id) ?? []
    bucket.push(p)
    allByBrandId.set(p.brand_id, bucket)
    if (
      !endedBrandIds.has(p.brand_id) &&
      now - new Date(p.created_at).getTime() <
        CURRENT_BRAND_WINDOW_DAYS * DAY_MS
    ) {
      recentByBrandId.set(p.brand_id, (recentByBrandId.get(p.brand_id) ?? 0) + 1)
    }
  }
  // "Current" = single Brand with most-recent pitch overall, IF that pitch
  // is within the 90-day window. Concurrent = 2+ Brands with recent activity.
  let currentBrandId: string | null = null
  if (pitches.length > 0 && recentByBrandId.size === 1) {
    currentBrandId = pitches[0].brand_id ?? null
  } else if (recentByBrandId.size === 1) {
    currentBrandId = Array.from(recentByBrandId.keys())[0] ?? null
  }
  const isConcurrentMultiBrand = recentByBrandId.size > 1

  // Render order: Brands with most-recent pitch first (Current at top);
  // Brands with no pitches at the bottom; ties broken by name.
  const lastPitchByBrandId = new Map<string, string | null>()
  for (const [brandId, ps] of allByBrandId.entries()) {
    lastPitchByBrandId.set(brandId, ps[0]?.created_at ?? null)
  }
  const sortedBrandAssociations = [...contactBrands].sort((a, b) => {
    const aDate = lastPitchByBrandId.get(a.brand_id) ?? null
    const bDate = lastPitchByBrandId.get(b.brand_id) ?? null
    if (!aDate && !bDate) {
      return (a.brands?.name ?? '').localeCompare(b.brands?.name ?? '')
    }
    if (!aDate) return 1
    if (!bDate) return -1
    return bDate.localeCompare(aDate)
  })

  // ─── PersonHead meta ────────────────────────────────────────────────
  const displayName = contact.display_name ?? '(no name)'
  const firstPitchAt = pitches.length > 0
    ? pitches[pitches.length - 1].created_at
    : null
  const lastPitchAt = pitches.length > 0 ? pitches[0].created_at : null

  // Primary role: most common role across associations; null if none specified.
  const roleCounts: Record<string, number> = {}
  for (const cb of contactBrands) {
    if (cb.role) roleCounts[cb.role] = (roleCounts[cb.role] ?? 0) + 1
  }
  let primaryRole: ContactRole | null = null
  let topRoleCount = 0
  for (const [role, n] of Object.entries(roleCounts)) {
    if (n > topRoleCount) {
      topRoleCount = n
      primaryRole = role as ContactRole
    }
  }

  return (
    <>
      <div className="subnav">
        <Link href="/app" className="back">
          <span>←</span>Back to App
        </Link>
        <span className="sep">·</span>
        <span>People</span>
        <span className="sep">·</span>
        <span className="here">{displayName}</span>
      </div>
    <div className="page">
      <section className="person-head">
        <div className="person-head-avatar">{initials(displayName)}</div>
        <div className="person-head-body">
          <span className="person-head-kicker">
            {firstPitchAt
              ? `Tracked since ${formatFullDate(firstPitchAt)}`
              : 'New contact · no pitches yet'}
          </span>
          <PersonNameEditor
            contactId={contactId}
            initialDisplayName={displayName}
            initialDisplayNameRaw={contact.display_name}
            currentSlug={resolved.slug}
          />
          <div className="person-meta">
            {primaryRole ? (
              <span>
                <span className={`role-pill ${ROLE_CLASS[primaryRole]}`}>
                  {primaryRole}
                </span>
              </span>
            ) : null}
            {lastPitchAt ? (
              <span>Last contact {formatRelativeTime(lastPitchAt)}</span>
            ) : null}
            {brandAssociationsCount > 0 ? (
              <span>
                {brandAssociationsCount} brand
                {brandAssociationsCount === 1 ? '' : 's'}
              </span>
            ) : null}
            {isConcurrentMultiBrand ? (
              <span>
                <span className="role-pill is-connector">
                  Concurrent client
                </span>
              </span>
            ) : null}
          </div>
        </div>
      </section>

      {/* FR-8 #77: ChannelsEditor handles both display + edit modes. Renders
          the existing chip layout in display mode + the kind/identifier/Primary/
          Remove + Add row editor in edit mode. Shows an Edit affordance even
          when zero channels so the user can add the first one. */}
      <ChannelsEditor
        contactId={contactId}
        initialChannels={contact.channels}
      />

      <BrandStatsStrip
        pitchesCount={pitches.length}
        pitchesSub={
          pitches.length === 0
            ? 'No pitches yet'
            : `${closedCount} closed${closedCount > 0 ? ` · ${pitches.length - closedCount} active` : ''}`
        }
        closedTotalAmount={topClosedAmount}
        closedTotalCurrency={topClosedCurrency}
        closedTotalSub={
          closedCount > 0
            ? `${closedCount} closed deal${closedCount === 1 ? '' : 's'}`
            : 'No closed deals yet'
        }
        contactsCount={brandAssociationsCount}
        contactsSub={
          brandAssociationsCount === 0
            ? null
            : isConcurrentMultiBrand
              ? 'Concurrent across brands'
              : 'Brand associations'
        }
      />

      <section className="brand-section">
        <div className="brand-section-h">
          <span className="brand-section-h-l">
            Brand chain
            <span className="brand-section-h-l-meta">
              {brandAssociationsCount === 0
                ? 'no associations yet'
                : `${brandAssociationsCount} ${brandAssociationsCount === 1 ? 'brand' : 'brands'}`}
            </span>
          </span>
        </div>
        {sortedBrandAssociations.length === 0 ? (
          <div className="contacts-empty">
            <p className="contacts-empty-l">
              No brand associations <em>yet</em>
            </p>
            <p className="contacts-empty-p">
              This contact has no Brand association on file. New brand
              associations land here as inbound pitches resolve the
              contact-brand pivot.
            </p>
          </div>
        ) : (
          <div className="brand-cards">
            {sortedBrandAssociations.map((cb) => {
              const brand = cb.brands
              if (!brand) return null
              const brandPitches = allByBrandId.get(brand.id) ?? []
              const isEnded = cb.ended_at !== null
              const isCurrent = !isEnded && brand.id === currentBrandId
              const recentCount = recentByBrandId.get(brand.id) ?? 0
              // ENDED tag overrides Current/Concurrent/Prior per Delta 4.
              const tag: { label: string; cls: string } | null = isEnded
                ? {
                    label: `ENDED · ${formatMonYear(cb.ended_at!)}`,
                    cls: 'is-ended',
                  }
                : isCurrent
                  ? { label: 'Current', cls: '' }
                  : isConcurrentMultiBrand && recentCount > 0
                    ? { label: 'Concurrent', cls: 'is-concurrent' }
                    : recentCount === 0 && brandPitches.length > 0
                      ? { label: 'Prior', cls: 'is-prior' }
                      : null
              return (
                <BrandCard
                  key={brand.id}
                  contactId={contactId}
                  contactName={displayName}
                  brandId={brand.id}
                  brandName={brand.name}
                  role={(cb.role as ContactRole | null) ?? null}
                  pitches={brandPitches}
                  dealByPitchId={dealByPitchId}
                  isCurrent={isCurrent}
                  isEnded={isEnded}
                  tag={tag}
                />
              )
            })}
          </div>
        )}
      </section>
    </div>
    </>
  )
}

interface BrandCardProps {
  contactId: string
  contactName: string
  brandId: string
  brandName: string
  role: ContactRole | null
  pitches: Pitch[]
  dealByPitchId: Map<string, Deal>
  isCurrent: boolean
  isEnded: boolean
  tag: { label: string; cls: string } | null
}

function BrandCard({
  contactId,
  contactName,
  brandId,
  brandName,
  role,
  pitches,
  dealByPitchId,
  isCurrent,
  isEnded,
  tag,
}: BrandCardProps) {
  const lastPitchDate = pitches[0]?.created_at ?? null
  let closedAmount = 0
  let closedCurrency: string | null = null
  let closedCount = 0
  for (const p of pitches) {
    const d = dealByPitchId.get(p.id)
    if (d?.stage === 'delivered' && d.current_budget_amount) {
      closedAmount += d.current_budget_amount
      closedCurrency = closedCurrency ?? d.current_budget_currency ?? null
      closedCount += 1
    }
  }
  const closedDisplay =
    closedAmount > 0 && closedCurrency
      ? formatCurrencyAmount(closedCurrency, closedAmount)
      : null

  // ENDED card variants per Delta 4: dashed border + dimmed head + ENDED tag
  // (tag already computed by parent + passed in `tag`).
  const cardClass = [
    'brand-card',
    isCurrent ? 'is-current' : '',
    isEnded ? 'is-ended' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <article className={cardClass}>
      <header className="brand-card-h">
        <div className="brand-card-avatar">{initials(brandName)}</div>
        <div className="brand-card-id">
          <Link
            href={`/app/brands/${brandSlug(brandName)}`}
            className="brand-card-name"
            style={{ textDecoration: 'none' }}
          >
            {brandName}
            <span className="dot">.</span>
            {tag ? (
              <span className={`brand-card-name-tag ${tag.cls}`}>
                {tag.label}
              </span>
            ) : null}
          </Link>
          <span className="brand-card-sub">
            <BrandAssocRoleControl
              contactId={contactId}
              brandId={brandId}
              brandName={brandName}
              contactName={contactName}
              initialRole={role}
              pitchCountForPair={pitches.length}
              closedDealCount={closedCount}
              closedDealAmountDisplay={closedDisplay}
              variant="card-foot"
            />
            {lastPitchDate ? ` · last ${formatRelativeTime(lastPitchDate)}` : ''}
            {` · ${pitches.length} ${pitches.length === 1 ? 'pitch' : 'pitches'}`}
          </span>
        </div>
        <div className="brand-card-meta">
          <span className="brand-card-meta-v">
            {closedDisplay ?? '—'}
          </span>
          <span>Closed</span>
        </div>
      </header>
      <div className="brand-card-body">
        {pitches.length === 0 ? (
          <p
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 11,
              color: 'var(--ink-4)',
              padding: '12px 0',
              margin: 0,
              fontStyle: 'italic',
            }}
          >
            No pitches under this brand yet.
          </p>
        ) : (
          <>
            <div className="brand-card-body-h">
              <span>When</span>
              <span>Pitch</span>
              <span className="h-stage">Stage</span>
              <span>Value</span>
            </div>
            {pitches.map((p) => {
              const d = dealByPitchId.get(p.id)
              const stage: DealStage | null = d?.stage ?? null
              const stageClass = stage ? `bcpr-stage ${stage}` : 'bcpr-stage'
              const amountDisplay =
                d?.current_budget_amount && d.current_budget_currency
                  ? formatCurrencyAmount(
                      d.current_budget_currency,
                      d.current_budget_amount,
                    )
                  : p.budget_amount && p.budget_currency
                    ? formatCurrencyAmount(p.budget_currency, p.budget_amount)
                    : '—'
              const isAccent = stage === 'delivered'
              return (
                <div className="brand-card-pitch-row" key={p.id}>
                  <span className="bcpr-when">
                    {formatShortDate(p.created_at)}
                  </span>
                  <span className="bcpr-summary">
                    {p.ai_summary ? (
                      <b>{truncate(p.ai_summary, 80)}</b>
                    ) : (
                      <span style={{ color: 'var(--ink-3)' }}>
                        {truncate(p.raw_pitch_text, 80)}
                      </span>
                    )}
                  </span>
                  {stage ? (
                    <span className={stageClass}>{formatStage(stage)}</span>
                  ) : (
                    <span style={{ color: 'var(--ink-4)', fontSize: 11 }}>
                      —
                    </span>
                  )}
                  <span
                    className={`bcpr-amt ${isAccent ? 'is-accent' : ''}`}
                  >
                    {amountDisplay}
                  </span>
                </div>
              )
            })}
          </>
        )}
      </div>
      {isEnded ? (
        <footer className="brand-card-foot">
          <BrandAssocReactivate contactId={contactId} brandId={brandId} />
        </footer>
      ) : null}
    </article>
  )
}

const FULL_MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const

function formatMonYear(iso: string): string {
  const d = new Date(iso)
  return `${FULL_MONTHS[d.getMonth()].toUpperCase()} ${d.getFullYear()}`
}

function initials(name: string | null | undefined): string {
  if (!name) return '·'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '·'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

const SHORT_MONTHS = [
  'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
  'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
] as const

function formatShortDate(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const sameYear = d.getFullYear() === now.getFullYear()
  const month = SHORT_MONTHS[d.getMonth()]
  return sameYear
    ? `${month} ${d.getDate()}`
    : `${month} ${d.getFullYear()}`
}

function formatStage(stage: DealStage): string {
  switch (stage) {
    case 'inbox': return 'Inbox'
    case 'negotiating': return 'Negotiating'
    case 'confirmed': return 'Confirmed'
    case 'delivered': return 'Delivered'
    case 'rejected': return 'Declined'
    default: return stage
  }
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  return s.slice(0, max - 1).trim() + '…'
}
