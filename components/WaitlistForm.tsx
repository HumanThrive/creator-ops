'use client'

import { useState, type FormEvent } from 'react'
import { createClient } from '@/lib/supabase/client'

type Status = 'idle' | 'loading' | 'success' | 'duplicate' | 'error'

export default function WaitlistForm() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setStatus('loading')
    setError(null)

    const params = new URLSearchParams(window.location.search)
    const utmKeys = [
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_content',
      'utm_term',
    ] as const
    const utmFields: Record<string, string> = {}
    for (const key of utmKeys) {
      const value = params.get(key)
      if (value !== null && value !== '') {
        utmFields[key] = value
      }
    }

    const supabase = createClient()
    const { error: insertError } = await supabase
      .from('waitlist_emails')
      .insert({
        email: email.trim().toLowerCase(),
        source: 'landing',
        ...utmFields,
      })

    if (insertError) {
      if (insertError.code === '23505') {
        setStatus('duplicate')
      } else {
        setError(insertError.message)
        setStatus('error')
      }
    } else {
      setStatus('success')
    }
  }

  if (status === 'success') {
    return (
      <div className="capture-form" role="status" aria-live="polite">
        <div className="capture-msg-stack">
          <div className="capture-msg is-ok is-strong">
            You&apos;re in. We have saved your email: {email}
          </div>
          <div className="capture-msg is-ok">
            We&apos;ll email you when SupaSpike opens for beta.
          </div>
        </div>
      </div>
    )
  }

  if (status === 'duplicate') {
    return (
      <div className="capture-form" role="status" aria-live="polite">
        <div className="capture-msg is-ok">
          Looks like {email} is already on the list. We&apos;ll be in touch.
        </div>
      </div>
    )
  }

  const message =
    status === 'error'
      ? error || 'Something went wrong. Try again in a moment.'
      : "We'll never share your email. One follow-up max."

  const msgKind = status === 'error' ? 'is-err' : ''

  return (
    <form onSubmit={onSubmit} className="capture-form">
      <label className="capture-form-label" htmlFor="waitlist-email">
        Your email
      </label>
      <div className="capture-form-row">
        <input
          id="waitlist-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@yourdomain.com"
          aria-label="Email"
          className="capture-input"
          disabled={status === 'loading'}
        />
        <button
          type="submit"
          disabled={status === 'loading' || !email}
          className="capture-submit"
        >
          {status === 'loading' ? 'Sending…' : 'Request access →'}
        </button>
      </div>
      <div className={`capture-msg ${msgKind}`.trim()}>{message}</div>
    </form>
  )
}
