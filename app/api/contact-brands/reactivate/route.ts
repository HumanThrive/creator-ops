import { createClient } from '@/lib/supabase/server'

// FR-8 S5 (slice #76) — reactivate a soft-deactivated Contact↔Brand association.
//
// UPDATE contact_brands SET ended_at = NULL, ended_reason = NULL
//   WHERE contact_id=$c AND brand_id=$b AND ended_at IS NOT NULL
//
// Per AC5.4: card flips from ENDED back to Prior (re-promotion to Current is
// future work — Reactivate restores history visibility, not active-now status).
//
// Body: { contact_id: uuid, brand_id: uuid }
//
// Returns { success: true } on update; 404 if pivot not found OR if it was
// already active (idempotency check via filter, not result row count).
//
// v1-trim per task #76: no `brandassoc_reactivated` activity-log event (same
// spec-vs-schema gap as unlink — activities.type CHECK enum extension is
// out-of-scope for FR-8). Tracked as FR-9 / follow-on CR candidate.

interface ReactivateBody {
  contact_id?: string
  brand_id?: string
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return Response.json({ success: false, error: 'unauthorized' }, { status: 401 })
  }

  let body: ReactivateBody
  try {
    body = await request.json()
  } catch {
    return Response.json({ success: false, error: 'invalid_json' }, { status: 400 })
  }

  const { contact_id, brand_id } = body
  if (!contact_id || !brand_id) {
    return Response.json(
      { success: false, error: 'contact_id_and_brand_id_required' },
      { status: 400 },
    )
  }

  const { data, error } = await supabase
    .from('contact_brands')
    .update({ ended_at: null, ended_reason: null })
    .eq('contact_id', contact_id)
    .eq('brand_id', brand_id)
    .not('ended_at', 'is', null)  // idempotency: only flip if currently ended
    .select('contact_id, brand_id, ended_at')
    .maybeSingle()

  if (error) {
    console.error('[api/contact-brands/reactivate] update failed:', error.message)
    return Response.json(
      { success: false, error: 'update_failed' },
      { status: 502 },
    )
  }
  if (!data) {
    return Response.json(
      { success: false, error: 'pivot_not_found_or_already_active' },
      { status: 404 },
    )
  }

  return Response.json({ success: true, data })
}
