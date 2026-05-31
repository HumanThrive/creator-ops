import { createClient } from '@/lib/supabase/server'

// FR-8 S4 (slice #78) — guarded contact delete.
//
// DB layer DOES NOT block delete on its own — `pitches.contact_id ON DELETE
// SET NULL` + thread/pivot CASCADE means a raw DELETE silently destroys
// relationship history. App-enforced block-if-linked per LD A4 in the spec:
//   1. Pre-check: `SELECT 1 FROM contact_pitches WHERE contact_id = $1 LIMIT 1`
//      (covers any pitch the contact participated in via the M:N pivot —
//      including legacy / multi-contact pitches).
//   2. If blocked → return 409 { blocked: true, pitch_count, brand_count } so
//      the client renders the DeleteBlockedModal w/ informational copy.
//   3. If clear → hard DELETE (cascades cleanly: empty thread + empty pivots).
//
// Body: none (id comes from path).
//
// Returns:
//   200 { success: true } on delete.
//   409 { blocked: true, pitch_count, brand_count, contact_name } when history exists.
//   404 if contact doesn't exist (or RLS hides it).

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function POST(_request: Request, { params }: RouteParams) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return Response.json({ success: false, error: 'unauthorized' }, { status: 401 })
  }

  const { id: contactId } = await params
  if (!contactId) {
    return Response.json(
      { success: false, error: 'id_required' },
      { status: 400 },
    )
  }

  // Load the contact (existence + display_name for blocked-modal copy).
  const { data: contact, error: loadErr } = await supabase
    .from('contacts')
    .select('id, display_name')
    .eq('id', contactId)
    .maybeSingle()
  if (loadErr) {
    console.error('[api/contacts/delete] load failed:', loadErr.message)
    return Response.json({ success: false, error: 'load_failed' }, { status: 502 })
  }
  if (!contact) {
    return Response.json(
      { success: false, error: 'contact_not_found' },
      { status: 404 },
    )
  }

  // Linked-pitch check via contact_pitches pivot (LD A4 canonical query).
  const { count: pitchCount, error: pitchCountErr } = await supabase
    .from('contact_pitches')
    .select('*', { count: 'exact', head: true })
    .eq('contact_id', contactId)
  if (pitchCountErr) {
    console.error(
      '[api/contacts/delete] pitch-count failed:',
      pitchCountErr.message,
    )
    return Response.json(
      { success: false, error: 'pitch_count_failed' },
      { status: 502 },
    )
  }

  if ((pitchCount ?? 0) > 0) {
    // Also gather active brand-association count for the blocked modal copy.
    const { count: brandCount } = await supabase
      .from('contact_brands')
      .select('*', { count: 'exact', head: true })
      .eq('contact_id', contactId)
      .is('ended_at', null)

    return Response.json(
      {
        success: false,
        blocked: true,
        pitch_count: pitchCount ?? 0,
        brand_count: brandCount ?? 0,
        contact_name: contact.display_name,
      },
      { status: 409 },
    )
  }

  // Zero-history path — quiet hard delete (cascades empty thread + pivots).
  const { error: delErr } = await supabase
    .from('contacts')
    .delete()
    .eq('id', contactId)
  if (delErr) {
    console.error('[api/contacts/delete] delete failed:', delErr.message)
    return Response.json(
      { success: false, error: 'delete_failed' },
      { status: 502 },
    )
  }

  return Response.json({ success: true })
}
