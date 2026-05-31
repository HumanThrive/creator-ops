/**
 * Slug generation for Contacts.
 *
 * Used by:
 *   1. Runtime: display-name edit on `/app/people/[id]` (FR-8 S3 — Surface 2)
 *   2. Backfill: workspace/lead-dev/outbox/2026-05-31-fr8-backfill-slugs.ts
 *
 * Both paths MUST produce bit-identical slugs. This file is the single source of truth.
 *
 * Per FR-8 Delta 6 (Founder Q2) + LD-Gap-B (b1) (Founder-ratified 2026-05-31 11:30):
 *   - Input: display_name (string | null)
 *   - Output: kebab-case ASCII slug, length-capped 60 chars, per-user collision-suffixed
 *   - Empty / non-ASCII-resolvable input → null (Contact routes via uuid only)
 *
 * Spec: workspace/build-requests/FR-8-contact-management.md §Architecture + Delta 6
 */

export const MAX_SLUG_LENGTH = 60;

/**
 * Produce a base slug from `display_name`, without collision resolution.
 *
 * Pipeline:
 *   NFKD-normalize (decompose Latin accents) → strip combining marks (diacritics)
 *   → lowercase → non-alphanumeric → hyphen → collapse repeated hyphens
 *   → trim edge hyphens → length-cap → re-trim trailing hyphen (in case cap split a word).
 *
 * Returns null when input is null / empty / whitespace, OR when slugification yields
 * an empty string (e.g., all-CJK or all-punctuation input — those Contacts route by uuid).
 */
export function generateBaseSlug(displayName: string | null): string | null {
  if (!displayName) return null;
  const trimmed = displayName.trim();
  if (!trimmed) return null;

  const slug = trimmed
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/, '');

  return slug || null;
}

/**
 * Resolve per-user collision by appending `-2`, `-3`, ... until a free variant is found.
 *
 * The `exists` predicate is injected so this works in both:
 *   - server-side (Supabase server client via `@supabase/ssr`)
 *   - script-side (Supabase service-role client via `@supabase/supabase-js`)
 *
 * Each predicate call should check `(user_id, lower(candidate))` against the partial
 * UNIQUE index `contacts_user_lower_slug_uniq` — the index is case-insensitive on slug,
 * but `generateBaseSlug` always emits lowercase so case-sensitive equality suffices.
 *
 * When `base + suffix` would exceed MAX_SLUG_LENGTH, the base is trimmed to fit
 * (trailing hyphen re-stripped after the trim).
 *
 * @throws if collision resolution exceeds 9999 attempts (pathological case).
 */
export async function resolveSlugCollision(
  baseSlug: string,
  exists: (candidate: string) => Promise<boolean>,
): Promise<string> {
  if (!(await exists(baseSlug))) return baseSlug;

  for (let n = 2; n <= 9999; n += 1) {
    const suffix = `-${n}`;
    const room = MAX_SLUG_LENGTH - suffix.length;
    const trimmedBase = baseSlug.slice(0, room).replace(/-+$/, '');
    const candidate = `${trimmedBase}${suffix}`;
    if (!(await exists(candidate))) return candidate;
  }
  throw new Error(
    `slug collision resolution exceeded 9999 attempts for base '${baseSlug}'`,
  );
}
