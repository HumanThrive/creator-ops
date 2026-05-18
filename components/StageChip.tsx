import type { DealStage } from '@/lib/types/deal'
import type { PitchDirection } from '@/lib/types/pitch'
import { getStageLabel } from '@/lib/stage-labels'

const STAGE_VARIANT: Record<DealStage, string> = {
  inbox: 'inbox',
  negotiating: 'negotiating',
  confirmed: 'confirmed',
  delivered: 'delivered',
  rejected: 'rejected',
}

interface StageChipProps {
  stage: DealStage
  // CR-4 Q3 Lock — parent pitch's direction drives label rendering at the
  // chip layer. When direction is not in scope at a rare callsite, the
  // optional default ('inbound') preserves the pre-CR-4 visual canon.
  direction?: PitchDirection
  // CR-2 — pitch's `not_a_pitch` legitimacy tag drives a stage-chip override
  // (the design treats not-a-pitch as a stage-level visual variant, even
  // though it's a tag-axis value semantically). Caller computes the predicate
  // (`tags.includes('not_a_pitch')`) and passes the boolean. Replaces the
  // pre-CR-2 `category` prop.
  isNotPitch?: boolean
}

export function StageChip({
  stage,
  direction = 'inbound',
  isNotPitch,
}: StageChipProps) {
  if (isNotPitch) {
    return <span className="stage notpitch">Not a pitch</span>
  }
  return (
    <span className={`stage ${STAGE_VARIANT[stage]}`}>
      {getStageLabel(stage, direction)}
    </span>
  )
}
