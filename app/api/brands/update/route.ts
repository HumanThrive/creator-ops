import { createClient } from '@/lib/supabase/server'
import { generateBaseSlug, resolveSlugCollision } from '@/lib/slug'

// FR-11 #91 (Story 2) — rename a Brand (the only first-class Brand field).
//
// Body: { brand_id, name }
//
// Single-row brands.name UPDATE + slug rotation (mirror app/api/contacts/update):
//   - generateBaseSlug(name) → resolveSlugCollision excluding self
//   - resolved slug differs from current → write it + append the OLD slug to
//     previous_slugs[] (CR-7's 3-tier route handler keeps the old URL routable)
//   - cosmetic rename (same kebab) → name updates, slug/previous_slugs unchanged (AC2.3)
// 23505 on brands_user_lower_name_uniq → 409 brand_name_collision + the existing
// brand (dup-name callout under the inline H1). No RPC; FR-7 RPCs untouched.

interface UpdateBody {
  brand_id?: string
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

  let body: UpdateBody
  try {
    body = await request.json()
  } catch {
    return Response.json({ success: false, error: 'invalid_json' }, { status: 400 })
  }

  const { brand_id } = body
  if (!brand_id) {
    return Response.json({ success: false, error: 'brand_id_required' }, { status: 400 })
  }

  const name =
    typeof body.name === 'string' && body.name.trim() ? body.name.trim() : null
  if (!name) {
    return Response.json({ success: false, error: 'name_required' }, { status: 400 })
  }

  // Load current row (slug + previous_slugs for the rename diff). RLS-scoped.
  const { data: current, error: loadErr } = await supabase
    .from('brands')
    .select('id, user_id, name, slug, previous_slugs')
    .eq('id', brand_id)
    .maybeSingle()
  if (loadErr) {
    console.error('[api/brands/update] load failed:', loadErr.message)
    return Response.json({ success: false, error: 'load_failed' }, { status: 502 })
  }
  if (!current) {
    return Response.json({ success: false, error: 'brand_not_found' }, { status: 404 })
  }

  const updatePayload: Record<string, unknown> = { name }
  let nextSlug: string | null = current.slug

  const newBase = generateBaseSlug(name)
  if (newBase) {
    // Resolve collision against OTHER brands (exclude self via id filter).
    const exists = async (candidate: string): Promise<boolean> => {
      const { data, error } = await supabase
        .from('brands')
        .select('id')
        .eq('user_id', current.user_id)
        .eq('slug', candidate)
        .neq('id', current.id)
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data !== null
    }
    const resolved = await resolveSlugCollision(newBase, exists)
    if (resolved !== current.slug) {
      nextSlug = resolved
      updatePayload.slug = resolved
      const prev: string[] = Array.isArray(current.previous_slugs)
        ? current.previous_slugs
        : []
      if (current.slug && !prev.includes(current.slug)) {
        updatePayload.previous_slugs = [...prev, current.slug]
      }
    }
  } else if (current.slug !== null) {
    // Name no longer slugifies (all-punctuation / CJK) → route by uuid.
    nextSlug = null
    updatePayload.slug = null
  }

  const { error: updErr } = await supabase
    .from('brands')
    .update(updatePayload)
    .eq('id', brand_id)

  if (updErr) {
    if (updErr.code === '23505') {
      // Duplicate brand NAME — surface the existing brand for the callout's
      // live exit. (Slug index can't raise — resolveSlugCollision pre-suffixed.)
      const { data: existing } = await supabase
        .from('brands')
        .select('id, name, slug')
        .eq('user_id', current.user_id)
        .ilike('name', name)
        .neq('id', current.id)
        .maybeSingle()
      return Response.json(
        { success: false, error: 'brand_name_collision', existing: existing ?? null },
        { status: 409 },
      )
    }
    console.error('[api/brands/update] update failed:', updErr.message)
    return Response.json(
      { success: false, error: 'update_failed', detail: updErr.message },
      { status: 502 },
    )
  }

  return Response.json({ success: true, slug: nextSlug, name })
}
