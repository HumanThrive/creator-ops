import type { DealStage } from '@/lib/types/deal'
import type { PitchDirection } from '@/lib/types/pitch'

// CR-4 Q3 Lock — 5-stage `deals.stage` enum stays as-is; direction-aware
// display swaps ONLY the inbox-first-stage label for outbound pitches.
// Other 4 stages (negotiating / confirmed / delivered / rejected) are
// direction-symmetric. Activity log strings stay neutral and DO NOT
// consume this helper (per AC3.5).
export function getStageLabel(
  stage: DealStage,
  direction: PitchDirection,
): string {
  if (stage === 'inbox' && direction === 'outbound') return 'Sent'
  switch (stage) {
    case 'inbox':
      return 'Inbox'
    case 'negotiating':
      return 'Negotiating'
    case 'confirmed':
      return 'Confirmed'
    case 'delivered':
      return 'Delivered'
    case 'rejected':
      return 'Rejected'
  }
}
