import { createClient } from '@/lib/supabase/server'
import { Kanban } from '@/components/Kanban'
import { StatsStrip } from '@/components/StatsStrip'
import { computePitchStats } from '@/lib/pitch-stats'
import type { Pitch } from '@/lib/types/pitch'

export default async function AppPage() {
  const supabase = await createClient()

  const { data: pitches, error } = await supabase
    .from('pitches')
    .select('*')
    .order('created_at', { ascending: false })

  const safePitches = (pitches ?? []) as Pitch[]
  const stats = computePitchStats(safePitches)

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-l">
          <span className="kicker">
            Your board · {stats.pitchCount} pitches · {stats.brandCount} brands
          </span>
          <h1 className="page-h1">Pitches.</h1>
        </div>
      </div>

      {error ? (
        <p className="text-sm text-red-600">
          Failed to load pitches: {error.message}
        </p>
      ) : (
        <>
          <StatsStrip stats={stats} />
          <Kanban pitches={safePitches} />
        </>
      )}
    </div>
  )
}
