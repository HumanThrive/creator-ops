'use client'

import { useState, type FormEvent } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Spinner } from './Spinner'

type Status = 'idle' | 'loading' | 'success' | 'duplicate' | 'error'

export default function WaitlistForm() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setStatus('loading')
    setError(null)

    const supabase = createClient()
    const { error: insertError } = await supabase
      .from('waitlist_emails')
      .insert({ email: email.trim().toLowerCase(), source: 'landing' })

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
      <p className="text-sm text-zinc-700">
        You&apos;re in. We&apos;ll email you when SupaSpike opens for beta.
      </p>
    )
  }

  if (status === 'duplicate') {
    return (
      <p className="text-sm text-zinc-700">
        Looks like you&apos;re already on the list. We&apos;ll be in touch.
      </p>
    )
  }

  return (
    <form onSubmit={onSubmit} className="w-full">
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          aria-label="Email"
          className="flex-1 rounded-md border border-zinc-300 bg-white px-4 py-3 text-base text-zinc-900 placeholder:text-zinc-400 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
          disabled={status === 'loading'}
        />
        <button
          type="submit"
          disabled={status === 'loading' || !email}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-teal-600 px-6 py-3 text-base font-medium text-white transition-colors hover:bg-teal-700 disabled:opacity-50"
        >
          {status === 'loading' && <Spinner className="h-4 w-4" />}
          {status === 'loading' ? 'Sending…' : 'Get early access'}
        </button>
      </div>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </form>
  )
}
