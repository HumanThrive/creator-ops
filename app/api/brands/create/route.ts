import { createClient } from '@/lib/supabase/server'
import { generateBaseSlug, resolveSlugCollision } from '@/lib/slug'

// FR-11 #90 (Story 1) — standalone Brand creation.
//
// Body: { name: string }
//
// Flow (mirrors app/api/contacts/create, lighter — a brand is only a name):
//   1. Auth (RLS scopes via user_id below).
//   2. Require a non-empty name (brands.name is NOT NULL).
//   3. Slug via lib/slug.ts, collision-resolved against THIS user's brands
//      (null only for an all-punctuation / all-CJK name → uuid routing, per the
//      contacts precedent; AC1.6 holds for any ASCII-resolvable name).
//   4. INSERT brands with explicit user_id ([[Client-side INSERT into RLS-
//      protected]] — server route, same RLS rule: user_id must match auth.uid()).
//   5. CREATE-OR-CALLOUT, NOT find-or-create (spec R3): a name collision is
//      surfaced as a Combine opportunity, never silently merged. The
//      brands_user_lower_name_uniq index throws 23505 on a duplicate NAME →
//      409 brand_name_collision → client renders DupBrandCallout. The slug index
//      never throws (resolveSlugCollision pre-suffixes), so a write-time 23505 is
//      deterministically the NAME collision — no constraint-name parsing needed.
//   6. Return { success, id, slug } so the client router.push to /app/brands/<slug>.

interface CreateBody {
  name?: string | null
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return Response.json({ success: false, error: 'unauthorized' }, { status: 401 })
  }

  let body: CreateBody
  try {
    body = await request.json()
  } catch {
    return Response.json({ success: false, error: 'invalid_json' }, { status: 400 })
  }

  const name =
    typeof body.name === 'string' && body.name.trim() ? body.name.trim() : null
  if (!name) {
    return Response.json(
      { success: false, error: 'name_required' },
      { status: 400 },
    )
  }

  // ── Slug-gen (collision-resolved against this user's brands) ────────────
  let slug: string | null = null
  const base = generateBaseSlug(name)
  if (base) {
    const exists = async (candidate: string): Promise<boolean> => {
      const { data, error } = await supabase
        .from('brands')
        .select('id')
        .eq('user_id', user.id)
        .eq('slug', candidate)
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data !== null
    }
    slug = await resolveSlugCollision(base, exists)
  }

  // ── INSERT (create-or-callout — NOT find-or-create; spec R3) ────────────
  const { data: inserted, error: insertErr } = await supabase
    .from('brands')
    .insert({ user_id: user.id, name, slug })
    .select('id, slug')
    .single()

  if (insertErr) {
    if (insertErr.code === '23505') {
      // Duplicate brand NAME (brands_user_lower_name_uniq). The slug index can't
      // raise here — resolveSlugCollision already suffixed a free slug. Surface
      // the existing brand so the callout + Combine stub offer a live exit (open
      // it) rather than a dead-end (spec R3 create-or-callout). ilike with no
      // wildcards = case-insensitive exact match, mirroring the unique index.
      const { data: existing } = await supabase
        .from('brands')
        .select('id, name, slug')
        .eq('user_id', user.id)
        .ilike('name', name)
        .maybeSingle()
      return Response.json(
        { success: false, error: 'brand_name_collision', existing: existing ?? null },
        { status: 409 },
      )
    }
    console.error('[api/brands/create] insert failed:', insertErr.message)
    return Response.json(
      { success: false, error: 'insert_failed', detail: insertErr.message },
      { status: 502 },
    )
  }

  return Response.json({
    success: true,
    id: inserted.id,
    slug: inserted.slug,
  })
}
