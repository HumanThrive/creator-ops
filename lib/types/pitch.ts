export type PipelineStage =
  | 'inbox'
  | 'negotiating'
  | 'confirmed'
  | 'delivered_paid'

export type PitchCategory =
  | 'legit'
  | 'gifting_only'
  | 'low_quality'
  | 'spam_or_scam'
  | 'unclear'
  | 'not_a_pitch'

export interface Pitch {
  id: string
  user_id: string
  raw_pitch_text: string
  brand_name: string | null
  sender_name: string | null
  deliverables: string[]
  budget_amount: number | null
  budget_currency: string | null
  budget_notes: string | null
  deadline: string | null
  category: PitchCategory
  ai_summary: string | null
  pipeline_stage: PipelineStage
  user_notes: string | null
  created_at: string
  updated_at: string
}

export interface ExtractedPitch {
  brand_name: string | null
  sender_name: string | null
  deliverables: string[]
  budget: {
    amount: number | null
    currency: string | null
    notes: string | null
  }
  deadline: string | null
  category: PitchCategory
  summary: string
}
