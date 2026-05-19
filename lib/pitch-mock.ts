import type { Pitch } from '@/lib/types/pitch'

// CR-6 — Three pitch surfaces are referenced by the new PitchDetailModal
// design (industry, sender_email, source/subject) but have no schema column
// today. Founder direction 2026-05-19 (Option B): render them as live mock
// values; allow inline edit in the EditDetailsOverlay; silently discard
// mock-field edits on save (real schema fields persist via
// `update_pitch_with_activity` as usual).
//
// Deletion path: when schema extension lands (industry / sender_email /
// source_subject columns added to `pitches`), delete this file and replace
// callers with direct `pitch.<field>` reads. Each helper is the single
// import point for its field, so the migration is a one-file change per
// field plus call-site updates.

function slugifyEmailLocal(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
}

export function getMockIndustry(_pitch: Pitch): string {
  return 'Industry'
}

export function getMockSenderEmail(pitch: Pitch): string | null {
  if (!pitch.sender_name) return null
  const local = slugifyEmailLocal(pitch.sender_name)
  if (!local) return null
  return `${local}@example.com`
}

export function getMockSourceSubject(_pitch: Pitch): string {
  return 'Email · subject line'
}
