import { createClient } from '@/lib/supabase/server'
import { generateBaseSlug, resolveSlugCollision } from '@/lib/slug'
import type { ChannelEntry, ChannelKind } from '@/lib/types/contact'

// FR-8 S2 (slice #79) — standalone Contact creation.
//
// Body: { display_name: string | null, channels: ChannelEntry[] }
//   v1-trim: optional Brand+role at create-time deferred per task #79 v1-trim.
//   Caller can edit/link via Contact-detail surfaces after create.
//
// Flow:
//   1. Auth check (RLS scopes via user_id below).
//   2. Validate channels shape (kind ∈ 9, ≤1 Primary).
//   3. Compute slug via lib/slug.ts (null if no display_name → Contact routes
//      by uuid only per LD-Gap-B (b1) / Delta 6).
//   4. INSERT contacts with explicit user_id per
//      [[Client-side INSERT into RLS-protected]] LD calibration (route is
//      server-side but same RLS rule applies — INSERT requires user_id match
//      auth.uid()). previous_slugs defaults to '{}' via column DEFAULT.
//   5. On 23505 (Primary-Email collision) → 409 { primary_email_collision }
//      → client renders DupEmailCallout per #78 contract.
//   6. Return { success: true, id, slug } so the client can router.push to
//      /app/people/[slug || id].

const VALID_KINDS: ChannelKind[] = [
  'Email', 'IG', 'TikTok', 'WhatsApp', 'X', 'IRL', 'Facebook', 'LinkedIn', 'Website',
]

interface CreateBody {
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
    out.push({ kind: kind as ChannelKind, identifier: identifier.trim(), primary })
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

  let body: CreateBody
  try {
    body = await request.json()
  } catch {
    return Response.json({ success: false, error: 'invalid_json' }, { status: 400 })
  }

  const rawName = body.display_name
  const displayName =
    typeof rawName === 'string' && rawName.trim() ? rawName.trim() : null

  const channelsResult = validateChannels(body.channels ?? [])
  if (!channelsResult.ok) {
    return Response.json(
      { success: false, error: channelsResult.error },
      { status: 400 },
    )
  }
  const channels = channelsResult.value

  // ── Slug-gen ──────────────────────────────────────────────────────────
  let slug: string | null = null
  const base = generateBaseSlug(displayName)
  if (base) {
    const exists = async (candidate: string): Promise<boolean> => {
      const { data, error } = await supabase
        .from('contacts')
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

  // ── INSERT ────────────────────────────────────────────────────────────
  const { data: inserted, error: insertErr } = await supabase
    .from('contacts')
    .insert({
      user_id: user.id,
      display_name: displayName,
      channels,
      slug,
      // previous_slugs defaults to '{}' via column DEFAULT — explicit empty
      // array also works; let the DB default handle it.
    })
    .select('id, slug')
    .single()

  if (insertErr) {
    if (insertErr.code === '23505') {
      return Response.json(
        {
          success: false,
          error: 'primary_email_collision',
          hint: 'A different Contact already uses this email as Primary',
        },
        { status: 409 },
      )
    }
    console.error('[api/contacts/create] insert failed:', insertErr.message)
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
