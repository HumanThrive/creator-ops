import type { PeopleStats } from '@/lib/contact-stats'

// FR-8 S1 (slice #75) — PeopleStatsStrip per spec Delta 2.
// 3 cells matching the `/app` StatsStrip canon (mirrors BrandStatsStrip):
//   [01] Contacts (total)
//   [02] +N New this month (accent value when N > 0)
//   [03] Most-touched brand (name + count sub-label)
// Server component — receives pre-aggregated PeopleStats from the page.

interface PeopleStatsStripProps {
  stats: PeopleStats
}

export function PeopleStatsStrip({ stats }: PeopleStatsStripProps) {
  const newDisplay = stats.new_this_month > 0 ? `+${stats.new_this_month}` : '0'

  return (
    <div className="stats-strip">
      <div className="stat-cell">
        <span className="stat-cell-num">[01]</span>
        <span className="stat-cell-v">{stats.total}</span>
        <span className="stat-cell-l">Contacts</span>
        <span className="stat-cell-sub">
          {stats.total === 1 ? 'total' : 'tracked total'}
        </span>
      </div>
      <div className="stat-cell">
        <span className="stat-cell-num">[02]</span>
        <span
          className={`stat-cell-v ${stats.new_this_month > 0 ? 'is-accent' : ''}`}
        >
          {newDisplay}
        </span>
        <span className="stat-cell-l">New this month</span>
        <span className="stat-cell-sub">
          {stats.new_this_month === 0
            ? 'no new contacts yet'
            : `${stats.new_this_month} since the 1st`}
        </span>
      </div>
      <div className="stat-cell">
        <span className="stat-cell-num">[03]</span>
        {stats.most_touched_brand ? (
          <>
            <span className="stat-cell-v stat-cell-v-text">
              {stats.most_touched_brand.brand_name}
            </span>
            <span className="stat-cell-l">Most-touched brand</span>
            <span className="stat-cell-sub">
              {stats.most_touched_brand.count}{' '}
              {stats.most_touched_brand.count === 1 ? 'contact' : 'contacts'}
            </span>
          </>
        ) : (
          <>
            <span className="stat-cell-v">—</span>
            <span className="stat-cell-l">Most-touched brand</span>
            <span className="stat-cell-sub">no associations yet</span>
          </>
        )}
      </div>
    </div>
  )
}
