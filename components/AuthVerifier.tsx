'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'

// Mounted in the app layout. After each navigation under /app/*, hits
// /api/whoami (which runs Supabase getUser server-side). On 401, kicks the
// user to /signin. Pairs with proxy.ts using getSession() — proxy is fast
// (cookie-only) and this verifier enforces revocation without blocking
// the critical render path.
export function AuthVerifier() {
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    let cancelled = false

    fetch('/api/whoami', { cache: 'no-store' })
      .then((res) => {
        if (cancelled) return
        if (res.status === 401) {
          router.push('/signin')
        }
      })
      .catch(() => {
        // Network blip — don't kick the user out. Proxy will gate the next
        // navigation if the session is genuinely gone.
      })

    return () => {
      cancelled = true
    }
  }, [pathname, router])

  return null
}
