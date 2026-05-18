export type PitchDirection = 'inbound' | 'outbound'

// CR-2 — closed-set pitch tag slugs, derived from `tags WHERE scope='pitch'`
// seed (Migration 1, 2026-05-17). Mirrors the 9 seed rows: 5 legitimacy
// (single-select axis) + 4 compensation (multi-select axis).
//
// Centralized here for autocomplete + spell-check at literal call sites.
// New tags require: (1) INSERT INTO tags via a new DB migration; (2) append
// the slug to this union; (3) update the relevant DISPLAY map in
// `components/TagBadges.tsx` and/or `components/PitchCard.tsx` if it needs
// to render. No schema migration is required to add a new tag — only the
// INSERT — but the union here keeps app code typed against the live set.
export type PitchTag =
  | 'valid'
  | 'low_quality'
  | 'spam_or_scam'
  | 'unclear'
  | 'not_a_pitch'
  | 'cash'
  | 'gifting'
  | 'collaboration'
  | 'unspecified'

export interface Pitch {
  id: string
  user_id: string
  raw_pitch_text: string
  direction: PitchDirection
  brand_name: string | null
  sender_name: string | null
  deliverables: string[]
  budget_amount: number | null
  budget_currency: string | null
  budget_notes: string | null
  deadline: string | null
  ai_summary: string | null
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
  // CR-2 — AI now emits closed-set tag slugs grouped by axis (legitimacy +
  // compensation). Replaces the pre-CR-2 `category` field. Server post-
  // processes for outbound (injects 'valid' since legitimacy is server-side
  // for outbound pitches per AC1.4).
  tags: string[]
  summary: string
}
