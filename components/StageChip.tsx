import type { DealStage } from '@/lib/types/deal'
import type { PitchCategory } from '@/lib/types/pitch'

const STAGE_LABEL: Record<DealStage, string> = {
  inbox: 'Inbox',
  negotiating: 'Negotiating',
  confirmed: 'Confirmed',
  delivered_paid: 'Delivered',
  rejected: 'Rejected',
}

const STAGE_VARIANT: Record<DealStage, string> = {
  inbox: 'inbox',
  negotiating: 'negotiating',
  confirmed: 'confirmed',
  delivered_paid: 'delivered',
  rejected: 'rejected',
}

interface StageChipProps {
  stage: DealStage
  // The DB models `not_a_pitch` as a category on `pitches`, but the design
  // system treats it as a stage-variant chip override. When set, the category
  // override wins for display.
  category?: PitchCategory
}

export function StageChip({ stage, category }: StageChipProps) {
  if (category === 'not_a_pitch') {
    return <span className="stage notpitch">Not a pitch</span>
  }
  return (
    <span className={`stage ${STAGE_VARIANT[stage]}`}>{STAGE_LABEL[stage]}</span>
  )
}
