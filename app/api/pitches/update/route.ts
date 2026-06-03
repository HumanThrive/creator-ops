import { createClient } from '@/lib/supabase/server'

// FR-7 W66 — pitch update orchestration layer
//
// Forwards to update_pitch_with_activity RPC. At W66 there is no live caller;
// W69 EditDetailsOverlay will rewire PitchDetailModal's handleSavePitchDetails
// (currently at PitchDetailModal.tsx lines 263–329) to call this route
// instead of the RPC directly.
//
// Re-resolution of Brand/Contact from string values is NOT in W66 scope. The
// W69 typeahead resolves the entity client-side and passes brand_id /
// contact_id / thread_id (or null = no change) explicitly. Route just
// forwards; the RPC's COALESCE semantics on the 3 new FKs preserve old
// values when the caller passes null.
//
// Pivot diff handling (DELETE old contact_pitches + INSERT new on Contact
// re-link; INSERT contact_brands on new (Contact, Brand) pair) is W69 scope —
// the route needs to compare old vs new state, which the typeahead-driven
// client knows. W66 stub does not touch pivots.

interface UpdateRequestBody {
  pitch_id: string
  brand_name: string | null
  sender_name: string | null
  sender_email: string | null
  source_channel: string | null
  source_subject: string | null
  industry: string | null
  ai_summary: string | null
  user_notes: string | null
  deliverables: unknown
  budget_amount: number | null
  budget_currency: string | null
  budget_notes: string | null
  deadline: string | null
  tag_slugs: string[]
  field_diffs: Record<string, unknown>
  // Typeahead overrides (W69 client; null = no change via RPC COALESCE)
  brand_id?: string | null
  contact_id?: string | null
  thread_id?: string | null
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

  let body: UpdateRequestBody
  try {
    body = await request.json()
  } catch {
    return Response.json(
      { success: false, error: 'invalid_json' },
      { status: 400 },
    )
  }

  if (!body.pitch_id) {
    return Response.json(
      { success: false, error: 'pitch_id_required' },
      { status: 400 },
    )
  }
  if (!Array.isArray(body.tag_slugs)) {
    return Response.json(
      { success: false, error: 'tag_slugs_required' },
      { status: 400 },
    )
  }

  const { data: rpcResult, error: rpcError } = await supabase.rpc(
    'update_pitch_with_activity',
    {
      p_pitch_id: body.pitch_id,
      p_brand_name: body.brand_name,
      p_sender_name: body.sender_name,
      p_deliverables: body.deliverables,
      p_budget_amount: body.budget_amount,
      p_budget_currency: body.budget_currency,
      p_budget_notes: body.budget_notes,
      p_deadline: body.deadline,
      p_tag_slugs: body.tag_slugs,
      p_ai_summary: body.ai_summary,
      p_user_notes: body.user_notes,
      p_field_diffs: body.field_diffs ?? {},
      p_industry: body.industry,
      p_sender_email: body.sender_email,
      p_source_channel: body.source_channel,
      p_source_subject: body.source_subject,
      p_brand_id: body.brand_id ?? null,
      p_contact_id: body.contact_id ?? null,
      p_thread_id: body.thread_id ?? null,
    },
  )
  if (rpcError) {
    console.error('[api/pitches/update] RPC failed:', rpcError.message)
    return Response.json(
      { success: false, error: 'update_rpc_failed' },
      { status: 502 },
    )
  }

  // CR-7: update_pitch_with_activity uses brand_id = COALESCE(p_brand_id, brand_id),
  // where null means "no change" — so the RPC alone can't clear the FK. Removing a
  // brand cleared brand_name but left brand_id pointing at the old brand, so the
  // pitch stayed under that brand on /app/brands (which keys on the canonical
  // brand_id) instead of moving to (Unknown brand). When the brand name is cleared,
  // explicitly NULL brand_id so "no brand name ⇒ no brand". Changing to a different
  // brand keeps a non-empty brand_name, so this is a no-op on that path.
  if (!body.brand_name?.trim()) {
    const { error: clearBrandErr } = await supabase
      .from('pitches')
      .update({ brand_id: null })
      .eq('id', body.pitch_id)
    if (clearBrandErr) {
      console.error(
        '[api/pitches/update] brand_id clear failed:',
        clearBrandErr.message,
      )
    }
  }

  return Response.json({ success: true, data: rpcResult })
}
