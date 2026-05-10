'use client'

import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Pitch, PipelineStage, PitchCategory } from '@/lib/types/pitch'
import { formatFullDate } from '@/lib/format'
import { formatCurrencyAmount } from '@/lib/pitch-stats'
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

const CATEGORY_LABEL: Record<PitchCategory, string> = {
  legit: 'Legit',
  gifting_only: 'Gifting only',
  low_quality: 'Low quality',
  spam_or_scam: 'Spam / scam',
  unclear: 'Unclear',
  not_a_pitch: 'Not a pitch',
}

// HARDCODED — design preview only; not stored data. Strip or replace once
// industry / channel / sender-email / source-subject / category sub-tag are
// captured for real (scope decision pending — see open-decisions / build-request).
const HARDCODED = {
  touchStatus: '1st touch',
  industry: 'Athleisure',
  channel: 'Email',
  senderEmail: 'tomas@northform.co',
  categorySubTag: 'Brand partnership · SS26',
  sourceSubject: 'SS26 launch — partnership ask',
  sourceFromEmail: 'tomas@northform.co',
}

type AsyncState = 'idle' | 'loading' | 'error'
type Mode = 'read' | 'edit'

export function PitchDetailModal({
  pitch,
  onClose,
}: {
  pitch: Pitch
  onClose: () => void
}) {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('read')
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

  async function persist(patch: Partial<Pitch>): Promise<boolean> {
    setState('loading')
    setError(null)
    const supabase = createClient()
    const { error: updateError } = await supabase
      .from('pitches')
      .update(patch)
      .eq('id', pitch.id)
    if (updateError) {
      setError(updateError.message)
      setState('error')
      return false
    }
    return true
  }

  async function onSave(e?: FormEvent) {
    e?.preventDefault()
    const ok = await persist({
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
    if (ok) {
      onClose()
      router.refresh()
    }
  }

  async function onAdvanceStage() {
    const next = nextStage(draft.pipeline_stage)
    if (!next) return
    const ok = await persist({
      pipeline_stage: next.value,
      user_notes: draft.user_notes,
    })
    if (ok) {
      onClose()
      router.refresh()
    }
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

  const next = nextStage(draft.pipeline_stage)

  return (
    <div className="pitch-modal-overlay" onClick={onClose}>
      <div className="pitch-modal" onClick={(e) => e.stopPropagation()}>
        <header className="pitch-modal-head">
          <span className="kicker">
            Pitch detail · {pitch.brand_name ?? 'Untitled'} · Received{' '}
            {formatFullDate(pitch.created_at)}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="pitch-modal-close"
            aria-label="Close"
          >
            Close <span className="x">×</span>
          </button>
        </header>

        {mode === 'read' ? (
          <ReadView pitch={pitch} draft={draft} setDraft={setDraft} />
        ) : (
          <EditView draft={draft} update={update} onSave={onSave} />
        )}

        <footer className="pitch-modal-foot">
          <button
            type="button"
            onClick={onDelete}
            disabled={state === 'loading'}
            className="pitch-modal-delete"
          >
            Delete pitch
          </button>
          <div className="pitch-modal-actions">
            {error && <p className="pitch-modal-error">{error}</p>}
            {mode === 'read' ? (
              <>
                <button
                  type="button"
                  onClick={() => setMode('edit')}
                  className="btn-outline"
                >
                  Edit details
                </button>
                {next && (
                  <button
                    type="button"
                    onClick={onAdvanceStage}
                    disabled={state === 'loading'}
                    className="btn-pill"
                  >
                    {state === 'loading' && <Spinner className="h-4 w-4" />}
                    Move to {next.label}{' '}
                    <span className="arrow">→</span>
                  </button>
                )}
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setDraft(pitch)
                    setMode('read')
                    setError(null)
                  }}
                  className="btn-outline"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => onSave()}
                  disabled={state === 'loading'}
                  className="btn-pill"
                >
                  {state === 'loading' && <Spinner className="h-4 w-4" />}
                  {state === 'loading' ? 'Saving…' : 'Save changes'}
                </button>
              </>
            )}
          </div>
        </footer>
      </div>
    </div>
  )
}

function ReadView({
  pitch,
  draft,
  setDraft,
}: {
  pitch: Pitch
  draft: Pitch
  setDraft: (p: Pitch) => void
}) {
  const deadlineParts = formatDeadline(pitch.deadline)
  const currentStage = draft.pipeline_stage

  return (
    <div className="pitch-read">
      <div className="pitch-hero">
        <h1 className="pitch-hero-h1">
          {(pitch.brand_name ?? 'Untitled pitch').toUpperCase()}
          <span className="pitch-hero-dot">.</span>
        </h1>
        {/* HARDCODED hero sub-line — commented out for smoke / launch.
            Restore when FR-3 (raw original view) and follow-up FRs for
            industry / channel land. Touch status is derivable from
            pitch_count and can come back independently.
        <p className="pitch-hero-sub">
          {HARDCODED.touchStatus} ·{' '}
          {HARDCODED.industry} ·{' '}
          Source: {HARDCODED.channel} · Captured {formatFullDate(pitch.created_at)}
        </p>
        */}
      </div>

      <div className="pitch-section">
        <span className="kicker">Pipeline stage</span>
        <div className="pitch-stage-row">
          {STAGES.map((s) => {
            const active = currentStage === s.value
            return (
              <span
                key={s.value}
                className={`pitch-stage-chip ${s.variant}${active ? ' active' : ''}`}
                aria-current={active ? 'true' : undefined}
              >
                <span className="dot" />
                {s.label}
              </span>
            )
          })}
        </div>
      </div>

      <div className="pitch-grid">
        <Cell label="Sender">
          <strong className="pitch-cell-name">{pitch.sender_name ?? '—'}</strong>
          {/* HARDCODED — sender email not extracted; restore when FR for
              email-extraction lands.
          <span className="muted">{HARDCODED.senderEmail}</span>
          */}
        </Cell>
        <Cell label="Budget">
          {pitch.budget_amount != null ? (
            <strong>
              {formatCurrencyAmount(
                pitch.budget_currency ?? '',
                pitch.budget_amount
              )}
              {pitch.budget_currency && <sup>{pitch.budget_currency}</sup>}
            </strong>
          ) : (
            <strong>—</strong>
          )}
          {pitch.budget_notes && (
            <span className="muted">+ {pitch.budget_notes}</span>
          )}
        </Cell>
        <Cell label="Deadline">
          <strong>{deadlineParts.display}</strong>
          {deadlineParts.relative && (
            <span className="muted">{deadlineParts.relative}</span>
          )}
        </Cell>
        <Cell label="Category">
          <strong className="pitch-cell-name">
            {CATEGORY_LABEL[pitch.category]}
          </strong>
          {/* HARDCODED — category sub-tag not in schema; restore when scope
              decision lands on whether/how to capture this.
          <span className="muted">{HARDCODED.categorySubTag}</span>
          */}
        </Cell>
      </div>

      {pitch.deliverables.length > 0 && (
        <div className="pitch-section">
          <span className="kicker">
            Deliverables · {pitch.deliverables.length}
          </span>
          <ol className="pitch-deliverables">
            {pitch.deliverables.map((d, i) => (
              <li key={i}>
                <span className="num">{String(i + 1).padStart(2, '0')}</span>
                <span>{d}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {pitch.ai_summary && (
        <div className="pitch-section">
          <span className="kicker">AI summary</span>
          <blockquote className="pitch-summary">{pitch.ai_summary}</blockquote>
        </div>
      )}

      <div className="pitch-section">
        <span className="kicker">Your notes</span>
        <textarea
          className="pitch-notes"
          value={draft.user_notes ?? ''}
          onChange={(e) => setDraft({ ...draft, user_notes: e.target.value })}
          placeholder="Personal notes, follow-up reminders, negotiation context…"
          rows={3}
        />
      </div>

      {/* HARDCODED source row — entire block commented out for smoke / launch.
          Subject + from-email require a scope decision (not in schema today).
          The "View original" button will be wired to raw_pitch_text under FR-3
          (raw original sub-view); restore the row then.
      <div className="pitch-source">
        <div className="pitch-source-meta">
          <span className="muted">Source</span>{' '}
          <strong>&ldquo;{HARDCODED.sourceSubject}&rdquo;</strong>{' '}
          <span className="muted">·</span>{' '}
          <span>from {HARDCODED.sourceFromEmail}</span>{' '}
          <span className="muted">·</span>{' '}
          <span>{formatFullDate(pitch.created_at)}</span>
        </div>
        <button type="button" className="pitch-source-link" disabled>
          View original <span className="arrow">↗</span>
        </button>
      </div>
      */}
    </div>
  )
}

function Cell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="pitch-cell">
      <span className="kicker">{label}</span>
      <div className="pitch-cell-body">{children}</div>
    </div>
  )
}

function EditView({
  draft,
  update,
  onSave,
}: {
  draft: Pitch
  update: <K extends keyof Pitch>(key: K, value: Pitch[K]) => void
  onSave: (e?: FormEvent) => void
}) {
  return (
    <form
      onSubmit={onSave}
      className="pitch-edit"
    >
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
              {CATEGORY_LABEL[c]}
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
    </form>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
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

function nextStage(
  current: PipelineStage
): { value: PipelineStage; label: string } | null {
  const idx = STAGES.findIndex((s) => s.value === current)
  if (idx === -1 || idx === STAGES.length - 1) return null
  const n = STAGES[idx + 1]
  return { value: n.value, label: n.label }
}

function formatDeadline(deadline: string | null): {
  display: string
  relative: string | null
} {
  if (!deadline) return { display: '—', relative: null }
  const d = new Date(deadline)
  if (isNaN(d.getTime())) return { display: deadline, relative: null }
  const display = formatFullDate(deadline)
  const diffMs = d.getTime() - Date.now()
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
  let relative: string | null
  if (diffDays > 0) {
    relative = `in ${diffDays} ${diffDays === 1 ? 'day' : 'days'}`
  } else if (diffDays === 0) {
    relative = 'today'
  } else {
    const past = Math.abs(diffDays)
    relative = `${past} ${past === 1 ? 'day' : 'days'} ago`
  }
  return { display, relative }
}
