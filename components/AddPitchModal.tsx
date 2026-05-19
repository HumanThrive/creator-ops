'use client'

import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type {
  ExtractedPitch,
  PitchDirection,
  PitchSourceChannel,
} from '@/lib/types/pitch'
import { PITCH_SOURCE_CHANNELS } from '@/lib/types/pitch'
import { formatSourceChannel } from '@/lib/format'
import { ChipSelector, type ChipSelectorOption } from './ChipSelector'
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
    case 'tag_list_unavailable':
      return 'Tag list temporarily unavailable. Try again in a moment.'
    default:
      if (code?.startsWith('anthropic_')) {
        return 'AI service is having trouble. Please try again in a moment.'
      }
      return code ?? 'Extraction failed. Please try again.'
  }
}

// CR-2 tag axes — mirrors `tags WHERE scope='pitch'` seed from Migration 1.
// Display labels match `docs/design/.../screens.jsx` LEGIT_OPTIONS / COMP_OPTIONS.
const LEGITIMACY_OPTIONS: ChipSelectorOption[] = [
  { id: 'valid', label: 'Valid' },
  { id: 'low_quality', label: 'Low quality' },
  { id: 'spam_or_scam', label: 'Spam / Scam' },
  { id: 'unclear', label: 'Unclear' },
  { id: 'not_a_pitch', label: 'Not a pitch' },
]
const COMPENSATION_OPTIONS: ChipSelectorOption[] = [
  { id: 'cash', label: 'Cash' },
  { id: 'gifting', label: 'Gifting' },
  { id: 'collaboration', label: 'Collab' },
  { id: 'unspecified', label: 'Unspecified' },
]
const LEGITIMACY_SLUGS = new Set(LEGITIMACY_OPTIONS.map((o) => o.id))
const COMPENSATION_SLUGS = new Set(COMPENSATION_OPTIONS.map((o) => o.id))

function splitTagsByAxis(tags: string[]): {
  legitimacy: string | null
  compensation: string[]
} {
  let legitimacy: string | null = null
  const compensation: string[] = []
  for (const t of tags) {
    if (LEGITIMACY_SLUGS.has(t)) legitimacy = t
    else if (COMPENSATION_SLUGS.has(t)) compensation.push(t)
  }
  return { legitimacy, compensation }
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
  const [deliverablesInput, setDeliverablesInput] = useState('')
  // CR-2 tag state — pre-extract: null/empty. Post-extract: populated from
  // extracted.tags via splitTagsByAxis. User-editable via ChipSelectors.
  // Compensation state is PRESERVED across legitimacy flips per AC4.5.
  const [legitimacy, setLegitimacy] = useState<string | null>(null)
  const [compensation, setCompensation] = useState<string[]>([])

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
      setDeliverablesInput(data.deliverables.join(', '))
      const aiTags = Array.isArray(data.tags) ? data.tags : []
      const { legitimacy: legAi, compensation: compAi } = splitTagsByAxis(aiTags)
      setLegitimacy(legAi)
      setCompensation(compAi)
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
    // outbound → sender_name=null. Underlying extracted sender_name preserved
    // so toggling back to inbound recovers values.
    const senderName =
      direction === 'outbound' ? null : extracted.sender_name

    // Compose tag-set per CR-2 AC1.4 + AC1.6:
    //   - Outbound: legitimacy is server-side always 'valid' (per AC1.4);
    //     prepend 'valid' client-side as the defense-in-depth save guard.
    //   - Inbound: legitimacy is whatever user/AI picked. Compensation tags
    //     are saved ONLY when legitimacy === 'valid' (per AC1.6 axis rule:
    //     compensation tags only meaningful for real partnership offers).
    let tagSlugs: string[]
    if (direction === 'outbound') {
      tagSlugs = ['valid', ...compensation]
    } else {
      const legit = legitimacy ?? 'unclear'
      tagSlugs = legit === 'valid' ? [legit, ...compensation] : [legit]
    }

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
        p_tag_slugs: tagSlugs,
        p_ai_summary: extracted.summary,
        p_industry: extracted.industry,
        p_sender_email: extracted.sender_email,
        p_source_channel: extracted.source_channel,
        p_source_subject: extracted.source_subject,
      }
    )

    if (rpcError) {
      setError(rpcError.message)
      setState('error')
      return
    }

    const pitchResult = pitchData as { pitch_id: string } | null

    // Auto-deal-create skip-list is now folded into save_pitch_with_activity
    // RPC per AC4.3 — no separate create_deal_with_activity call needed.

    // Optional notes — chain update_pitch_with_activity with the same tag set.
    // Creates an extra pitch_updated activity row (accurate audit: notes added
    // at create-time as a separate action). Future iteration: extend save RPC
    // to accept user_notes directly and drop this chain.
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
          p_tag_slugs: tagSlugs,
          p_ai_summary: extracted.summary,
          p_user_notes: trimmedNotes,
          p_field_diffs: { user_notes: [null, trimmedNotes] },
          p_industry: extracted.industry,
          p_sender_email: extracted.sender_email,
          p_source_channel: extracted.source_channel,
          p_source_subject: extracted.source_subject,
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

  // Status bar metric — "N fields filled". Includes a "tags" slot for inbound
  // (legitimacy chosen) but not for outbound (legitimacy server-injected).
  const filledCount = extracted
    ? [
        extracted.brand_name,
        direction === 'inbound' ? extracted.sender_name : undefined,
        extracted.deliverables.length > 0 ? 'x' : null,
        extracted.budget.amount,
        extracted.deadline,
        direction === 'inbound' ? (legitimacy ? 'x' : null) : undefined,
      ].filter((v) => v !== null && v !== undefined && v !== '').length
    : 0

  // Compensation is visually disabled when legitimacy is set to a non-valid
  // value (inbound only). Selection state preserved per AC4.5.
  const compensationDisabled =
    direction === 'inbound' && legitimacy !== null && legitimacy !== 'valid'

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
              className={
                'add-modal-textarea' + (hasExtracted ? ' is-extracted' : '')
              }
              value={pitchText}
              onChange={(e) => setPitchText(e.target.value)}
              rows={6}
              placeholder={copy.placeholder}
              disabled={state === 'loading'}
              autoFocus={!hasExtracted}
            />
          </div>

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

              <Field label="Industry">
                <input
                  type="text"
                  className="add-modal-field-input"
                  value={extracted.industry ?? ''}
                  onChange={(e) =>
                    updateField('industry', e.target.value || null)
                  }
                  placeholder="e.g. Cookware, Beauty, SaaS"
                />
              </Field>

              <Field label="Sender email">
                <input
                  type="email"
                  className="add-modal-field-input"
                  value={extracted.sender_email ?? ''}
                  onChange={(e) =>
                    updateField('sender_email', e.target.value || null)
                  }
                  placeholder="priya@brand.co"
                />
              </Field>

              <Field label="Source channel">
                <select
                  className="add-modal-field-input"
                  value={extracted.source_channel ?? ''}
                  onChange={(e) => {
                    const v = e.target.value
                    const next: PitchSourceChannel | null =
                      v && (PITCH_SOURCE_CHANNELS as readonly string[]).includes(v)
                        ? (v as PitchSourceChannel)
                        : null
                    updateField('source_channel', next)
                  }}
                >
                  <option value="">— None —</option>
                  {PITCH_SOURCE_CHANNELS.map((c) => (
                    <option key={c} value={c}>
                      {formatSourceChannel(c)}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Source subject" fullWidth>
                <input
                  type="text"
                  className="add-modal-field-input"
                  value={extracted.source_subject ?? ''}
                  onChange={(e) =>
                    updateField('source_subject', e.target.value || null)
                  }
                  placeholder="Email subject line (if any)"
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
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean)
                    )
                  }}
                />
              </Field>

              {/* CR-2 chip-selector slot — replaces the prior `Category` <select>.
                  Renders inside the same fields grid as a full-width row.
                  Outbound hides the legitimacy ChipSelector entirely per AC1.4. */}
              <div className="add-modal-field is-chips">
                <span className="add-modal-field-kicker">
                  <span className="add-modal-kicker-dot" />
                  Tags · multi-axis
                </span>
                {direction === 'inbound' && (
                  <ChipSelector
                    axis="Legitimacy"
                    kind="radio"
                    options={LEGITIMACY_OPTIONS}
                    value={legitimacy}
                    onChange={setLegitimacy}
                  />
                )}
                <ChipSelector
                  axis="Compensation"
                  kind="checkbox"
                  options={COMPENSATION_OPTIONS}
                  value={compensation}
                  onChange={setCompensation}
                  disabled={compensationDisabled}
                />
              </div>

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
