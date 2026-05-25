import { formatCurrencyAmount } from '@/lib/pitch-stats'

// FR-7 W71 — BrandStatsStrip per design canon §39 Surface B.
// 3 cells: Pitches · Closed total (accent currency) · Contacts.
// Server component — receives pre-aggregated counts from the page.

interface BrandStatsStripProps {
  pitchesCount: number
  pitchesSub?: string | null
  closedTotalAmount: number
  closedTotalCurrency: string | null
  closedTotalSub?: string | null
  contactsCount: number
  contactsSub?: string | null
}

export function BrandStatsStrip({
  pitchesCount,
  pitchesSub,
  closedTotalAmount,
  closedTotalCurrency,
  closedTotalSub,
  contactsCount,
  contactsSub,
}: BrandStatsStripProps) {
  const closedDisplay =
    closedTotalAmount > 0 && closedTotalCurrency
      ? formatCurrencyAmount(closedTotalCurrency, closedTotalAmount)
      : '—'

  return (
    <div className="stats-strip">
      <div className="stat-cell">
        <span className="stat-cell-num">[01]</span>
        <span className="stat-cell-v">{pitchesCount}</span>
        <span className="stat-cell-l">Pitches</span>
        {pitchesSub ? (
          <span className="stat-cell-sub">{pitchesSub}</span>
        ) : null}
      </div>
      <div className="stat-cell">
        <span className="stat-cell-num">[02]</span>
        <span
          className={`stat-cell-v ${closedTotalAmount > 0 ? 'is-accent' : ''}`}
        >
          {closedDisplay}
          {closedTotalAmount > 0 && closedTotalCurrency ? (
            <sup>{closedTotalCurrency}</sup>
          ) : null}
        </span>
        <span className="stat-cell-l">Closed total</span>
        {closedTotalSub ? (
          <span className="stat-cell-sub">{closedTotalSub}</span>
        ) : null}
      </div>
      <div className="stat-cell">
        <span className="stat-cell-num">[03]</span>
        <span className="stat-cell-v">{contactsCount}</span>
        <span className="stat-cell-l">Contacts</span>
        {contactsSub ? (
          <span className="stat-cell-sub">{contactsSub}</span>
        ) : null}
      </div>
    </div>
  )
}
