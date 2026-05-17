export type DealStage =
  | 'inbox'
  | 'negotiating'
  | 'confirmed'
  | 'delivered_paid'
  | 'rejected'

export interface Deal {
  id: string
  pitch_id: string
  user_id: string
  stage: DealStage
  current_budget_amount: number | null
  current_budget_currency: string | null
  /** Stored as jsonb in Postgres; arrives as a JS string[] via Supabase client. */
  current_deliverables: string[]
  current_scope_notes: string | null
  created_at: string
  updated_at: string
}
