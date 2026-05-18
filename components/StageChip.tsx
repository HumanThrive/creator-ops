import type { DealStage } from '@/lib/types/deal'

const STAGE_LABEL: Record<DealStage, string> = {
  inbox: 'Inbox',
  negotiating: 'Negotiating',
  confirmed: 'Confirmed',
  delivered: 'Delivered',
  rejected: 'Rejected',
}

const STAGE_VARIANT: Record<DealStage, string> = {
  inbox: 'inbox',
  negotiating: 'negotiating',
  confirmed: 'confirmed',
  delivered: 'delivered',
  rejected: 'rejected',
}

interface StageChipProps {
  stage: DealStage
  // CR-2 — pitch's `not_a_pitch` legitimacy tag drives a stage-chip override
  // (the design treats not-a-pitch as a stage-level visual variant, even
  // though it's a tag-axis value semantically). Caller computes the predicate
  // (`tags.includes('not_a_pitch')`) and passes the boolean. Replaces the
  // pre-CR-2 `category` prop.
  isNotPitch?: boolean
}

export function StageChip({ stage, isNotPitch }: StageChipProps) {
  if (isNotPitch) {
    return <span className="stage notpitch">Not a pitch</span>
  }
  return (
    <span className={`stage ${STAGE_VARIANT[stage]}`}>{STAGE_LABEL[stage]}</span>
  )
}
