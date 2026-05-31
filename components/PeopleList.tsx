'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import type { ContactSummary } from '@/lib/contact-stats'
import { CHANNEL_KIND_CLASS, ROLE_CLASS } from '@/lib/types/contact'
import { formatRelativeTime } from '@/lib/format'

// FR-8 S1 (slice #75) — `/app/people` list component per spec Delta 2.
// Variant B 7-col row (locked); search + sort URL-persisted; multi-role +N
// affix popover when roles differ across brands; section-head with search
// pill + "+ New Contact" affordance (wired to placeholder until #79).
//
// State model: parent server component owns the filtering + sorting; this
// client component owns the input affordances and routes via router.replace
// to re-trigger the server render with new ?q= / ?sort= URL params.

type SortMode = 'recent' | 'alpha'

interface PeopleListProps {
  contacts: ContactSummary[]
  totalCount: number  // pre-filter total; used for the "no matches" empty case
  query: string
  sort: SortMode
}

const SEARCH_DEBOUNCE_MS = 250

export function PeopleList({ contacts, totalCount, query, sort }: PeopleListProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [localQ, setLocalQ] = useState(query)

  // Debounced URL sync — every keystroke updates localQ; after
  // SEARCH_DEBOUNCE_MS of quiet, route to `?q=...`.
  useEffect(() => {
    if (localQ === query) return
    const handle = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString())
      if (localQ.trim()) {
        params.set('q', localQ.trim())
      } else {
        params.delete('q')
      }
      const qs = params.toString()
      router.replace(qs ? `/app/people?${qs}` : '/app/people', { scroll: false })
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(handle)
  }, [localQ, query, router, searchParams])

  function setSort(next: SortMode) {
    if (next === sort) return
    const params = new URLSearchParams(searchParams.toString())
    if (next === 'alpha') {
      params.set('sort', 'alpha')
    } else {
      params.delete('sort')
    }
    const qs = params.toString()
    router.replace(qs ? `/app/people?${qs}` : '/app/people', { scroll: false })
  }

  const noMatches = totalCount > 0 && contacts.length === 0
  const sortLabel = sort === 'alpha' ? 'A → Z' : 'recent'
  const headMeta = query
    ? `${contacts.length} of ${totalCount} · ${sortLabel}`
    : `${totalCount} · ${sortLabel}`

  return (
    <>
      <div className="section-h">
        <span className="section-h-l">
          All Contacts <span className="section-h-l-meta">{headMeta}</span>
        </span>
        <div className="section-h-actions">
          <input
            type="search"
            className="search-input"
            placeholder="Search name, brand, or channel…"
            value={localQ}
            onChange={(e) => setLocalQ(e.target.value)}
            aria-label="Search contacts"
          />
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
              className={`sort-btn ${sort === 'alpha' ? 'active' : ''}`}
              onClick={() => setSort('alpha')}
            >
              A → Z
            </button>
          </div>
          {/* TODO FR-8 S2 (#79): wire to standalone-create modal. Visual
              affordance present for #75; full wiring lands at #79. */}
          <button
            type="button"
            className="section-action"
            disabled
            aria-disabled="true"
            title="Coming in FR-8 S2"
          >
            + New Contact
          </button>
        </div>
      </div>

      {noMatches ? (
        <div className="people-empty">
          <p className="people-empty-p">
            No contacts match &ldquo;{query}&rdquo;. Try a different name,
            brand, or channel identifier.
          </p>
        </div>
      ) : (
        <div className="contacts-table">
          <div className="contacts-table-h">
            <span>Name · Chain</span>
            <span>Role</span>
            <span>Channels</span>
            <span>Brands</span>
            <span>Pitches</span>
            <span>Last touch</span>
            <span aria-hidden="true" />
          </div>
          {contacts.map((c) => (
            <ContactRow key={c.id} contact={c} />
          ))}
        </div>
      )}
    </>
  )
}

function ContactRow({ contact }: { contact: ContactSummary }) {
  // Internal-link gen: prefer slug; fall back to uuid (Delta 6).
  const href = `/app/people/${contact.slug ?? contact.id}`

  const chainText = renderChainSub(contact)
  const currentRole = contact.current_role
  const showRoleAffix = contact.has_multi_roles && contact.brand_count > 1

  return (
    <Link href={href} className="contacts-table-row">
      <div className="ctc-name">
        <div className="ctc-avatar">{initials(contact.display_name)}</div>
        <div className="ctc-name-body">
          <span className="ctc-name-l">{contact.display_name}</span>
          <span className={`ctc-name-sub ${chainText.isChain ? 'is-chain' : ''}`}>
            {chainText.node}
          </span>
        </div>
      </div>

      <span className="ctc-role-cell">
        {currentRole ? (
          <span className={`ctc-role ${ROLE_CLASS[currentRole]}`}>
            {currentRole}
          </span>
        ) : (
          <span className="ctc-role is-empty">No role</span>
        )}
        {showRoleAffix ? (
          <span className="ctc-role-more" tabIndex={0}>
            +{contact.brand_count - 1}
            <span className="ctc-role-pop">
              <span className="ctc-role-pop-h">Role per brand</span>
              {contact.brand_links.map((bl) => (
                <span
                  key={bl.brand_id}
                  className={`ctc-role-pop-row ${bl.is_current ? 'is-current' : ''}`}
                >
                  <b>{bl.brand_name}</b>{' '}
                  <span className="ctc-role-pop-role">
                    {bl.role ?? 'unspecified'}
                    {bl.is_current ? ' · current' : ''}
                  </span>
                </span>
              ))}
            </span>
          </span>
        ) : null}
      </span>

      <span className="ctc-channels">
        {contact.primary_channel ? (
          <>
            <span
              className={`ch-dot ${CHANNEL_KIND_CLASS[contact.primary_channel.kind]}`}
              aria-hidden="true"
            />
            <span className="ctc-channels-primary">
              {contact.primary_channel.identifier || contact.primary_channel.kind}
            </span>
          </>
        ) : (
          <span className="ctc-channels-primary" style={{ opacity: 0.5 }}>
            no channels
          </span>
        )}
      </span>

      <span className="ctc-num">
        {contact.brand_count}
        <span className="ctc-num-sub">
          {contact.brand_count === 1 ? 'brand' : 'brands'}
        </span>
      </span>

      <span className={`ctc-num ${contact.is_connector ? 'is-accent' : ''}`}>
        {contact.pitch_count}
        <span className="ctc-num-sub">
          {contact.is_connector
            ? 'concurrent'
            : contact.pitch_count === 1
              ? 'pitch'
              : 'pitches'}
        </span>
      </span>

      <span className="ctc-last">
        {contact.last_touch_at ? (
          <>
            {formatRelativeTime(contact.last_touch_at)}
            <span className="ctc-last-sub">
              {formatShortDate(contact.last_touch_at)}
            </span>
          </>
        ) : (
          <>
            never
            <span className="ctc-last-sub">no pitches</span>
          </>
        )}
      </span>

      <span className="ctc-arrow">→</span>
    </Link>
  )
}

// Render the brand-chain sub-line. Three shapes per design canon §40 / Delta 2:
//   - 1 brand with role: "PR at <b>Brand</b>"
//   - 2+ brands sequential (prior + current): "currently at <b>X</b> · previously at <em>Y</em>"
//   - 2+ brands concurrent (Connector): "via <em>Home</em> · N concurrent clients"
//   - 0 brands but has channels: channel identifier fallback (handled by caller's `is-chain` flag)
//   - 0 brands no channels: just a quiet placeholder
function renderChainSub(c: ContactSummary): { node: React.ReactNode; isChain: boolean } {
  const links = c.brand_links
  if (links.length === 0) {
    // No brand associations — show primary channel identifier as fallback
    // (matches Hayden Roth design pattern: "+44 7700 901 224 · WhatsApp only").
    if (c.primary_channel) {
      const channelLabel =
        c.primary_channel.kind === 'Email'
          ? c.primary_channel.identifier
          : `${c.primary_channel.identifier} · ${c.primary_channel.kind} only`
      return { node: channelLabel, isChain: false }
    }
    return { node: 'No brand or channels yet', isChain: false }
  }

  if (c.is_connector) {
    // Connector pattern — Marcus-Reeve case.
    const home = links[0]
    const concurrentCount = links.filter((bl) => bl.is_concurrent).length
    return {
      node: (
        <>
          via <em>{home.brand_name}</em> · {concurrentCount} concurrent{' '}
          {concurrentCount === 1 ? 'client' : 'clients'}
        </>
      ),
      isChain: true,
    }
  }

  if (links.length === 1) {
    const bl = links[0]
    return {
      node: (
        <>
          {bl.role ? `${bl.role} at ` : 'at '}
          <b>{bl.brand_name}</b>
        </>
      ),
      isChain: true,
    }
  }

  // 2+ brands sequential — first is current (or most-recent), rest as prior.
  const [current, ...rest] = links
  const priorNames = rest.map((bl) => bl.brand_name)
  return {
    node: (
      <>
        currently at <b>{current.brand_name}</b> · previously at{' '}
        <em>{priorNames.join(', ')}</em>
      </>
    ),
    isChain: true,
  }
}

function initials(name: string): string {
  const trimmed = name.trim()
  if (!trimmed || trimmed === '(no name)') return '·'
  const parts = trimmed.split(/\s+/).filter(Boolean)
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
  return sameYear ? `${month} ${d.getDate()}` : `${month} ${d.getFullYear()}`
}
