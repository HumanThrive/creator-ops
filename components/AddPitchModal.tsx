'use client'

import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { ExtractedPitch, PitchCategory } from '@/lib/types/pitch'

const CATEGORIES: PitchCategory[] = [
  'legit',
  'gifting_only',
  'low_quality',
  'spam_or_scam',
  'unclear',
  'not_a_pitch',
]

type Step = 'paste' | 'preview'
type AsyncState = 'idle' | 'loading' | 'error'

export function AddPitchModal({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const [step, setStep] = useState<Step>('paste')
  const [state, setState] = useState<AsyncState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [pitchText, setPitchText] = useState('')
  const [extracted, setExtracted] = useState<ExtractedPitch | null>(null)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  async function onExtract(e: FormEvent) {
    e.preventDefault()
    if (!pitchText.trim()) return

    setState('loading')
    setError(null)

    try {
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pitch_text: pitchText }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? 'extraction failed')
      }
      setExtracted(json.data as ExtractedPitch)
      setStep('preview')
      setState('idle')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'unknown error')
      setState('error')
    }
  }

  async function onSave(e: FormEvent) {
    e.preventDefault()
    if (!extracted) return

    setState('loading')
    setError(null)

    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      setError('Not signed in')
      setState('error')
      return
    }

    const { error: insertError } = await supabase.from('pitches').insert({
      user_id: user.id,
      raw_pitch_text: pitchText,
      brand_name: extracted.brand_name,
      sender_name: extracted.sender_name,
      deliverables: extracted.deliverables,
      budget_amount: extracted.budget.amount,
      budget_currency: extracted.budget.currency,
      budget_notes: extracted.budget.notes,
      deadline: extracted.deadline,
      category: extracted.category,
      ai_summary: extracted.summary,
      pipeline_stage: 'inbox',
    })

    if (insertError) {
      setError(insertError.message)
      setState('error')
      return
    }

    onClose()
    router.refresh()
  }

  function updateField<K extends keyof ExtractedPitch>(
    key: K,
    value: ExtractedPitch[K]
  ) {
    if (!extracted) return
    setExtracted({ ...extracted, [key]: value })
  }

  function updateBudget<K extends keyof ExtractedPitch['budget']>(
    key: K,
    value: ExtractedPitch['budget'][K]
  ) {
    if (!extracted) return
    setExtracted({
      ...extracted,
      budget: { ...extracted.budget, [key]: value },
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-lg bg-white p-6 text-gray-900 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {step === 'paste' ? 'Add a pitch' : 'Review and save'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-gray-500 hover:text-gray-900"
          >
            Close
          </button>
        </header>

        {step === 'paste' && (
          <form onSubmit={onExtract} className="space-y-3">
            <textarea
              required
              value={pitchText}
              onChange={(e) => setPitchText(e.target.value)}
              rows={12}
              placeholder="Paste the brand pitch here — email, IG DM, TikTok DM, WhatsApp, anywhere it landed"
              className="w-full rounded border border-gray-300 bg-white p-3 font-mono text-sm text-gray-900"
              disabled={state === 'loading'}
            />
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={state === 'loading' || !pitchText.trim()}
                className="rounded bg-black px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              >
                {state === 'loading' ? 'Extracting…' : 'Extract'}
              </button>
              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>
          </form>
        )}

        {step === 'preview' && extracted && (
          <form onSubmit={onSave} className="space-y-3 text-sm">
            <Field label="Brand">
              <input
                type="text"
                value={extracted.brand_name ?? ''}
                onChange={(e) =>
                  updateField('brand_name', e.target.value || null)
                }
                className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-gray-900"
              />
            </Field>
            <Field label="Sender">
              <input
                type="text"
                value={extracted.sender_name ?? ''}
                onChange={(e) =>
                  updateField('sender_name', e.target.value || null)
                }
                className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-gray-900"
              />
            </Field>
            <Field label="Deliverables (comma-separated)">
              <input
                type="text"
                value={extracted.deliverables.join(', ')}
                onChange={(e) =>
                  updateField(
                    'deliverables',
                    e.target.value
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean)
                  )
                }
                className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-gray-900"
              />
            </Field>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Budget amount">
                <input
                  type="number"
                  step="0.01"
                  value={extracted.budget.amount ?? ''}
                  onChange={(e) =>
                    updateBudget(
                      'amount',
                      e.target.value === '' ? null : Number(e.target.value)
                    )
                  }
                  className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-gray-900"
                />
              </Field>
              <Field label="Currency">
                <input
                  type="text"
                  value={extracted.budget.currency ?? ''}
                  onChange={(e) =>
                    updateBudget('currency', e.target.value || null)
                  }
                  className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-gray-900"
                />
              </Field>
              <Field label="Budget notes">
                <input
                  type="text"
                  value={extracted.budget.notes ?? ''}
                  onChange={(e) =>
                    updateBudget('notes', e.target.value || null)
                  }
                  className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-gray-900"
                />
              </Field>
            </div>
            <Field label="Deadline">
              <input
                type="text"
                value={extracted.deadline ?? ''}
                onChange={(e) =>
                  updateField('deadline', e.target.value || null)
                }
                className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-gray-900"
              />
            </Field>
            <Field label="Category">
              <select
                value={extracted.category}
                onChange={(e) =>
                  updateField('category', e.target.value as PitchCategory)
                }
                className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-gray-900"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Summary">
              <textarea
                rows={2}
                value={extracted.summary}
                onChange={(e) => updateField('summary', e.target.value)}
                className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-gray-900"
              />
            </Field>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={state === 'loading'}
                className="rounded bg-black px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              >
                {state === 'loading' ? 'Saving…' : 'Save to Inbox'}
              </button>
              <button
                type="button"
                onClick={() => setStep('paste')}
                className="text-sm text-gray-600 hover:text-gray-900"
              >
                Back
              </button>
              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-gray-900">
        {label}
      </span>
      {children}
    </label>
  )
}
