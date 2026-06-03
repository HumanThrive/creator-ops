// Brand entity types — DB-row shape.
// FR-7 first-class Brand; CR-7 added slug + previous_slugs (mirrors FR-8 contacts).

// Matches the `public.brands` row shape post-CR-7-M1.
// `slug` nullable: a brand whose name doesn't slugify (all-punctuation / all-CJK)
// routes by uuid only — mirrors the contacts precedent. `brands.name` is NOT NULL,
// so the backfill + slug-on-create assign a slug to every ASCII-resolvable name.
// `previous_slugs` text[] NOT NULL DEFAULT '{}' — append-only on rename (FR-11).
export interface Brand {
  id: string
  user_id: string
  name: string
  slug: string | null
  previous_slugs: string[]
  created_at: string
  updated_at: string
}
