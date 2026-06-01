// Contact entity types — DB-row shape + channel/role enums.
// FR-7 first-class Contact; FR-8 added slug + previous_slugs.

export type ChannelKind =
  | 'Email'
  | 'IG'
  | 'TikTok'
  | 'WhatsApp'
  | 'X'
  | 'IRL'
  | 'Facebook'
  | 'LinkedIn'
  | 'Website'

export interface ChannelEntry {
  kind: ChannelKind
  identifier: string
  primary: boolean
}

export type ContactRole = 'PR' | 'Brand team' | 'Connector' | 'Founder' | 'Other'

// Matches the `public.contacts` row shape post-FR-8-Migration-1.
// `slug` nullable: no-display-name Contacts route by uuid only.
// `previous_slugs` text[] NOT NULL DEFAULT '{}' — append-only on display-name edit.
export interface Contact {
  id: string
  user_id: string
  display_name: string | null
  channels: ChannelEntry[]
  slug: string | null
  previous_slugs: string[]
  created_at: string
  updated_at: string
}

// Matches `public.contact_brands` row shape post-FR-8-Migration-1.
// `ended_at` NULL = currently-linked; non-NULL = soft-deactivated (AC5.2/5.4/5.5/5.6).
// `ended_reason` optional (Delta 4 + Founder Q3).
export interface ContactBrand {
  contact_id: string
  brand_id: string
  user_id: string
  role: ContactRole | null
  ended_at: string | null
  ended_reason: string | null
  created_at: string
  updated_at: string
}

// Shared mapping of channel-kind → CSS dot-color class. Used by detail page,
// list rows, and any future surface that renders channel dots.
export const CHANNEL_KIND_CLASS: Record<ChannelKind, string> = {
  Email: 'ch-email',
  IG: 'ch-ig',
  TikTok: 'ch-tt',
  WhatsApp: 'ch-wa',
  X: 'ch-x',
  IRL: 'ch-irl',
  Facebook: 'ch-facebook',
  LinkedIn: 'ch-linkedin',
  Website: 'ch-website',
}

// Shared mapping of role → CSS modifier class on `.ctc-role` and `.role-pill`.
// Empty string = no modifier (use base class).
export const ROLE_CLASS: Record<ContactRole, string> = {
  PR: 'is-pr',
  'Brand team': 'is-brand-team',
  Connector: 'is-connector',
  Founder: 'is-founder',
  Other: 'is-other',
}
