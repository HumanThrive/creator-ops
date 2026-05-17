export type ActivityType =
  | 'pitch_created'
  | 'pitch_updated'
  | 'deal_attached'
  | 'deal_updated'
  | 'stage_change'
  | 'note_added'

export type ActivityRefType = 'deal'

export interface Activity {
  id: string
  pitch_id: string
  user_id: string
  type: ActivityType
  /** Polymorphic ref pair: both populated together or both null
   *  (enforced by `activities_ref_consistency` CHECK constraint). */
  ref_id: string | null
  ref_type: ActivityRefType | null
  /** Event-specific data — shape varies per `type`. See spec Activity payload
   *  schema in `workspace/build-requests/FR-4-outbound-pitch-tracking.md`. */
  payload: Record<string, unknown>
  created_at: string
}
