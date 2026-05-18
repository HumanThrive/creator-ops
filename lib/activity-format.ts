import type { Activity } from '@/lib/types/activity'
import type { DealStage } from '@/lib/types/deal'

const STAGE_LABELS: Record<DealStage, string> = {
  inbox: 'Inbox',
  negotiating: 'Negotiating',
  confirmed: 'Confirmed',
  delivered: 'Delivered',
  rejected: 'Rejected',
}

function stageLabel(stage: unknown): string | null {
  if (typeof stage !== 'string') return null
  return STAGE_LABELS[stage as DealStage] ?? stage
}

/** Visual accent applied to a timeline dot. Most events render as an
 *  outlined dot (no accent); state-progressing events highlight in accent
 *  red, and origin events anchor with ink fill. */
export type ActivityAccent = 'none' | 'accent' | 'ink'

/** Structured timeline-friendly split: the punched verb on top, supporting
 *  detail below, and a dot-accent hint for the timeline indicator. Used by
 *  `PitchDetailModal` (vertical-line timeline with circle dots). */
export interface ActivityEvent {
  label: string
  payload: string | null
  accent: ActivityAccent
}

export function formatActivityEvent(a: Activity): ActivityEvent {
  switch (a.type) {
    case 'pitch_created':
      return { label: 'Pitch saved', payload: null, accent: 'ink' }

    case 'pitch_updated': {
      const diffs = (a.payload.field_diffs as Record<string, unknown>) ?? {}
      const n = Object.keys(diffs).length
      return {
        label: 'Pitch updated',
        payload: n > 0 ? `${n} ${n === 1 ? 'field' : 'fields'}` : null,
        accent: 'none',
      }
    }

    case 'deal_attached': {
      const stage = stageLabel(a.payload.stage)
      return { label: 'Deal opened', payload: stage, accent: 'accent' }
    }

    case 'deal_updated': {
      const diffs = (a.payload.field_diffs as Record<string, unknown>) ?? {}
      const n = Object.keys(diffs).length
      return {
        label: 'Deal updated',
        payload: n > 0 ? `${n} ${n === 1 ? 'field' : 'fields'}` : null,
        accent: 'none',
      }
    }

    case 'stage_change': {
      const to = stageLabel(a.payload.to_stage)
      return {
        label: to ? `Moved to ${to}` : 'Stage moved',
        payload: null,
        accent: 'accent',
      }
    }

    case 'note_added':
      return { label: 'Note added', payload: null, accent: 'none' }

    default:
      return { label: a.type, payload: null, accent: 'none' }
  }
}

/** Punched-voice activity label per locked decision #5 (handbook §2.2 register:
 *  "confident, slightly polished"). Active voice, target-named, scannable.
 *  Single-string variant used by `BrandHistoryTable` per-row log (compact
 *  inline format). For the timeline shape see `formatActivityEvent`. */
export function formatActivityLabel(a: Activity): string {
  switch (a.type) {
    case 'pitch_created':
      return 'Pitch saved'

    case 'pitch_updated': {
      const diffs = (a.payload.field_diffs as Record<string, unknown>) ?? {}
      const n = Object.keys(diffs).length
      return n === 0
        ? 'Pitch updated'
        : `Pitch updated · ${n} ${n === 1 ? 'field' : 'fields'}`
    }

    case 'deal_attached': {
      const stage = stageLabel(a.payload.stage)
      return stage ? `Deal opened · ${stage}` : 'Deal opened'
    }

    case 'deal_updated': {
      const diffs = (a.payload.field_diffs as Record<string, unknown>) ?? {}
      const n = Object.keys(diffs).length
      return n === 0
        ? 'Deal updated'
        : `Deal updated · ${n} ${n === 1 ? 'field' : 'fields'}`
    }

    case 'stage_change': {
      const to = stageLabel(a.payload.to_stage)
      return to ? `Moved to ${to}` : 'Stage moved'
    }

    case 'note_added':
      return 'Note added'

    default:
      return a.type
  }
}
