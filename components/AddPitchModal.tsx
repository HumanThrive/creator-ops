'use client'

import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type {
  ExtractedPitch,
  PitchCategory,
  PitchDirection,
} from '@/lib/types/pitch'
import { Spinner } from './Spinner'

function friendlyExtractError(code: string | undefined): string {
  switch (code) {
    case 'unauthorized':
      return 'Your session expired. Please sign in again.'
    case 'pitch_too_long':
      return 'That pitch is too long. Trim it to under 5,000 characters and try again.'
    case 'rate_limit_exceeded':
      return "You've hit today's extraction limit. Try again tomorrow."
    case 'extraction_invalid_response':
    case 'extraction_parse_failed':
      return "Couldn't read the AI response. Try a different paste or rephrase."
    default:
      if (code?.startsWith('anthropic_')) {
        return 'AI service is having trouble. Please try again in a moment.'
      }
      return code ?? 'Extraction failed. Please try again.'
  }
}

const CATEGORIES: PitchCategory[] = [
  'legit',
  'gifting_only',
  'low_quality',
  'spam_or_scam',
  'unclear',
  'not_a_pitch',
]

const CATEGORY_LABEL: Record<PitchCategory, string> = {
  legit: 'Legit',
  gifting_only: 'Gifting only',
  low_quality: 'Low quality',
  spam_or_scam: 'Spam / scam',
  unclear: 'Unclear',
  not_a_pitch: 'Not a pitch',
}

const COPY = {
  inbound: {
    title: 'Pitch from brand',
    subtitle:
      "We'll extract brand, sender, budget, deliverables, and deadline. Review, edit anything that's wrong, then save.",
    placeholder:
      'Paste the brand pitch here — email, IG DM, TikTok DM, WhatsApp, anywhere it landed…',
    flowKicker: 'Inbound · Brand → You',
    saveButton: 'Save inbound pitch',
    helperEmpty:
      "Paste a message above and we'll auto-extract structured fields.",
    budgetLabel: 'Budget offered',
    deliverablesLabel: 'Deliverables wanted',
  },
  outbound: {
    title: 'Pitch to brand',
    subtitle:
      "We'll extract the target brand, your proposed deliverables, and price. Review, edit anything that's wrong, then save.",
    placeholder:
      'Paste your outbound pitch — the message you sent to the brand (or are about to send)…',
    flowKicker: 'Outbound · You → Brand',
    saveButton: 'Save outbound pitch',
    helperEmpty:
      "Paste a message above and we'll auto-extract structured fields.",
    budgetLabel: 'Your proposed price',
    deliverablesLabel: "Deliverables you'd offer",
  },
} as const

type AsyncState = 'idle' | 'loading' | 'error'

interface AddPitchModalProps {
  direction?: PitchDirection
  onClose: () => void
}

export function AddPitchModal({
  direction: initialDirection = 'inbound',
  onClose,
}: AddPitchModalProps) {
  const router = useRouter()
  const [direction, setDirection] = useState<PitchDirection>(initialDirection)
  const [state, setState] = useState<AsyncState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [pitchText, setPitchText] = useState('')
  const [extracted, setExtracted] = useState<ExtractedPitch | null>(null)
  const [extractDurationMs, setExtractDurationMs] = useState<number | null>(null)
  const [userNotes, setUserNotes] = useState('')
  // Local raw string for the deliverables `;`-separated input. Pairing this
  // with `extracted.deliverables` (parsed array) lets the user type spaces
  // and partial separators naturally — a controlled input derived from
  // `array.join('; ')` would strip trailing whitespace + collapse in-progress
  // delimiters on every keystroke, making the field unusable.
  const [deliverablesInput, setDeliverablesInput] = useState('')

  const copy = COPY[direction]

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  async function onExtract() {
    if (!pitchText.trim()) return
    setState('loading')
    setError(null)
    const start = performance.now()
    try {
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pitch_text: pitchText, direction }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(friendlyExtractError(json.error))
      }
      setExtractDurationMs(performance.now() - start)
      const data = json.data as ExtractedPitch
      setExtracted(data)
      setDeliverablesInput(data.deliverables.join('; '))
      setState('idle')
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Network error. Check your connection and try again.'
      )
      setState('error')
    }
  }

  async function onSave(e?: FormEvent) {
    e?.preventDefault()
    if (!extracted) return
    setState('loading')
    setError(null)

    const supabase = createClient()
    // Direction invariants enforced at save-time regardless of toggle state:
    // outbound → sender_name=null, category='legit'. Underlying extracted state
    // is preserved so toggling back to inbound recovers values.
    const senderName =
      direction === 'outbound' ? null : extracted.sender_name
    const category: PitchCategory =
      direction === 'outbound' ? 'legit' : extracted.category

    const { data: pitchData, error: rpcError } = await supabase.rpc(
      'save_pitch_with_activity',
      {
        p_raw_pitch_text: pitchText,
        p_direction: direction,
        p_brand_name: extracted.brand_name,
        p_sender_name: senderName,
        p_deliverables: extracted.deliverables,
        p_budget_amount: extracted.budget.amount,
        p_budget_currency: extracted.budget.currency,
        p_budget_notes: extracted.budget.notes,
        p_deadline: extracted.deadline,
        p_category: category,
        p_ai_summary: extracted.summary,
      }
    )

    if (rpcError) {
      setError(rpcError.message)
      setState('error')
      return
    }

    const pitchResult = pitchData as { pitch_id: string } | null

    // S2 auto-create deal — skip-list per AC2.1
    const shouldAutoCreateDeal =
      direction === 'outbound' ||
      (category !== 'spam_or_scam' && category !== 'not_a_pitch')

    if (shouldAutoCreateDeal && pitchResult?.pitch_id) {
      const { error: dealError } = await supabase.rpc(
        'create_deal_with_activity',
        {
          p_pitch_id: pitchResult.pitch_id,
          p_stage: 'inbox',
          p_current_budget_amount: extracted.budget.amount,
          p_current_budget_currency: extracted.budget.currency,
          p_current_deliverables: extracted.deliverables,
          p_current_scope_notes: null,
        }
      )
      if (dealError) {
        console.error(
          '[AddPitchModal] deal auto-create failed:',
          dealError.message
        )
      }
    }

    // Optional notes — save_pitch_with_activity RPC doesn't accept p_user_notes
    // in its current signature. Chain update_pitch_with_activity if user typed
    // notes. Creates an extra pitch_updated activity row (accurate audit: notes
    // were added at create-time as a separate action). Future iteration: extend
    // the save RPC to accept user_notes directly and drop this chain.
    const trimmedNotes = userNotes.trim()
    if (trimmedNotes && pitchResult?.pitch_id) {
      const { error: notesError } = await supabase.rpc(
        'update_pitch_with_activity',
        {
          p_pitch_id: pitchResult.pitch_id,
          p_brand_name: extracted.brand_name,
          p_sender_name: senderName,
          p_deliverables: extracted.deliverables,
          p_budget_amount: extracted.budget.amount,
          p_budget_currency: extracted.budget.currency,
          p_budget_notes: extracted.budget.notes,
          p_deadline: extracted.deadline,
          p_category: category,
          p_ai_summary: extracted.summary,
          p_user_notes: trimmedNotes,
          p_field_diffs: { user_notes: [null, trimmedNotes] },
        }
      )
      if (notesError) {
        console.error(
          '[AddPitchModal] notes save failed:',
          notesError.message
        )
      }
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

  const hasExtracted = extracted !== null
  const hasPitchText = pitchText.trim().length > 0
  const canSave = hasExtracted && state !== 'loading'

  // Count of non-empty fields for the status bar metric ("N fields filled")
  const filledCount = extracted
    ? [
        extracted.brand_name,
        direction === 'inbound' ? extracted.sender_name : undefined,
        extracted.deliverables.length > 0 ? 'x' : null,
        extracted.budget.amount,
        extracted.deadline,
        direction === 'inbound' ? extracted.category : undefined,
      ].filter((v) => v !== null && v !== undefined && v !== '').length
    : 0

  return (
    <div className="pitch-modal-overlay" onClick={onClose}>
      <div className="add-modal" onClick={(e) => e.stopPropagation()}>
        <header className="add-modal-head">
          <div className="add-modal-head-l">
            <span className="add-modal-kicker">
              <span className="add-modal-kicker-dot" />
              Add pitch
            </span>
            <div className="add-modal-direction-pill" role="tablist">
              <button
                type="button"
                role="tab"
                onClick={() => setDirection('inbound')}
                className={
                  'add-modal-direction-btn' +
                  (direction === 'inbound' ? ' active' : '')
                }
                aria-pressed={direction === 'inbound'}
              >
                <span aria-hidden="true">↘</span> Inbound
              </button>
              <button
                type="button"
                role="tab"
                onClick={() => setDirection('outbound')}
                className={
                  'add-modal-direction-btn' +
                  (direction === 'outbound' ? ' active' : '')
                }
                aria-pressed={direction === 'outbound'}
              >
                <span aria-hidden="true">↗</span> Outbound
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="pitch-modal-close"
            aria-label="Close"
          >
            Close <span className="x">×</span>
          </button>
        </header>

        <div className="add-modal-body">
          <div className="add-modal-hero">
            <h1 className="add-modal-title">
              {copy.title.toUpperCase()}
              <span className="add-modal-title-dot">.</span>
            </h1>
            <p className="add-modal-subtitle">{copy.subtitle}</p>
          </div>

          <div className="add-modal-section">
            <span className="add-modal-section-kicker">
              <span className="add-modal-kicker-dot" />
              Paste the message
            </span>
            <textarea
              className="add-modal-textarea"
              value={pitchText}
              onChange={(e) => setPitchText(e.target.value)}
              rows={6}
              placeholder={copy.placeholder}
              disabled={state === 'loading'}
              autoFocus={!hasExtracted}
            />
          </div>

          {/* Status bar between textarea and fields */}
          <StatusBar
            state={state}
            error={error}
            hasPitchText={hasPitchText}
            hasExtracted={hasExtracted}
            extractDurationMs={extractDurationMs}
            filledCount={filledCount}
            helperEmpty={copy.helperEmpty}
            onExtract={onExtract}
          />

          {/* Field grid — appears below the status bar once extracted */}
          {hasExtracted && extracted && (
            <form onSubmit={onSave} className="add-modal-fields">
              <Field label="Brand">
                <input
                  type="text"
                  className="add-modal-field-input"
                  value={extracted.brand_name ?? ''}
                  onChange={(e) =>
                    updateField('brand_name', e.target.value || null)
                  }
                />
              </Field>

              {direction === 'inbound' && (
                <Field label="Sender">
                  <input
                    type="text"
                    className="add-modal-field-input"
                    value={extracted.sender_name ?? ''}
                    onChange={(e) =>
                      updateField('sender_name', e.target.value || null)
                    }
                  />
                </Field>
              )}

              <Field label={copy.budgetLabel}>
                <div className="add-modal-field-budget-row">
                  <input
                    type="number"
                    step="0.01"
                    className="add-modal-field-input add-modal-field-budget-amount"
                    value={extracted.budget.amount ?? ''}
                    onChange={(e) =>
                      updateBudget(
                        'amount',
                        e.target.value === ''
                          ? null
                          : Number(e.target.value)
                      )
                    }
                    placeholder="Amount"
                  />
                  <input
                    type="text"
                    className="add-modal-field-input add-modal-field-budget-currency"
                    value={extracted.budget.currency ?? ''}
                    onChange={(e) =>
                      updateBudget('currency', e.target.value || null)
                    }
                    placeholder="USD"
                  />
                </div>
              </Field>

              <Field label="Deadline">
                <input
                  type="text"
                  className="add-modal-field-input"
                  value={extracted.deadline ?? ''}
                  onChange={(e) =>
                    updateField('deadline', e.target.value || null)
                  }
                />
              </Field>

              <Field label={copy.deliverablesLabel} fullWidth>
                <input
                  type="text"
                  className="add-modal-field-input"
                  value={deliverablesInput}
                  onChange={(e) => {
                    setDeliverablesInput(e.target.value)
                    updateField(
                      'deliverables',
                      e.target.value
                        .split(';')
                        .map((s) => s.trim())
                        .filter(Boolean)
                    )
                  }}
                />
              </Field>

              {direction === 'inbound' && (
                <Field label="Category">
                  <select
                    className="add-modal-field-input"
                    value={extracted.category}
                    onChange={(e) =>
                      updateField('category', e.target.value as PitchCategory)
                    }
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {CATEGORY_LABEL[c]}
                      </option>
                    ))}
                  </select>
                </Field>
              )}

              <Field label="Notes (optional)">
                <input
                  type="text"
                  className="add-modal-field-input"
                  value={userNotes}
                  onChange={(e) => setUserNotes(e.target.value)}
                  placeholder="Personal context…"
                />
              </Field>
            </form>
          )}
        </div>

        <footer className="add-modal-foot">
          <span className="add-modal-flow-kicker">{copy.flowKicker}</span>
          <div className="add-modal-actions">
            <button
              type="button"
              onClick={onClose}
              className="add-modal-cancel"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onSave()}
              disabled={!canSave}
              className="btn-pill add-modal-save"
            >
              <span className="add-modal-kicker-dot" />
              {state === 'loading' && hasExtracted && (
                <Spinner className="h-4 w-4" />
              )}
              {state === 'loading' && hasExtracted
                ? 'Saving…'
                : copy.saveButton}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}

interface StatusBarProps {
  state: AsyncState
  error: string | null
  hasPitchText: boolean
  hasExtracted: boolean
  extractDurationMs: number | null
  filledCount: number
  helperEmpty: string
  onExtract: () => void
}

function StatusBar({
  state,
  error,
  hasPitchText,
  hasExtracted,
  extractDurationMs,
  filledCount,
  helperEmpty,
  onExtract,
}: StatusBarProps) {
  // Loading state — extraction in flight
  if (state === 'loading' && !hasExtracted) {
    return (
      <div className="add-modal-status add-modal-status-loading">
        <span className="add-modal-status-l">
          <Spinner className="h-3 w-3 inline-block mr-2 align-middle" />
          Extracting structured fields…
        </span>
      </div>
    )
  }

  // Error state
  if (state === 'error' && error && !hasExtracted) {
    return (
      <div className="add-modal-status add-modal-status-error">
        <span className="add-modal-status-l">{error}</span>
        {hasPitchText && (
          <button
            type="button"
            className="add-modal-status-action"
            onClick={onExtract}
          >
            Retry →
          </button>
        )}
      </div>
    )
  }

  // Success state — extracted
  if (hasExtracted) {
    const seconds =
      extractDurationMs !== null ? (extractDurationMs / 1000).toFixed(1) : '?'
    return (
      <div className="add-modal-status add-modal-status-success">
        <span className="add-modal-status-l">
          <strong>Extracted in {seconds}s</strong>{' '}
          <span className="muted">· review fields below · save when ready</span>
        </span>
        <span className="add-modal-status-r">
          {filledCount} {filledCount === 1 ? 'field' : 'fields'} filled
        </span>
      </div>
    )
  }

  // Empty state — has text but not extracted yet
  if (hasPitchText) {
    return (
      <div className="add-modal-status">
        <span className="add-modal-status-l">Ready to extract.</span>
        <button
          type="button"
          className="add-modal-status-action"
          onClick={onExtract}
        >
          Extract →
        </button>
      </div>
    )
  }

  // Initial empty state
  return (
    <div className="add-modal-status">
      <span className="add-modal-status-l muted">{helperEmpty}</span>
    </div>
  )
}

interface FieldProps {
  label: string
  children: ReactNode
  fullWidth?: boolean
}

function Field({ label, children, fullWidth = false }: FieldProps) {
  return (
    <label
      className={
        'add-modal-field' + (fullWidth ? ' add-modal-field-full' : '')
      }
    >
      <span className="add-modal-field-kicker">
        <span className="add-modal-kicker-dot" />
        {label}
      </span>
      {children}
    </label>
  )
}
