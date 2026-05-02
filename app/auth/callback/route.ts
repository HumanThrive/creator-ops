import { NextResponse, type NextRequest } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const { searchParams, origin } = url
  const code = searchParams.get('code')
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const next = searchParams.get('next') ?? '/app'

  const supabase = await createClient()

  // PKCE flow (browser-initiated signInWithOtp)
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(`${origin}${next}`)
    console.error('[auth/callback] exchangeCodeForSession failed:', error.message)
  }

  // Token-hash flow (admin generateLink, password recovery, email confirm)
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    })
    if (!error) return NextResponse.redirect(`${origin}${next}`)
    console.error('[auth/callback] verifyOtp failed:', error.message)
  }

  console.error('[auth/callback] no usable params:', {
    search: url.search,
    code,
    tokenHash,
    type,
  })

  return NextResponse.redirect(`${origin}/signin?error=callback_failed`)
}
