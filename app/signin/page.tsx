'use client'

import { useState, useEffect, useRef, type FormEvent } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

type Status = 'idle' | 'loading' | 'sent' | 'error'

const RESEND_COOLDOWN_SEC = 60

// CEO Q5: static demo receipts. ICP-plausible fictional brand names; not real
// brands and not the user's real data (pre-auth state has no user).
const DEMO_RECEIPTS = [
  { d: 'MAR 14', brand: 'Glow Skincare', pitches: 1, v: '$800 USD', accent: false },
  { d: 'APR 02', brand: 'Alpine Oat', pitches: 2, v: '$1,400 USD', accent: true },
  { d: 'APR 21', brand: 'Vital Roots', pitches: 1, v: '€450 EUR', accent: false },
  { d: 'MAY 03', brand: 'River Coffee', pitches: 3, v: '$2,200 USD', accent: false },
]

export default function SignInPage() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)
  const [resendIn, setResendIn] = useState(0)
  const sentEmailRef = useRef('')

  useEffect(() => {
    if (status !== 'sent' || resendIn <= 0) return
    const id = setInterval(() => setResendIn((s) => Math.max(0, s - 1)), 1000)
    return () => clearInterval(id)
  }, [status, resendIn])

  async function sendLink(targetEmail: string) {
    setStatus('loading')
    setError(null)
    const supabase = createClient()
    const { error: signInError } = await supabase.auth.signInWithOtp({
      email: targetEmail,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })
    if (signInError) {
      setError(signInError.message)
      setStatus('error')
      return
    }
    sentEmailRef.current = targetEmail
    setStatus('sent')
    setResendIn(RESEND_COOLDOWN_SEC)
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!email) return
    await sendLink(email)
  }

  async function onResend() {
    if (resendIn > 0 || !sentEmailRef.current) return
    await sendLink(sentEmailRef.current)
  }

  const cooldownLabel =
    resendIn > 0
      ? `RESEND IN 0:${String(resendIn).padStart(2, '0')}`
      : 'RESEND'

  return (
    <main className="signin-page">
      <div className="signin-left">
        <Link href="/" className="signin-brand" aria-label="Back to landing">
          SupaSpike<sup>+</sup>
        </Link>

        <div className="signin-pad">
          <span className="kicker">Sign in</span>
          <h1 className="signin-h1">
            Open<br />
            your<br />
            <em>asset.</em>
          </h1>
          {status === 'sent' ? (
            <SignInSuccess
              email={sentEmailRef.current}
              cooldownLabel={cooldownLabel}
              canResend={resendIn === 0}
              onResend={onResend}
            />
          ) : (
            <form className="signin-form" onSubmit={onSubmit}>
              <div className="signin-field">
                <label className="signin-label" htmlFor="signin-email">
                  Email · magic link
                </label>
                <input
                  id="signin-email"
                  className="signin-input"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@studio.com"
                  disabled={status === 'loading'}
                />
              </div>
              <button
                type="submit"
                className="signin-btn"
                disabled={status === 'loading' || !email}
              >
                {status === 'loading' ? 'Sending…' : 'Send the link'}
                <span className="arrow">→</span>
              </button>
              {error && (
                <p className="signin-fine" style={{ color: 'var(--accent)' }}>
                  {error}
                </p>
              )}
              <p className="signin-fine">
                We&rsquo;ll email a one-tap link. No passwords. Your pitches stay
                tied to this address.
              </p>
            </form>
          )}
        </div>

        <div className="signin-foot">
          <span></span>
          <span>SUPASPIKE.COM</span>
        </div>
      </div>

      <aside className="signin-right">
        <span className="kicker">What&rsquo;s waiting</span>
        <h2 className="signin-right-h2">
          Every pitch you&rsquo;ve saved &mdash; <em>structured,</em> searchable,
          yours.
        </h2>

        <div className="signin-receipts">
          {DEMO_RECEIPTS.map((r) => (
            <div
              key={r.brand}
              className={'signin-receipt' + (r.accent ? ' accent' : '')}
            >
              <span className="d">{r.d}</span>
              <span>
                <span className="b">{r.brand}</span> · {r.pitches}{' '}
                {r.pitches === 1 ? 'pitch' : 'pitches'}
              </span>
              <span className="v">{r.v}</span>
            </div>
          ))}
        </div>
      </aside>
    </main>
  )
}

function SignInSuccess({
  email,
  cooldownLabel,
  canResend,
  onResend,
}: {
  email: string
  cooldownLabel: string
  canResend: boolean
  onResend: () => void
}) {
  return (
    <div className="signin-success">
      <span className="signin-success-stamp">Check your inbox</span>
      <h2 className="signin-success-h">Link sent.</h2>
      <p className="signin-success-body">
        We just sent a one-tap sign-in to{' '}
        <span className="email">{email}</span>. It expires in 15 minutes &mdash;
        open it on the device you&rsquo;ll be working on.
      </p>
      <div className="signin-success-fine">
        DIDN&rsquo;T LAND? CHECK SPAM ·{' '}
        {canResend ? (
          <button
            type="button"
            onClick={onResend}
            className="font-mono uppercase tracking-wider text-accent hover:opacity-70"
          >
            {cooldownLabel}
          </button>
        ) : (
          <span>{cooldownLabel}</span>
        )}
      </div>
    </div>
  )
}
