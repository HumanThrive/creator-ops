import { createClient } from '@/lib/supabase/server'

// FR-8 S5 (slice #76) — unlink a Contact↔Brand association.
//
// Branch logic per AC5.2 / AC5.3 (LD A1 in spec):
//   - If the pair has ≥1 pitch in `pitches` (where contact_id=$c AND brand_id=$b):
//     SOFT — UPDATE contact_brands SET ended_at = now(), ended_reason = $reason
//     (history preserved; brand-card stays in chain with ENDED visual treatment;
//     Reactivate restores).
//   - If zero pitches for the pair:
//     HARD — DELETE the contact_brands row (no orphan archived rows for pure-typo pairs).
//
// Body: { contact_id: uuid, brand_id: uuid, reason?: string }
//
// Returns { success: true, result: 'soft' | 'hard', ended_at?: string }.
//
// Note (v1-trim per task #76): no `brandassoc_ended` activity-log event — the
// `activities.type` CHECK enum doesn't include this type yet, and adding it
// requires a schema migration that's out-of-scope for FR-8 #76. Audit-trail
// event logging tracked as FR-9 / follow-on CR candidate; see handoff entry.

interface UnlinkBody {
  contact_id?: string
  brand_id?: string
  reason?: string
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return Response.json({ success: false, error: 'unauthorized' }, { status: 401 })
  }

  let body: UnlinkBody
  try {
    body = await request.json()
  } catch {
    return Response.json({ success: false, error: 'invalid_json' }, { status: 400 })
  }

  const { contact_id, brand_id, reason } = body
  if (!contact_id || !brand_id) {
    return Response.json(
      { success: false, error: 'contact_id_and_brand_id_required' },
      { status: 400 },
    )
  }
  const trimmedReason = (reason ?? '').trim()
  const reasonValue = trimmedReason ? trimmedReason : null

  // Branch check — does any pitch link this exact (contact, brand) pair?
  const { data: pairPitch, error: checkErr } = await supabase
    .from('pitches')
    .select('id')
    .eq('contact_id', contact_id)
    .eq('brand_id', brand_id)
    .limit(1)
    .maybeSingle()
  if (checkErr) {
    console.error('[api/contact-brands/unlink] pair-check failed:', checkErr.message)
    return Response.json(
      { success: false, error: 'check_failed' },
      { status: 502 },
    )
  }

  if (pairPitch) {
    // Soft path — set ended_at + ended_reason; keep history.
    const endedAt = new Date().toISOString()
    const { data, error } = await supabase
      .from('contact_brands')
      .update({ ended_at: endedAt, ended_reason: reasonValue })
      .eq('contact_id', contact_id)
      .eq('brand_id', brand_id)
      .select('contact_id, brand_id, ended_at, ended_reason')
      .maybeSingle()
    if (error) {
      console.error('[api/contact-brands/unlink] soft update failed:', error.message)
      return Response.json(
        { success: false, error: 'soft_update_failed' },
        { status: 502 },
      )
    }
    if (!data) {
      return Response.json(
        { success: false, error: 'pivot_not_found' },
        { status: 404 },
      )
    }
    return Response.json({ success: true, result: 'soft', ...data })
  }

  // Hard path — no pitches under this pair; drop the row entirely.
  const { error: delErr, count } = await supabase
    .from('contact_brands')
    .delete({ count: 'exact' })
    .eq('contact_id', contact_id)
    .eq('brand_id', brand_id)
  if (delErr) {
    console.error('[api/contact-brands/unlink] hard delete failed:', delErr.message)
    return Response.json(
      { success: false, error: 'hard_delete_failed' },
      { status: 502 },
    )
  }
  if (!count) {
    return Response.json(
      { success: false, error: 'pivot_not_found' },
      { status: 404 },
    )
  }

  return Response.json({ success: true, result: 'hard' })
}
