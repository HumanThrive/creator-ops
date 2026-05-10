import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createSSRClient } from '@/lib/supabase/server'

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const email =
    typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''

  if (!email) {
    return NextResponse.json({ error: 'invalid_email' }, { status: 400 })
  }

  // Service role bypasses "no_one_reads_waitlist" RLS policy.
  // Both conditions must hold: email exists AND Founder has toggled invited = true.
  const { data: row } = await adminClient()
    .from('waitlist_emails')
    .select('id')
    .eq('email', email)
    .eq('invited', true)
    .maybeSingle()

  if (!row) {
    return NextResponse.json({ error: 'not_on_list' }, { status: 403 })
  }

  const origin =
    request.headers.get('origin') ?? new URL(request.url).origin

  const supabase = await createSSRClient()
  const { error: otpError } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  })

  if (otpError) {
    console.error('[api/signin] signInWithOtp failed:', otpError.message)
    return NextResponse.json(
      { error: 'otp_failed', message: otpError.message },
      { status: 502 },
    )
  }

  return NextResponse.json({ ok: true })
}
