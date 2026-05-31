import { createClient } from '@/lib/supabase/server'
import type { ContactRole } from '@/lib/types/contact'

// FR-8 S5 (slice #76) — set / change / clear a Contact's role at a specific Brand.
// Direct UPDATE on contact_brands pivot row; RLS scopes by user_id (auth.uid()).
//
// Body: { contact_id: uuid, brand_id: uuid, role: ContactRole | null }
//
// Returns 200 { success: true } on update. 404 if pivot row doesn't exist.
// 400 on invalid body. 401 if not authenticated.

const VALID_ROLES: ContactRole[] = ['PR', 'Brand team', 'Connector', 'Founder', 'Other']

interface SetRoleBody {
  contact_id?: string
  brand_id?: string
  role?: ContactRole | null
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return Response.json({ success: false, error: 'unauthorized' }, { status: 401 })
  }

  let body: SetRoleBody
  try {
    body = await request.json()
  } catch {
    return Response.json({ success: false, error: 'invalid_json' }, { status: 400 })
  }

  const { contact_id, brand_id, role } = body
  if (!contact_id || !brand_id) {
    return Response.json(
      { success: false, error: 'contact_id_and_brand_id_required' },
      { status: 400 },
    )
  }
  if (role !== null && role !== undefined && !VALID_ROLES.includes(role)) {
    return Response.json(
      { success: false, error: 'invalid_role', valid: VALID_ROLES },
      { status: 400 },
    )
  }

  const { data, error } = await supabase
    .from('contact_brands')
    .update({ role: role ?? null })
    .eq('contact_id', contact_id)
    .eq('brand_id', brand_id)
    .select('contact_id, brand_id, role')
    .maybeSingle()

  if (error) {
    console.error('[api/contact-brands/set-role] update failed:', error.message)
    return Response.json(
      { success: false, error: 'update_failed' },
      { status: 502 },
    )
  }
  if (!data) {
    return Response.json(
      { success: false, error: 'pivot_not_found' },
      { status: 404 },
    )
  }

  return Response.json({ success: true, data })
}
