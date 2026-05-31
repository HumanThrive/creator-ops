import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { PeopleList } from '@/components/PeopleList'
import { PeopleStatsStrip } from '@/components/PeopleStatsStrip'
import { NewContactTrigger } from '@/components/NewContactTrigger'
import {
  computeContactSummaries,
  computePeopleStats,
  contactMatchesQuery,
  type ContactSummary,
} from '@/lib/contact-stats'
import type { Contact, ContactBrand } from '@/lib/types/contact'
import type { Pitch } from '@/lib/types/pitch'

// FR-8 S1 (slice #75) — `/app/people` Contacts index. Server component;
// loads + aggregates; hands filtered/sorted list to <PeopleList> client.
//
// Spec: workspace/build-requests/FR-8-contact-management.md §Architecture +
//       §Design-locked deltas D2 (Variant B row, PeopleStatsStrip, search +
//       sort URL-persisted, multi-role +N affix popover, empty state, mobile).
// Route param: keep `[person]` on the detail page per FR-7 disk reality +
// Delta 6; canonical URL for `/app/people` is the index itself.

export const metadata: Metadata = {
  title: 'People',
}

type SortMode = 'recent' | 'alpha'

interface PeoplePageProps {
  searchParams: Promise<{ q?: string; sort?: string }>
}

interface ContactBrandJoin extends ContactBrand {
  brands: { id: string; name: string } | null
}

export default async function PeoplePage({ searchParams }: PeoplePageProps) {
  const { q: rawQ, sort: rawSort } = await searchParams
  const q = (rawQ ?? '').trim()
  const sort: SortMode = rawSort === 'alpha' ? 'alpha' : 'recent'

  const supabase = await createClient()

  // Parallel load — mirrors brands/page.tsx pattern; RLS scopes to authed user.
  const [contactsRes, contactBrandsRes, contactPitchesRes, pitchesRes] =
    await Promise.all([
      supabase.from('contacts').select('*'),
      supabase
        .from('contact_brands')
        .select('*, brands(id, name)'),
      supabase.from('contact_pitches').select('contact_id, pitch_id'),
      supabase.from('pitches').select('id, brand_id, created_at'),
    ])

  const error =
    contactsRes.error ??
    contactBrandsRes.error ??
    contactPitchesRes.error ??
    pitchesRes.error

  const contacts = (contactsRes.data ?? []) as Contact[]
  const contactBrandsRaw = (contactBrandsRes.data ?? []) as ContactBrandJoin[]
  const contactPitches = (contactPitchesRes.data ?? []) as {
    contact_id: string
    pitch_id: string
  }[]
  // Pitches projection (only fields needed for last-touch + current-brand window).
  const pitchesProjection = (pitchesRes.data ?? []) as Array<
    Pick<Pitch, 'id' | 'brand_id' | 'created_at'>
  >

  // Build brand lookup from the joined contact_brands rows.
  const brandLookup = new Map<string, { id: string; name: string }>()
  for (const cb of contactBrandsRaw) {
    if (cb.brands) brandLookup.set(cb.brands.id, cb.brands)
  }

  // Strip the joined `brands` field; helpers want the pivot shape only.
  const contactBrands: ContactBrand[] = contactBrandsRaw.map((cb) => ({
    contact_id: cb.contact_id,
    brand_id: cb.brand_id,
    user_id: cb.user_id,
    role: cb.role,
    ended_at: cb.ended_at,
    ended_reason: cb.ended_reason,
    created_at: cb.created_at,
    updated_at: cb.updated_at,
  }))

  const summaries = computeContactSummaries(
    contacts,
    contactBrands,
    contactPitches,
    // Helper expects full Pitch[]; the projection is sufficient because
    // current-brand derivation only reads brand_id + created_at.
    pitchesProjection as Pitch[],
    brandLookup,
  )

  const stats = computePeopleStats(summaries, contactBrands, brandLookup)

  const filtered: ContactSummary[] = q
    ? summaries.filter((s) => contactMatchesQuery(s, q))
    : summaries

  const sorted = [...filtered].sort((a, b) => {
    if (sort === 'alpha') {
      return a.display_name.localeCompare(b.display_name)
    }
    // 'recent': last_touch_at descending; null last_touch lands at the bottom.
    if (a.last_touch_at && b.last_touch_at) {
      return b.last_touch_at.localeCompare(a.last_touch_at)
    }
    if (a.last_touch_at && !b.last_touch_at) return -1
    if (!a.last_touch_at && b.last_touch_at) return 1
    return a.display_name.localeCompare(b.display_name)
  })

  const isTotallyEmpty = summaries.length === 0

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-l">
          <span className="kicker">
            Your asset · {stats.total} {stats.total === 1 ? 'contact' : 'contacts'}
            {stats.most_touched_brand
              ? ` · most-touched: ${stats.most_touched_brand.brand_name}`
              : ''}
          </span>
          <h1 className="page-h1">People.</h1>
          <p className="page-sub">
            Every contact you&rsquo;ve tracked &mdash; the humans behind the brands.
            Search, sort, or add someone you met outside an inbound pitch.
          </p>
        </div>
      </div>

      {error ? (
        <p className="text-sm text-red-600">
          Couldn&rsquo;t load contacts. Refresh to try again.
        </p>
      ) : isTotallyEmpty ? (
        <PeopleEmptyState />
      ) : (
        <>
          <PeopleStatsStrip stats={stats} />
          <PeopleList
            contacts={sorted}
            totalCount={summaries.length}
            query={q}
            sort={sort}
          />
        </>
      )}
    </div>
  )
}

function PeopleEmptyState() {
  return (
    <div className="people-empty">
      <h2 className="font-display text-5xl uppercase tracking-wide text-ink">
        No people yet.
      </h2>
      <p className="people-empty-p">
        Contacts land here as you save pitches &mdash; or add someone you met
        outside an inbound pitch.
      </p>
      <NewContactTrigger className="btn-pill" />
    </div>
  )
}
