import type { PitchStats } from '@/lib/pitch-stats'
import { formatCurrencyAmount } from '@/lib/pitch-stats'
import { AddPitchTrigger } from '@/components/AddPitchTrigger'

interface StatsStripProps {
  stats: PitchStats
}

export function StatsStrip({ stats }: StatsStripProps) {
  if (stats.pitchCount === 0) {
    return (
      <section className="stats-empty">
        <span className="stats-empty-text">
          <strong>Save your first pitch</strong> to start building your asset →
        </span>
        <AddPitchTrigger className="btn-pill" label="Add pitch" />
      </section>
    )
  }

  const [primary, secondary, ...rest] = stats.currencyTotals
  const overflowCount = rest.length

  return (
    <section className="stats">
      <div className="stat">
        <span className="stat-l" data-n="01">
          Pitches saved
        </span>
        <span className="stat-v">{stats.pitchCount}</span>
      </div>
      <div className="stat">
        <span className="stat-l" data-n="02">
          Brands tracked
        </span>
        <span className="stat-v">{stats.brandCount}</span>
      </div>
      <div className="stat">
        <span className="stat-l" data-n="03">
          In pipeline
        </span>
        {primary ? (
          <>
            <span className="stat-v">
              {formatCurrencyAmount(primary.currency, primary.amount)}
              <sup>{primary.currency}</sup>
            </span>
            {(secondary || overflowCount > 0) && (
              <span className="stat-multi">
                {secondary && (
                  <>
                    <span className="b">
                      {formatCurrencyAmount(secondary.currency, secondary.amount)} {secondary.currency}
                    </span>
                  </>
                )}
                {secondary && overflowCount > 0 && ' · '}
                {overflowCount > 0 && (
                  <>
                    + {overflowCount} other {overflowCount === 1 ? 'currency' : 'currencies'}
                  </>
                )}
              </span>
            )}
          </>
        ) : (
          <span className="font-mono text-lg text-ink-4">No budgets set yet</span>
        )}
      </div>
    </section>
  )
}
