import { createClient } from '@/lib/supabase/server'

// FR-11 #92 (Story 3) — guarded Brand delete.
//
// DB won't block on its own: pitches.brand_id ON DELETE SET NULL (orphans the
// pitches to the (Unknown brand) bucket) + contact_brands.brand_id ON DELETE
// CASCADE (silently drops associations). So the block + the contact-unlink
// warning are app-enforced — mirror app/api/contacts/[id]/delete, simpler:
// brands count linked pitches by the direct pitches.brand_id FK, not a pivot.
//
// ?check_only=1 — preflight that returns the counts (+ the affected contacts for
// the unlink confirm) WITHOUT deleting, so the client opens the right branch on
// the first click: blocked (pitches) / unlink-confirm (contacts) / clean. The
// real DELETE re-checks pitch_count server-side (AC3.4 race fallback).
//
// Returns:
//   200 { success, blocked:false, pitch_count:0, contact_link_count, affected_contacts } — preflight clear
//   200 { success } — delete done
//   409 { blocked:true, pitch_count, contact_link_count, brand_name } — has pitches
//   404 — brand not found (or RLS hides it)

interface RouteParams {
  params: Promise<{ id: string }>
}

interface CbJoinRow {
  role: string | null
  contacts: { display_name: string | null } | { display_name: string | null }[] | null
}

export async function POST(request: Request, { params }: RouteParams) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return Response.json({ success: false, error: 'unauthorized' }, { status: 401 })
  }

  const checkOnly = new URL(request.url).searchParams.get('check_only') === '1'
  const { id: brandId } = await params
  if (!brandId) {
    return Response.json({ success: false, error: 'id_required' }, { status: 400 })
  }

  // Load the brand (existence + name for the modal copy). RLS-scoped.
  const { data: brand, error: loadErr } = await supabase
    .from('brands')
    .select('id, name')
    .eq('id', brandId)
    .maybeSingle()
  if (loadErr) {
    console.error('[api/brands/delete] load failed:', loadErr.message)
    return Response.json({ success: false, error: 'load_failed' }, { status: 502 })
  }
  if (!brand) {
    return Response.json({ success: false, error: 'brand_not_found' }, { status: 404 })
  }

  // Linked-pitch count (direct FK) + contact-link count (for the unlink-prompt).
  const [pitchRes, contactRes] = await Promise.all([
    supabase
      .from('pitches')
      .select('*', { count: 'exact', head: true })
      .eq('brand_id', brandId),
    supabase
      .from('contact_brands')
      .select('*', { count: 'exact', head: true })
      .eq('brand_id', brandId),
  ])
  if (pitchRes.error || contactRes.error) {
    console.error(
      '[api/brands/delete] count failed:',
      (pitchRes.error ?? contactRes.error)?.message,
    )
    return Response.json({ success: false, error: 'count_failed' }, { status: 502 })
  }
  const pitchCount = pitchRes.count ?? 0
  const contactLinkCount = contactRes.count ?? 0

  // Block-if-pitches (app-enforced; fires on both preflight AND the real delete —
  // the latter is the AC3.4 race fallback when a pitch lands mid-flow).
  if (pitchCount > 0) {
    return Response.json(
      {
        success: false,
        blocked: true,
        pitch_count: pitchCount,
        contact_link_count: contactLinkCount,
        brand_name: brand.name,
      },
      { status: 409 },
    )
  }

  // Deletable (0 pitches). If it has contacts, fetch them (capped 6 = 5 shown +
  // "+N more") so the unlink-confirm can name who loses the link before commit.
  let affectedContacts: { name: string; role: string | null }[] = []
  if (contactLinkCount > 0) {
    const { data: cbRows } = await supabase
      .from('contact_brands')
      .select('role, contacts(display_name)')
      .eq('brand_id', brandId)
      .limit(6)
    affectedContacts = ((cbRows ?? []) as CbJoinRow[]).map((r) => {
      const c = Array.isArray(r.contacts) ? r.contacts[0] : r.contacts
      return { name: c?.display_name ?? '(no name)', role: r.role }
    })
  }

  // Preflight clear — report the counts + affected contacts; no delete.
  if (checkOnly) {
    return Response.json({
      success: true,
      blocked: false,
      pitch_count: 0,
      contact_link_count: contactLinkCount,
      affected_contacts: affectedContacts,
    })
  }

  // Zero-pitch path — hard delete (contact_brands CASCADEs). The unlink-confirm
  // (when contacts exist) was the client's gate before reaching here; the clean
  // 0+0 case defers here via the list's 5s Undo toast.
  const { error: delErr } = await supabase.from('brands').delete().eq('id', brandId)
  if (delErr) {
    console.error('[api/brands/delete] delete failed:', delErr.message)
    return Response.json({ success: false, error: 'delete_failed' }, { status: 502 })
  }
  return Response.json({ success: true })
}
