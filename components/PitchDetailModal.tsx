'use client'

import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Pitch, PipelineStage, PitchCategory } from '@/lib/types/pitch'

const CATEGORIES: PitchCategory[] = [
  'legit',
  'gifting_only',
  'low_quality',
  'spam_or_scam',
  'unclear',
  'not_a_pitch',
]

const STAGES: { value: PipelineStage; label: string }[] = [
  { value: 'inbox', label: 'Inbox' },
  { value: 'negotiating', label: 'Negotiating' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'delivered_paid', label: 'Delivered & Paid' },
]

type AsyncState = 'idle' | 'loading' | 'error'

export function PitchDetailModal({
  pitch,
  onClose,
}: {
  pitch: Pitch
  onClose: () => void
}) {
  const router = useRouter()
  const [state, setState] = useState<AsyncState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<Pitch>(pitch)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  function update<K extends keyof Pitch>(key: K, value: Pitch[K]) {
    setDraft({ ...draft, [key]: value })
  }

  async function onSave(e: FormEvent) {
    e.preventDefault()
    setState('loading')
    setError(null)

    const supabase = createClient()
    const { error: updateError } = await supabase
      .from('pitches')
      .update({
        brand_name: draft.brand_name,
        sender_name: draft.sender_name,
        deliverables: draft.deliverables,
        budget_amount: draft.budget_amount,
        budget_currency: draft.budget_currency,
        budget_notes: draft.budget_notes,
        deadline: draft.deadline,
        category: draft.category,
        ai_summary: draft.ai_summary,
        pipeline_stage: draft.pipeline_stage,
        user_notes: draft.user_notes,
      })
      .eq('id', pitch.id)

    if (updateError) {
      setError(updateError.message)
      setState('error')
      return
    }

    onClose()
    router.refresh()
  }

  async function onDelete() {
    const confirmed = window.confirm(
      `Delete "${pitch.brand_name ?? 'this pitch'}"? This cannot be undone.`
    )
    if (!confirmed) return

    setState('loading')
    setError(null)

    const supabase = createClient()
    const { error: deleteError } = await supabase
      .from('pitches')
      .delete()
      .eq('id', pitch.id)

    if (deleteError) {
      setError(deleteError.message)
      setState('error')
      return
    }

    onClose()
    router.refresh()
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
          <h2 className="text-lg font-semibold">Edit pitch</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-gray-500 hover:text-gray-900"
          >
            Close
          </button>
        </header>

        <form onSubmit={onSave} className="space-y-3 text-sm">
          <Field label="Pipeline stage">
            <select
              value={draft.pipeline_stage}
              onChange={(e) =>
                update('pipeline_stage', e.target.value as PipelineStage)
              }
              className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-gray-900"
            >
              {STAGES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Brand">
            <input
              type="text"
              value={draft.brand_name ?? ''}
              onChange={(e) => update('brand_name', e.target.value || null)}
              className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-gray-900"
            />
          </Field>
          <Field label="Sender">
            <input
              type="text"
              value={draft.sender_name ?? ''}
              onChange={(e) => update('sender_name', e.target.value || null)}
              className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-gray-900"
            />
          </Field>
          <Field label="Deliverables (comma-separated)">
            <input
              type="text"
              value={draft.deliverables.join(', ')}
              onChange={(e) =>
                update(
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
                value={draft.budget_amount ?? ''}
                onChange={(e) =>
                  update(
                    'budget_amount',
                    e.target.value === '' ? null : Number(e.target.value)
                  )
                }
                className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-gray-900"
              />
            </Field>
            <Field label="Currency">
              <input
                type="text"
                value={draft.budget_currency ?? ''}
                onChange={(e) =>
                  update('budget_currency', e.target.value || null)
                }
                className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-gray-900"
              />
            </Field>
            <Field label="Budget notes">
              <input
                type="text"
                value={draft.budget_notes ?? ''}
                onChange={(e) =>
                  update('budget_notes', e.target.value || null)
                }
                className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-gray-900"
              />
            </Field>
          </div>
          <Field label="Deadline">
            <input
              type="text"
              value={draft.deadline ?? ''}
              onChange={(e) => update('deadline', e.target.value || null)}
              className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-gray-900"
            />
          </Field>
          <Field label="Category">
            <select
              value={draft.category}
              onChange={(e) =>
                update('category', e.target.value as PitchCategory)
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
          <Field label="AI summary">
            <textarea
              rows={2}
              value={draft.ai_summary ?? ''}
              onChange={(e) => update('ai_summary', e.target.value || null)}
              className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-gray-900"
            />
          </Field>
          <Field label="Your notes">
            <textarea
              rows={3}
              value={draft.user_notes ?? ''}
              onChange={(e) => update('user_notes', e.target.value || null)}
              className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-gray-900"
              placeholder="Personal notes, follow-up reminders, negotiation context…"
            />
          </Field>

          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={onDelete}
              disabled={state === 'loading'}
              className="text-sm font-medium text-red-600 hover:text-red-800 disabled:opacity-50"
            >
              Delete pitch
            </button>
            <div className="flex items-center gap-3">
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button
                type="submit"
                disabled={state === 'loading'}
                className="rounded bg-black px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              >
                {state === 'loading' ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        </form>
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
