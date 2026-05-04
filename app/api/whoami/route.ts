import { createClient } from '@/lib/supabase/server'

// Validates the current session against Supabase Auth (network round-trip).
// Used by <AuthVerifier> after each navigation to enforce revocation fast,
// without blocking the page render itself (proxy uses getSession for speed).
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return Response.json({ ok: false }, { status: 401 })
  }
  return Response.json({ ok: true })
}
