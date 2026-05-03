'use client'

import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Pitch, PipelineStage, PitchCategory } from '@/lib/types/pitch'
import { Spinner } from './Spinner'

const CATEGORIES: PitchCategory[] = [
  'legit',
  'gifting_only',
  'low_quality',
  'spam_or_scam',
  'unclear',
  'not_a_pitch',
]

const STAGES: { value: PipelineStage; label: string; variant: string }[] = [
  { value: 'inbox', label: 'Inbox', variant: 'inbox' },
  { value: 'negotiating', label: 'Negotiating', variant: 'negotiating' },
  { value: 'confirmed', label: 'Confirmed', variant: 'confirmed' },
  { value: 'delivered_paid', label: 'Delivered & paid', variant: 'delivered' },
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
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-2 sm:p-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-md border border-ink bg-paper p-7 text-ink"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="mb-6 flex items-center justify-between">
          <span className="kicker">Edit pitch</span>
          <button
            type="button"
            onClick={onClose}
            className="topbar-signout"
            aria-label="Close"
          >
            Close ✕
          </button>
        </header>

        <form onSubmit={onSave} className="space-y-5 text-sm">
          <Field label="Pipeline stage">
            <div className="flex flex-wrap gap-2 pt-1">
              {STAGES.map((s) => {
                const active = draft.pipeline_stage === s.value
                return (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => update('pipeline_stage', s.value)}
                    className={`stage ${s.variant} cursor-pointer transition-opacity ${active ? '' : 'opacity-40 hover:opacity-70'}`}
                    aria-pressed={active}
                  >
                    {s.label}
                  </button>
                )
              })}
            </div>
          </Field>
          <Field label="Brand">
            <TextInput
              value={draft.brand_name ?? ''}
              onChange={(v) => update('brand_name', v || null)}
            />
          </Field>
          <Field label="Sender">
            <TextInput
              value={draft.sender_name ?? ''}
              onChange={(v) => update('sender_name', v || null)}
            />
          </Field>
          <Field label="Deliverables (comma-separated)">
            <TextInput
              value={draft.deliverables.join(', ')}
              onChange={(v) =>
                update(
                  'deliverables',
                  v
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean)
                )
              }
            />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
                className="signin-input w-full"
              />
            </Field>
            <Field label="Currency">
              <TextInput
                value={draft.budget_currency ?? ''}
                onChange={(v) => update('budget_currency', v || null)}
              />
            </Field>
            <Field label="Budget notes">
              <TextInput
                value={draft.budget_notes ?? ''}
                onChange={(v) => update('budget_notes', v || null)}
              />
            </Field>
          </div>
          <Field label="Deadline">
            <TextInput
              value={draft.deadline ?? ''}
              onChange={(v) => update('deadline', v || null)}
            />
          </Field>
          <Field label="Category">
            <select
              value={draft.category}
              onChange={(e) =>
                update('category', e.target.value as PitchCategory)
              }
              className="signin-input w-full"
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
              className="signin-input w-full"
            />
          </Field>
          <Field label="Your notes">
            <textarea
              rows={3}
              value={draft.user_notes ?? ''}
              onChange={(e) => update('user_notes', e.target.value || null)}
              className="signin-input w-full"
              placeholder="Personal notes, follow-up reminders, negotiation context…"
            />
          </Field>

          <div className="flex items-center justify-between pt-3">
            <button
              type="button"
              onClick={onDelete}
              disabled={state === 'loading'}
              className="font-mono text-xs uppercase tracking-wider text-accent hover:opacity-70 disabled:opacity-50"
            >
              Delete pitch
            </button>
            <div className="flex items-center gap-3">
              {error && <p className="font-mono text-xs text-accent">{error}</p>}
              <button
                type="submit"
                disabled={state === 'loading'}
                className="btn-pill disabled:opacity-50"
              >
                {state === 'loading' && <Spinner className="h-4 w-4" />}
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
      <span className="signin-label mb-2">{label}</span>
      {children}
    </label>
  )
}

function TextInput({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="signin-input w-full"
    />
  )
}
