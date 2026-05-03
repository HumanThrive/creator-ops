import type { PipelineStage, PitchCategory } from '@/lib/types/pitch'

const STAGE_LABEL: Record<PipelineStage, string> = {
  inbox: 'Inbox',
  negotiating: 'Negotiating',
  confirmed: 'Confirmed',
  delivered_paid: 'Delivered',
}

const STAGE_VARIANT: Record<PipelineStage, string> = {
  inbox: 'inbox',
  negotiating: 'negotiating',
  confirmed: 'confirmed',
  delivered_paid: 'delivered',
}

interface StageChipProps {
  stage: PipelineStage
  // The DB models `not_a_pitch` as a category, but the design system treats
  // it as a 5th stage variant. When set, the category override wins for display.
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
