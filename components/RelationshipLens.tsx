'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { brandSlug, formatCurrencyAmount } from '@/lib/pitch-stats'
import type { Pitch } from '@/lib/types/pitch'
import type { Deal, DealStage } from '@/lib/types/deal'

// FR-7 W70 — Relationship Lens (V4 peer-of-history)
//
// Per design canon §38 + AC4.1–AC4.5:
//   - Inbound + at least one of (brand_id, contact_id): full lens with 5
//     signal rows derived from FR-7 v1 schema (Gap 3 (a) Founder lock 2026-05-25
//     — LD picks copy/format/thresholds).
//   - Inbound + first touch (no brand_id / no contact_id, both NULL): sparse
//     `is-empty` rendering — acknowledges absence without empty-row scaffolding.
//   - Outbound: dashed-border placeholder (lens is inbound-only).
//
// AC4.4 drift gate: the lens fires ONLY at PitchDetailModal-open (parent owns
// mount lifecycle); never as a banner / nudge / notification outside the modal.

interface RelationshipLensProps {
  pitch: Pitch
}

interface BrandHistory {
  total: number
  delivered: number
  declined: number
  totalClosedValue: number
  totalClosedCurrency: string | null
}

interface OtherContactsCount {
  count: number
  topName: string | null
}

interface ContactCadence {
  lastTouchDaysAgo: number | null
  lastTouchAt: string | null
}

interface ContactOutcomes {
  total: number
  delivered: number
  declined: number
  totalClosedValue: number
  totalClosedCurrency: string | null
}

interface BrandChainEntry {
  brandId: string
  brandName: string
}

interface LensData {
  brandHistory: BrandHistory | null
  otherContacts: OtherContactsCount | null
  cadence: ContactCadence | null
  outcomes: ContactOutcomes | null
  brandChain: BrandChainEntry[] | null
}

const DAY_MS = 24 * 60 * 60 * 1000

function daysBetween(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / DAY_MS)
}

export function RelationshipLens({ pitch }: RelationshipLensProps) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [data, setData] = useState<LensData | null>(null)
  const [loading, setLoading] = useState(false)

  const isInbound = pitch.direction === 'inbound'
  const hasBrand = pitch.brand_id !== null
  const hasContact = pitch.contact_id !== null
  const isFirstTouch = isInbound && !hasBrand && !hasContact

  useEffect(() => {
    if (!isInbound) return
    if (!hasBrand && !hasContact) return
    let cancelled = false
    async function run() {
      setLoading(true)
      const [
        brandPitchesRes,
        brandPivotsRes,
        contactPitchesRes,
        contactPivotsRes,
      ] = await Promise.all([
        // Brand history: all OTHER pitches under this Brand (excl. current).
        hasBrand
          ? supabase
              .from('pitches')
              .select('id, brand_currency:budget_currency')
              .eq('brand_id', pitch.brand_id!)
              .neq('id', pitch.id)
          : Promise.resolve({ data: [] as { id: string }[], error: null }),
        // Other contacts at Brand: contact_brands pivot rows under same Brand,
        // joined to contacts for display name on the first other contact.
        // FR-8 #76 AC5.6: exclude ended associations from "other contacts"
        // signal — ended relationships don't count toward active lens context.
        hasBrand
          ? supabase
              .from('contact_brands')
              .select('contact_id, contacts(display_name)')
              .eq('brand_id', pitch.brand_id!)
              .is('ended_at', null)
          : Promise.resolve({
              data: [] as {
                contact_id: string
                contacts: { display_name: string | null } | null
              }[],
              error: null,
            }),
        // Contact cadence + outcomes: all OTHER pitches under this Contact
        // (excl. current). created_at drives the cadence row; joining deals
        // below covers outcomes.
        hasContact
          ? supabase
              .from('pitches')
              .select('id, created_at')
              .eq('contact_id', pitch.contact_id!)
              .neq('id', pitch.id)
              .order('created_at', { ascending: false })
          : Promise.resolve({ data: [] as { id: string; created_at: string }[], error: null }),
        // Brand chain: contact_brands pivot rows under this Contact, joined to
        // brands for display name; filter the current Brand out client-side.
        // FR-8 #76 AC5.6: exclude ended associations from the active brand
        // chain — ended brands stay visible on Contact-detail (Delta 4) but
        // not in the lens's current-relationship-context summary.
        hasContact
          ? supabase
              .from('contact_brands')
              .select('brand_id, brands(name)')
              .eq('contact_id', pitch.contact_id!)
              .is('ended_at', null)
          : Promise.resolve({
              data: [] as {
                brand_id: string
                brands: { name: string | null } | null
              }[],
              error: null,
            }),
      ])

      if (cancelled) return

      // ─── Brand history aggregations ───────────────────────────────
      let brandHistory: BrandHistory | null = null
      if (hasBrand) {
        const pitchIds = ((brandPitchesRes.data as { id: string }[] | null) ?? [])
          .map((p) => p.id)
        let dealsByPitch: Map<string, Deal> = new Map()
        if (pitchIds.length > 0) {
          const dealsRes = await supabase
            .from('deals')
            .select('*')
            .in('pitch_id', pitchIds)
          if (!cancelled && dealsRes.data) {
            for (const d of dealsRes.data as Deal[]) {
              dealsByPitch.set(d.pitch_id, d)
            }
          }
        }
        let delivered = 0
        let declined = 0
        let totalClosedValue = 0
        let totalClosedCurrency: string | null = null
        for (const id of pitchIds) {
          const d = dealsByPitch.get(id)
          if (!d) continue
          if (d.stage === 'delivered') {
            delivered++
            if (d.current_budget_amount) {
              totalClosedValue += d.current_budget_amount
              totalClosedCurrency =
                totalClosedCurrency ?? d.current_budget_currency
            }
          } else if (d.stage === 'rejected') {
            declined++
          }
        }
        brandHistory = {
          total: pitchIds.length,
          delivered,
          declined,
          totalClosedValue,
          totalClosedCurrency,
        }
      }

      // ─── Other contacts count ────────────────────────────────────
      let otherContacts: OtherContactsCount | null = null
      if (hasBrand) {
        const rows = (brandPivotsRes.data as
          | {
              contact_id: string
              contacts: { display_name: string | null } | null
            }[]
          | null) ?? []
        // Exclude the current pitch's Contact from "other contacts" count.
        const otherRows = pitch.contact_id
          ? rows.filter((r) => r.contact_id !== pitch.contact_id)
          : rows
        const distinctIds = new Set(otherRows.map((r) => r.contact_id))
        const topRow = otherRows[0]
        otherContacts = {
          count: distinctIds.size,
          topName: topRow?.contacts?.display_name ?? null,
        }
      }

      // ─── Cadence (last touch only at v1; median-response deferred) ────
      let cadence: ContactCadence | null = null
      if (hasContact) {
        const rows = (contactPitchesRes.data as
          | { id: string; created_at: string }[]
          | null) ?? []
        if (rows.length === 0) {
          cadence = { lastTouchDaysAgo: null, lastTouchAt: null }
        } else {
          const mostRecent = rows[0]
          const lastTouchDate = new Date(mostRecent.created_at)
          cadence = {
            lastTouchDaysAgo: daysBetween(new Date(), lastTouchDate),
            lastTouchAt: mostRecent.created_at,
          }
        }
      }

      // ─── Outcomes per Contact ─────────────────────────────────────
      let outcomes: ContactOutcomes | null = null
      if (hasContact) {
        const contactPitchIds = ((contactPitchesRes.data as
          | { id: string; created_at: string }[]
          | null) ?? []).map((p) => p.id)
        let delivered = 0
        let declined = 0
        let totalClosedValue = 0
        let totalClosedCurrency: string | null = null
        if (contactPitchIds.length > 0) {
          const dealsRes = await supabase
            .from('deals')
            .select('*')
            .in('pitch_id', contactPitchIds)
          if (!cancelled && dealsRes.data) {
            for (const d of dealsRes.data as Deal[]) {
              if (d.stage === 'delivered') {
                delivered++
                if (d.current_budget_amount) {
                  totalClosedValue += d.current_budget_amount
                  totalClosedCurrency =
                    totalClosedCurrency ?? d.current_budget_currency
                }
              } else if (d.stage === 'rejected') {
                declined++
              }
            }
          }
        }
        outcomes = {
          total: contactPitchIds.length,
          delivered,
          declined,
          totalClosedValue,
          totalClosedCurrency,
        }
      }

      // ─── Brand chain (Contact's other Brand-associations) ─────────
      let brandChain: BrandChainEntry[] | null = null
      if (hasContact) {
        const rows = (contactPivotsRes.data as
          | {
              brand_id: string
              brands: { name: string | null } | null
            }[]
          | null) ?? []
        brandChain = rows
          .filter((r) => r.brand_id !== pitch.brand_id)
          .map((r) => ({
            brandId: r.brand_id,
            brandName: r.brands?.name ?? '(unnamed brand)',
          }))
      }

      if (!cancelled) {
        setData({ brandHistory, otherContacts, cadence, outcomes, brandChain })
        setLoading(false)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [
    pitch.id,
    pitch.brand_id,
    pitch.contact_id,
    isInbound,
    hasBrand,
    hasContact,
    supabase,
  ])

  // ─── Outbound: dashed placeholder ──────────────────────────────────
  if (!isInbound) {
    return (
      <section className="pdetail-cr8-section">
        <div className="pdetail-cr8-section-l">
          Relationship context
          <span className="pdetail-cr8-section-l-meta">inbound-only</span>
        </div>
        <div className="lens is-outbound">
          <p className="lens-summary">
            Relationship lens fires on inbound pitches only — outbound pitches
            are creator-authored, so the counterparty context lives on the
            target Brand's detail page instead.
          </p>
        </div>
      </section>
    )
  }

  // ─── Inbound first-touch: sparse empty ────────────────────────────
  if (isFirstTouch) {
    return (
      <section className="pdetail-cr8-section">
        <div className="pdetail-cr8-section-l">
          Relationship context
          <span className="pdetail-cr8-section-l-meta">
            at modal-open · passive
          </span>
        </div>
        <div className="lens lens-peer is-empty">
          <p className="lens-summary">First contact · no prior history</p>
          <p className="lens-empty-hint">
            Pitches from this contact and brand will accumulate here as the
            relationship develops. The lens fires on every modal-open; today
            it just acknowledges the absence.
          </p>
        </div>
      </section>
    )
  }

  // ─── Inbound with at least one FK: full lens ──────────────────────
  const brandDisplayName = pitch.brand_name ?? '(unknown brand)'
  const contactDisplayName = pitch.sender_name ?? '(unknown contact)'
  const summaryParts: string[] = []
  if (data?.outcomes && data.outcomes.total > 0) {
    summaryParts.push(`${data.outcomes.total} prior pitches`)
  }
  if (data?.outcomes && data.outcomes.delivered > 0) {
    const cur = data.outcomes.totalClosedCurrency ?? ''
    const closedSum = formatCurrencyAmount(
      cur,
      data.outcomes.totalClosedValue,
    )
    summaryParts.push(`${data.outcomes.delivered} closed${closedSum ? ` at ${closedSum}` : ''}`)
  }
  const summarySuffix = summaryParts.length > 0
    ? ` — ${summaryParts.join(' · ')}`
    : hasContact
      ? ' — first contact with this person'
      : ''

  return (
    <section className="pdetail-cr8-section">
      <div className="pdetail-cr8-section-l">
        Relationship context
        <span className="pdetail-cr8-section-l-meta">
          at modal-open · passive
        </span>
      </div>
      <div className={`lens lens-peer ${loading ? 'is-loading' : ''}`}>
        <p className="lens-summary">
          {hasContact ? (
            <>
              <b>{contactDisplayName}</b> at <b>{brandDisplayName}</b>
              {summarySuffix}
            </>
          ) : (
            <>
              <b>{brandDisplayName}</b>
              {summarySuffix}
            </>
          )}
        </p>
        <div className="lens-rows">
          {hasBrand ? (
            <LensRow
              label="Brand history"
              value={renderBrandHistory(data?.brandHistory, brandDisplayName)}
            />
          ) : null}
          {hasBrand ? (
            <LensRow
              label="Other contacts"
              value={renderOtherContacts(
                data?.otherContacts,
                brandDisplayName,
              )}
            />
          ) : null}
          {hasContact ? (
            <LensRow
              label={`${contactDisplayName}'s cadence`}
              value={renderCadence(data?.cadence)}
            />
          ) : null}
          {hasContact ? (
            <LensRow
              label={`Outcomes with ${contactDisplayName}`}
              value={renderContactOutcomes(data?.outcomes)}
            />
          ) : null}
          {hasContact ? (
            <LensRow
              label="Brand chain"
              value={renderBrandChain(data?.brandChain, brandDisplayName)}
            />
          ) : null}
        </div>
        <div className="lens-nav">
          {hasBrand && pitch.brand_name ? (
            <button
              type="button"
              className="lens-nav-btn"
              onClick={() => {
                router.push(`/app/brands/${brandSlug(pitch.brand_name!)}`)
              }}
            >
              View {brandDisplayName} <span className="arr">↗</span>
            </button>
          ) : null}
          {hasContact && pitch.contact_id ? (
            <button
              type="button"
              className="lens-nav-btn"
              onClick={() => {
                router.push(`/app/people/${pitch.contact_id}`)
              }}
            >
              View {contactDisplayName} <span className="arr">↗</span>
            </button>
          ) : null}
        </div>
      </div>
    </section>
  )
}

interface LensRowProps {
  label: string
  value: React.ReactNode
}

function LensRow({ label, value }: LensRowProps) {
  return (
    <div className="lens-row">
      <span className="lens-row-l">{label}</span>
      <span className="lens-row-v">{value}</span>
    </div>
  )
}

function renderBrandHistory(
  history: BrandHistory | null | undefined,
  brandName: string,
): React.ReactNode {
  if (!history) return <span className="lens-row-sub">Loading…</span>
  if (history.total === 0) {
    return <>First pitch from <b>{brandName}</b></>
  }
  const parts: React.ReactNode[] = []
  parts.push(<b key="t">{history.total} prior pitches</b>)
  if (history.delivered > 0) {
    const sumStr = formatCurrencyAmount(
      history.totalClosedCurrency ?? '',
      history.totalClosedValue,
    )
    parts.push(
      <span key="d"> · {history.delivered} closed{sumStr ? ` (${sumStr})` : ''}</span>,
    )
  }
  if (history.declined > 0) {
    parts.push(<span key="x"> · {history.declined} declined</span>)
  }
  return <>{parts}</>
}

function renderOtherContacts(
  oc: OtherContactsCount | null | undefined,
  brandName: string,
): React.ReactNode {
  if (!oc) return <span className="lens-row-sub">Loading…</span>
  if (oc.count === 0) {
    return <>No other contacts at <b>{brandName}</b></>
  }
  if (oc.topName) {
    const extra = oc.count - 1
    return (
      <>
        <b>{oc.topName}</b>
        {extra > 0 ? ` · +${extra} more` : ''}
      </>
    )
  }
  return (
    <>
      <b>{oc.count}</b> other contact{oc.count === 1 ? '' : 's'} at{' '}
      <b>{brandName}</b>
    </>
  )
}

function renderCadence(
  cadence: ContactCadence | null | undefined,
): React.ReactNode {
  if (!cadence) return <span className="lens-row-sub">Loading…</span>
  if (cadence.lastTouchDaysAgo === null) {
    return <>First touch · no prior pitches from this contact</>
  }
  const days = cadence.lastTouchDaysAgo
  let label: string
  if (days === 0) label = 'today'
  else if (days === 1) label = 'yesterday'
  else label = `${days} days ago`
  return (
    <>
      Last touch <b>{label}</b>
    </>
  )
}

function renderContactOutcomes(
  outcomes: ContactOutcomes | null | undefined,
): React.ReactNode {
  if (!outcomes) return <span className="lens-row-sub">Loading…</span>
  if (outcomes.total === 0) {
    return <>No prior pitches from this contact</>
  }
  const parts: React.ReactNode[] = []
  parts.push(
    <span key="d">
      <b>{outcomes.delivered} of {outcomes.total}</b> closed
    </span>,
  )
  if (outcomes.delivered > 0 && outcomes.totalClosedValue > 0) {
    const sumStr = formatCurrencyAmount(
      outcomes.totalClosedCurrency ?? '',
      outcomes.totalClosedValue,
    )
    if (sumStr) {
      parts.push(<span key="s"> · {sumStr} delivered</span>)
    }
  }
  if (outcomes.declined > 0) {
    parts.push(<span key="x"> · {outcomes.declined} declined</span>)
  }
  return <>{parts}</>
}

function renderBrandChain(
  chain: BrandChainEntry[] | null | undefined,
  currentBrandName: string,
): React.ReactNode {
  if (!chain) return <span className="lens-row-sub">Loading…</span>
  if (chain.length === 0) {
    return <>Only at <b>{currentBrandName}</b></>
  }
  if (chain.length === 1) {
    return (
      <>
        Also at <b>{chain[0].brandName}</b>
      </>
    )
  }
  return (
    <>
      Also at <b>{chain[0].brandName}</b> · +{chain.length - 1} more brand
      {chain.length - 1 === 1 ? '' : 's'}
    </>
  )
}
