import { createClient } from '@/lib/supabase/server'
import { generateBaseSlug, resolveSlugCollision } from '@/lib/slug'

// FR-7 W66 — pitch save orchestration layer
//
// Server-side resolves Brand + Contact + Thread before calling the
// save_pitch_with_activity RPC. Replaces the pre-FR-7 client-direct RPC call
// at AddPitchModal.tsx lines 194–213 (W68 will rewire the client to call this
// route instead of the RPC directly). Two paths:
//
//   1. String-based auto-resolution — AC1.1 / AC2.1 default behavior. Client
//      sends brand_name + sender_email strings; route resolves to entity IDs
//      via case-insensitive Brand lookup and @>-Primary-Email Contact lookup.
//
//   2. Typeahead override — AC7.6 path (W68). Client sends explicit brand_id
//      and/or contact_id; route uses them directly, bypassing string resolution.
//
// Pivot rows (contact_pitches, contact_brands) are INSERTed post-RPC inside
// this route per the "resolution at route, NOT in-RPC" architecture lock.
// Transient inconsistency window if pivot INSERTs fail post-RPC is tolerable
// at v1 volumes (2 active beta users; low pitch arrival rate).

type Direction = 'inbound' | 'outbound'

interface SaveRequestBody {
  raw_pitch_text: string
  direction: Direction
  brand_name: string | null
  sender_name: string | null
  sender_email: string | null
  source_channel: string | null
  source_subject: string | null
  industry: string | null
  ai_summary: string | null
  deliverables: unknown
  budget_amount: number | null
  budget_currency: string | null
  budget_notes: string | null
  deadline: string | null
  tag_slugs: string[]
  // Typeahead overrides (optional; W68 client passes when user explicitly
  // selects/creates an entity via the typeahead dropdown)
  brand_id?: string | null
  contact_id?: string | null
}

type Supabase = Awaited<ReturnType<typeof createClient>>

const UNIQUE_VIOLATION = '23505'

async function resolveBrand(
  supabase: Supabase,
  userId: string,
  override: string | null | undefined,
  brandName: string | null,
): Promise<string | null> {
  if (override) return override
  const normalized = brandName?.trim()
  if (!normalized) return null

  // Lookup-first against the case-insensitive UNIQUE expression index
  const { data: existing } = await supabase
    .from('brands')
    .select('id')
    .eq('user_id', userId)
    .ilike('name', normalized)
    .maybeSingle()
  if (existing) return existing.id

  // New brand — assign a slug at create (AC-M2). Null base when the name doesn't
  // slugify (all-punctuation / all-CJK) → slug stays NULL, the brand routes by
  // uuid. Slug-gen is the single source in lib/slug.ts (shared with the backfill).
  const slugExists = async (candidate: string): Promise<boolean> => {
    const { data: hit } = await supabase
      .from('brands')
      .select('id')
      .eq('user_id', userId)
      .eq('slug', candidate)
      .maybeSingle()
    return hit !== null
  }
  const base = generateBaseSlug(normalized)
  const slug = base ? await resolveSlugCollision(base, slugExists) : null

  // Race-safe INSERT — fall back to re-SELECT on 23505
  const { data: inserted, error } = await supabase
    .from('brands')
    .insert({ user_id: userId, name: normalized, slug })
    .select('id')
    .single()
  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      // Name race (common): the brand was created concurrently — reuse it.
      const { data: raced } = await supabase
        .from('brands')
        .select('id')
        .eq('user_id', userId)
        .ilike('name', normalized)
        .maybeSingle()
      if (raced) return raced.id
      // Slug race (rare): a different name resolved to the same slug between our
      // probe and this insert — re-resolve against the now-taken slug, retry once.
      if (base) {
        const retrySlug = await resolveSlugCollision(base, slugExists)
        const { data: retried, error: retryErr } = await supabase
          .from('brands')
          .insert({ user_id: userId, name: normalized, slug: retrySlug })
          .select('id')
          .single()
        if (retryErr) throw retryErr
        return retried.id
      }
    }
    throw error
  }
  return inserted.id
}

async function resolveContact(
  supabase: Supabase,
  userId: string,
  override: string | null | undefined,
  senderEmail: string | null,
  senderName: string | null,
): Promise<string | null> {
  if (override) return override

  const normalizedName = senderName?.trim() || null
  const normalizedEmail = senderEmail?.trim().toLowerCase() || null

  if (!normalizedEmail) {
    // No Primary Email — AC1.2 allows multiple NULL-email Contacts per user.
    // Create a fresh Contact with empty channels. User can populate via the
    // Surface D typeahead's channel-aware inline form (W68/W69).
    if (!normalizedName) return null // nothing to identify by
    const { data: inserted, error } = await supabase
      .from('contacts')
      .insert({
        user_id: userId,
        display_name: normalizedName,
        channels: [],
      })
      .select('id')
      .single()
    if (error) throw error
    return inserted.id
  }

  const primaryEmailChannel = [
    { kind: 'Email', identifier: normalizedEmail, primary: true },
  ]

  // Cross-Brand Primary-Email match via GIN-indexed @> query
  const { data: existing } = await supabase
    .from('contacts')
    .select('id')
    .eq('user_id', userId)
    .contains('channels', primaryEmailChannel)
    .maybeSingle()
  if (existing) return existing.id

  const { data: inserted, error } = await supabase
    .from('contacts')
    .insert({
      user_id: userId,
      display_name: normalizedName,
      channels: primaryEmailChannel,
    })
    .select('id')
    .single()
  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      const { data: raced } = await supabase
        .from('contacts')
        .select('id')
        .eq('user_id', userId)
        .contains('channels', primaryEmailChannel)
        .maybeSingle()
      if (raced) return raced.id
    }
    throw error
  }
  return inserted.id
}

async function resolveThread(
  supabase: Supabase,
  userId: string,
  contactId: string | null,
): Promise<string | null> {
  if (!contactId) return null

  const { data: existing } = await supabase
    .from('threads')
    .select('id')
    .eq('user_id', userId)
    .eq('contact_id', contactId)
    .maybeSingle()
  if (existing) return existing.id

  const { data: inserted, error } = await supabase
    .from('threads')
    .insert({ user_id: userId, contact_id: contactId })
    .select('id')
    .single()
  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      const { data: raced } = await supabase
        .from('threads')
        .select('id')
        .eq('user_id', userId)
        .eq('contact_id', contactId)
        .maybeSingle()
      if (raced) return raced.id
    }
    throw error
  }
  return inserted.id
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return Response.json(
      { success: false, error: 'unauthorized' },
      { status: 401 },
    )
  }

  let body: SaveRequestBody
  try {
    body = await request.json()
  } catch {
    return Response.json(
      { success: false, error: 'invalid_json' },
      { status: 400 },
    )
  }

  if (!body.raw_pitch_text?.trim()) {
    return Response.json(
      { success: false, error: 'raw_pitch_text_required' },
      { status: 400 },
    )
  }
  if (body.direction !== 'inbound' && body.direction !== 'outbound') {
    return Response.json(
      { success: false, error: 'invalid_direction' },
      { status: 400 },
    )
  }
  if (!Array.isArray(body.tag_slugs)) {
    return Response.json(
      { success: false, error: 'tag_slugs_required' },
      { status: 400 },
    )
  }

  let brandId: string | null
  let contactId: string | null
  let threadId: string | null
  try {
    brandId = await resolveBrand(supabase, user.id, body.brand_id, body.brand_name)
    // Outbound pitches do NOT identify a Contact (AC1.5); contact_id stays NULL.
    contactId =
      body.direction === 'outbound'
        ? null
        : await resolveContact(
            supabase,
            user.id,
            body.contact_id,
            body.sender_email,
            body.sender_name,
          )
    threadId = await resolveThread(supabase, user.id, contactId)
  } catch (e) {
    const err = e as { code?: string; message?: string }
    console.error('[api/pitches/save] resolution failed:', err.code, err.message)
    return Response.json(
      { success: false, error: 'resolution_failed' },
      { status: 502 },
    )
  }

  const { data: rpcResult, error: rpcError } = await supabase.rpc(
    'save_pitch_with_activity',
    {
      p_raw_pitch_text: body.raw_pitch_text,
      p_direction: body.direction,
      p_brand_name: body.brand_name,
      p_sender_name: body.sender_name,
      p_deliverables: body.deliverables,
      p_budget_amount: body.budget_amount,
      p_budget_currency: body.budget_currency,
      p_budget_notes: body.budget_notes,
      p_deadline: body.deadline,
      p_tag_slugs: body.tag_slugs,
      p_ai_summary: body.ai_summary,
      p_industry: body.industry,
      p_sender_email: body.sender_email,
      p_source_channel: body.source_channel,
      p_source_subject: body.source_subject,
      p_brand_id: brandId,
      p_contact_id: contactId,
      p_thread_id: threadId,
    },
  )
  if (rpcError) {
    console.error('[api/pitches/save] RPC failed:', rpcError.message)
    return Response.json(
      { success: false, error: 'save_rpc_failed' },
      { status: 502 },
    )
  }

  const pitchId = (rpcResult as { pitch_id?: string })?.pitch_id
  if (!pitchId) {
    console.error('[api/pitches/save] RPC returned no pitch_id:', rpcResult)
    return Response.json(
      { success: false, error: 'save_rpc_invalid_response' },
      { status: 502 },
    )
  }

  // Post-RPC pivot inserts. Non-atomic relative to the RPC; transient
  // inconsistency tolerable per architecture decision. ON CONFLICT
  // semantics applied via 23505 swallow.
  if (contactId) {
    const { error: cpError } = await supabase.from('contact_pitches').insert({
      contact_id: contactId,
      pitch_id: pitchId,
      user_id: user.id,
    })
    if (cpError && cpError.code !== UNIQUE_VIOLATION) {
      console.error('[api/pitches/save] contact_pitches insert failed:', cpError.message)
    }
  }
  if (contactId && brandId) {
    const { error: cbError } = await supabase.from('contact_brands').insert({
      contact_id: contactId,
      brand_id: brandId,
      user_id: user.id,
    })
    if (cbError && cbError.code !== UNIQUE_VIOLATION) {
      console.error('[api/pitches/save] contact_brands insert failed:', cbError.message)
    }
  }

  return Response.json({ success: true, data: rpcResult })
}
