import { createClient } from '@/lib/supabase/server'
import { generateBaseSlug, resolveSlugCollision } from '@/lib/slug'
import type { ChannelEntry, ChannelKind } from '@/lib/types/contact'

// FR-8 S3 (slice #77) — partial update on a Contact row.
// Body: { contact_id, display_name?, channels? } — at least one of
//   display_name / channels must be present.
//
// Display-name rename ⇒ slug recompute via app/lib/slug.ts. If the new slug
// differs from the current canonical slug:
//   - append the OLD canonical slug to `previous_slugs[]` (so the old URL
//     keeps routing per LD-Gap-B (b1) lock)
//   - write the new slug
// If the new slug is identical to the current one, no slug change happens
// (rename was cosmetic — same kebab output).
//
// Returns { success: true, slug: string | null, display_name: string | null }
// so the client knows the new canonical slug (for router.replace to the new URL).
//
// Channels update: validate shape (kind ∈ 9, identifier non-empty for non-IRL
// kinds, exactly 0 or 1 primary across the array) then UPDATE channels JSONB
// directly. The DB's partial UNIQUE on Primary Email may raise 23505 on a
// cross-contact email collision — caught and returned as 409 so the client
// surfaces the merge path.

const VALID_KINDS: ChannelKind[] = [
  'Email', 'IG', 'TikTok', 'WhatsApp', 'X', 'IRL', 'Facebook', 'LinkedIn', 'Website',
]

interface UpdateBody {
  contact_id?: string
  display_name?: string | null
  channels?: ChannelEntry[]
}

function validateChannels(channels: unknown): { ok: true; value: ChannelEntry[] } | { ok: false; error: string } {
  if (!Array.isArray(channels)) return { ok: false, error: 'channels_must_be_array' }
  const out: ChannelEntry[] = []
  let primaryCount = 0
  for (let i = 0; i < channels.length; i += 1) {
    const ch = channels[i] as Record<string, unknown>
    if (!ch || typeof ch !== 'object') return { ok: false, error: `channels[${i}]_invalid` }
    const kind = ch.kind as string
    const identifier = ch.identifier
    const primary = ch.primary
    if (!VALID_KINDS.includes(kind as ChannelKind)) {
      return { ok: false, error: `channels[${i}].kind_invalid` }
    }
    if (typeof identifier !== 'string') {
      return { ok: false, error: `channels[${i}].identifier_must_be_string` }
    }
    if (typeof primary !== 'boolean') {
      return { ok: false, error: `channels[${i}].primary_must_be_boolean` }
    }
    if (primary) primaryCount += 1
    out.push({ kind: kind as ChannelKind, identifier, primary })
  }
  if (primaryCount > 1) return { ok: false, error: 'multiple_primary_channels' }
  return { ok: true, value: out }
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

  const { contact_id } = body
  if (!contact_id) {
    return Response.json(
      { success: false, error: 'contact_id_required' },
      { status: 400 },
    )
  }

  const hasNameUpdate = 'display_name' in body
  const hasChannelsUpdate = 'channels' in body
  if (!hasNameUpdate && !hasChannelsUpdate) {
    return Response.json(
      { success: false, error: 'no_fields_to_update' },
      { status: 400 },
    )
  }

  // Validate channels payload before any DB calls (cheap fail-fast).
  let validatedChannels: ChannelEntry[] | undefined
  if (hasChannelsUpdate) {
    const result = validateChannels(body.channels)
    if (!result.ok) {
      return Response.json({ success: false, error: result.error }, { status: 400 })
    }
    validatedChannels = result.value
  }

  // Load current contact row (slug + previous_slugs + display_name needed for
  // rename diff). RLS scopes to authed user.
  const { data: current, error: loadErr } = await supabase
    .from('contacts')
    .select('id, user_id, display_name, slug, previous_slugs')
    .eq('id', contact_id)
    .maybeSingle()
  if (loadErr) {
    console.error('[api/contacts/update] load failed:', loadErr.message)
    return Response.json(
      { success: false, error: 'load_failed' },
      { status: 502 },
    )
  }
  if (!current) {
    return Response.json(
      { success: false, error: 'contact_not_found' },
      { status: 404 },
    )
  }

  const updatePayload: Record<string, unknown> = {}

  // ── Display-name + slug pipeline ─────────────────────────────────────
  let nextSlug: string | null = current.slug
  let nextDisplayName: string | null = current.display_name
  if (hasNameUpdate) {
    const incoming = body.display_name
    const normalized =
      typeof incoming === 'string' && incoming.trim() ? incoming.trim() : null
    nextDisplayName = normalized
    updatePayload.display_name = normalized

    const newBase = generateBaseSlug(normalized)
    if (newBase) {
      // Resolve collision against OTHER contacts (exclude self via id filter).
      const exists = async (candidate: string): Promise<boolean> => {
        const { data, error } = await supabase
          .from('contacts')
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
    } else {
      // Display name went null/empty — Contact routes by uuid only.
      if (current.slug !== null) {
        nextSlug = null
        updatePayload.slug = null
      }
    }
  }

  // ── Channels payload ─────────────────────────────────────────────────
  if (validatedChannels) {
    updatePayload.channels = validatedChannels
  }

  // Single UPDATE with all changes (atomic).
  const { error: updErr } = await supabase
    .from('contacts')
    .update(updatePayload)
    .eq('id', contact_id)

  if (updErr) {
    // 23505 = unique violation, likely the Primary-Email partial UNIQUE.
    if (updErr.code === '23505') {
      return Response.json(
        {
          success: false,
          error: 'primary_email_collision',
          hint: 'A different Contact already uses this email as Primary',
        },
        { status: 409 },
      )
    }
    console.error('[api/contacts/update] update failed:', updErr.message)
    return Response.json(
      { success: false, error: 'update_failed', detail: updErr.message },
      { status: 502 },
    )
  }

  return Response.json({
    success: true,
    slug: nextSlug,
    display_name: nextDisplayName,
  })
}
