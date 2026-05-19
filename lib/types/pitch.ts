export type PitchDirection = 'inbound' | 'outbound'

// FR-6 — closed-set source-channel slugs, mirroring the
// `pitches_source_channel_check` CHECK constraint (Migration M1, 2026-05-19).
// Runtime array enables `/api/extract` boundary validation; the union type
// provides compile-time discipline at consuming surfaces.
export const PITCH_SOURCE_CHANNELS = [
  'email',
  'ig_dm',
  'tiktok_dm',
  'whatsapp',
  'linkedin_dm',
  'x_dm',
  'other',
] as const
export type PitchSourceChannel = typeof PITCH_SOURCE_CHANNELS[number]

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
  industry: string | null
  sender_email: string | null
  source_channel: PitchSourceChannel | null
  source_subject: string | null
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
  // FR-6 — pitch-context metadata extracted from raw text
  industry: string | null
  sender_email: string | null
  source_channel: PitchSourceChannel | null
  source_subject: string | null
}
