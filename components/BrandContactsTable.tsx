import Link from 'next/link'
import { formatCurrencyAmount } from '@/lib/pitch-stats'
import { BrandAssocRoleControl } from '@/components/BrandAssocRoleControl'

// FR-7 W71 — BrandContactsTable per design canon §39 Surface B.
// 7-column row grid: Contact · Role · Channels · Pitches · Last close · Last touch · Arrow.
// W72 wired rows as <Link href="/app/people/[id]"> per design canon.
// FR-8 #76 — Role cell replaced with BrandAssocRoleControl (variant='table-row');
//   container overflow:visible so the role popover can escape; popover stops
//   propagation to keep row click-to-detail working. Per spec Delta 4.

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

const CHANNEL_KIND_CLASS: Record<ChannelKind, string> = {
  Email: 'ch-email',
  IG: 'ch-ig',
  TikTok: 'ch-tt',
  WhatsApp: 'ch-wa',
  X: 'ch-x',
  IRL: 'ch-irl',
  Facebook: 'ch-facebook',
  LinkedIn: 'ch-linkedin',
  Website: 'ch-website',
}

export type ContactRole =
  | 'PR'
  | 'Brand team'
  | 'Connector'
  | 'Founder'
  | 'Other'

const ROLE_CLASS: Record<ContactRole, string> = {
  PR: 'is-pr',
  'Brand team': 'is-brand-team',
  Connector: 'is-connector',
  Founder: 'is-founder',
  Other: 'is-other',
}

export interface BrandContactRow {
  contactId: string
  displayName: string | null
  channels: ChannelEntry[]
  role: ContactRole | null
  pitchesUnderBrand: number
  lastCloseAmount: number | null
  lastCloseCurrency: string | null
  lastCloseDate: string | null
  lastTouchDate: string | null
  // Brand-chain hint shown as the sub-line under the name when the contact
  // is also associated with other Brands (W72 expands this to a richer view).
  otherBrandsCount: number
}

interface BrandContactsTableProps {
  rows: BrandContactRow[]
  brandId: string
  brandName: string
}

export function BrandContactsTable({
  rows,
  brandId,
  brandName,
}: BrandContactsTableProps) {
  if (rows.length === 0) {
    return (
      <div className="contacts-empty">
        <p className="contacts-empty-l">
          No contacts <em>at this brand</em>
        </p>
        <p className="contacts-empty-p">
          Contacts will appear here as pitches accumulate. Inbound pitches
          with a parseable sender email auto-resolve to a Contact; outbound
          pitches don't carry a Contact at the pitch level.
        </p>
      </div>
    )
  }

  return (
    <div className="contacts-table">
      <div className="contacts-table-h">
        <span>Contact</span>
        <span>Role</span>
        <span>Channels</span>
        <span>Pitches</span>
        <span>Last close</span>
        <span>Last touch</span>
        <span></span>
      </div>
      {rows.map((row) => (
        <Link
          key={row.contactId}
          href={`/app/people/${row.contactId}`}
          className="contacts-table-row is-overflow-visible"
        >
          <div className="ctc-name">
            <div className="ctc-avatar">{initials(row.displayName)}</div>
            <div className="ctc-name-body">
              <span className="ctc-name-l">
                {row.displayName ?? '(no name)'}
              </span>
              {row.otherBrandsCount > 0 ? (
                <span className="ctc-name-sub is-chain">
                  also at{' '}
                  <em>
                    {row.otherBrandsCount} other brand
                    {row.otherBrandsCount === 1 ? '' : 's'}
                  </em>
                </span>
              ) : (
                <span className="ctc-name-sub">
                  {firstChannelIdentifier(row.channels) ?? '—'}
                </span>
              )}
            </div>
          </div>
          <BrandAssocRoleControl
            contactId={row.contactId}
            brandId={brandId}
            brandName={brandName}
            contactName={row.displayName ?? '(no name)'}
            initialRole={row.role}
            pitchCountForPair={row.pitchesUnderBrand}
            closedDealCount={
              row.lastCloseAmount && row.lastCloseAmount > 0 ? 1 : 0
            }
            closedDealAmountDisplay={
              row.lastCloseAmount && row.lastCloseAmount > 0 && row.lastCloseCurrency
                ? formatCurrencyAmount(row.lastCloseCurrency, row.lastCloseAmount)
                : null
            }
            variant="table-row"
          />
          {/* (Local ROLE_CLASS constant retained at top of file for future
              reference; BrandAssocRoleControl reads from the shared
              `@/lib/types/contact` map at runtime.) */}
          <span className="ctc-channels">
            {row.channels.slice(0, 4).map((ch, i) => (
              <span
                key={i}
                className={`ch-dot ${CHANNEL_KIND_CLASS[ch.kind] ?? ''}`}
              />
            ))}
            {row.channels.length > 0 ? (
              <span className="ctc-channels-primary">
                {row.channels.length === 1
                  ? primaryChannelKind(row.channels)
                  : row.channels.length}
              </span>
            ) : null}
          </span>
          <span className="ctc-num">
            {row.pitchesUnderBrand}
            <span className="ctc-num-sub">
              {row.pitchesUnderBrand === 1 ? '1 pitch' : 'total'}
            </span>
          </span>
          <span
            className={`ctc-num ${row.lastCloseAmount && row.lastCloseAmount > 0 ? 'is-accent' : ''}`}
          >
            {row.lastCloseAmount && row.lastCloseAmount > 0 && row.lastCloseCurrency
              ? formatCurrencyAmount(row.lastCloseCurrency, row.lastCloseAmount)
              : '—'}
            <span
              className="ctc-num-sub"
              style={{ color: 'var(--ink-3)', fontWeight: 500 }}
            >
              {row.lastCloseDate
                ? formatShortDate(row.lastCloseDate)
                : '0 closed'}
            </span>
          </span>
          <span className="ctc-last">
            {row.lastTouchDate ? formatRelativeShort(row.lastTouchDate) : '—'}
            {row.lastTouchDate ? (
              <span className="ctc-last-sub">
                {formatShortDate(row.lastTouchDate)}
              </span>
            ) : null}
          </span>
          <span className="ctc-arrow">→</span>
        </Link>
      ))}
    </div>
  )
}

function initials(name: string | null | undefined): string {
  if (!name) return '·'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '·'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function primaryChannelKind(channels: ChannelEntry[]): string {
  const primary = channels.find((c) => c.primary) ?? channels[0]
  return primary?.kind ?? ''
}

function firstChannelIdentifier(channels: ChannelEntry[]): string | null {
  const primary = channels.find((c) => c.primary) ?? channels[0]
  return primary?.identifier ?? null
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

function formatRelativeShort(iso: string): string {
  const d = new Date(iso)
  const days = Math.floor((Date.now() - d.getTime()) / (24 * 60 * 60 * 1000))
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo ago`
  const years = Math.floor(days / 365)
  return `${years}y ago`
}
