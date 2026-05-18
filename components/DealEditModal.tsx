'use client'

import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Deal, DealStage } from '@/lib/types/deal'
import type { PitchDirection } from '@/lib/types/pitch'
import { getStageLabel } from '@/lib/stage-labels'
import { Spinner } from './Spinner'

const STAGES: DealStage[] = [
  'inbox',
  'negotiating',
  'confirmed',
  'delivered',
  'rejected',
]

type AsyncState = 'idle' | 'loading' | 'error'

interface DealEditModalProps {
  /** For `mode="edit"`: the deal being edited. For `mode="create"`: a draft
   *  Deal seeded with pre-populated defaults (id/user_id/timestamps may be
   *  empty strings — they're set by the create RPC). */
  deal: Deal
  /** `"edit"` (default) writes diffs via update/change-stage RPCs.
   *  `"create"` writes a new deal via `create_deal_with_activity` using
   *  `deal.pitch_id` as the parent. */
  mode?: 'edit' | 'create'
  /** CR-4 Q3 Lock — parent pitch's direction drives the first-stage button
   *  label ('Inbox' for inbound, 'Sent' for outbound). Optional default
   *  preserves pre-CR-4 visual canon when direction isn't in scope. */
  direction?: PitchDirection
  onClose: () => void
  onSaved?: () => void
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  return a.every((v, i) => v === b[i])
}

function parseDeliverables(text: string): string[] {
  return text
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export function DealEditModal({
  deal,
  mode = 'edit',
  direction = 'inbound',
  onClose,
  onSaved,
}: DealEditModalProps) {
  const [draft, setDraft] = useState<Deal>(deal)
  // Local raw input for the deliverables text field. Without it, a controlled
  // input derived from `current_deliverables.join(', ')` strips any trailing
  // space + collapses any in-progress comma, making the field unusable for
  // typing (you can't add ', ' between two items because the value re-derives
  // on every keystroke). The string lives here; the parsed array lives on
  // draft.current_deliverables; both stay in sync via the onChange handler.
  const [deliverablesInput, setDeliverablesInput] = useState(
    deal.current_deliverables.join(', ')
  )
  const [state, setState] = useState<AsyncState>('idle')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  function update<K extends keyof Deal>(key: K, value: Deal[K]) {
    setDraft({ ...draft, [key]: value })
  }

  function validate(): string | null {
    // At least one substantive field — otherwise the deal carries no
    // information beyond stage and is just noise on the board.
    const hasBudget =
      draft.current_budget_amount !== null &&
      draft.current_budget_amount !== undefined
    const hasDeliverables = draft.current_deliverables.length > 0
    const hasScopeNotes =
      draft.current_scope_notes !== null &&
      draft.current_scope_notes.trim().length > 0
    if (!hasBudget && !hasDeliverables && !hasScopeNotes) {
      return 'Add at least a budget, a deliverable, or a scope note before saving.'
    }
    // Budget amount and currency must be set together — a number with no
    // currency unit is meaningless on the board / stats strip.
    if (hasBudget && !draft.current_budget_currency) {
      return 'Currency is required when budget amount is set.'
    }
    if (
      !hasBudget &&
      draft.current_budget_currency &&
      draft.current_budget_currency.trim().length > 0
    ) {
      return 'Budget amount is required when currency is set.'
    }
    return null
  }

  async function onSave(e?: FormEvent) {
    e?.preventDefault()
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }
    setState('loading')
    setError(null)
    const supabase = createClient()

    // Create mode: single `create_deal_with_activity` RPC with the draft
    // values. No diff math; the RPC emits a `deal_attached` activity row.
    if (mode === 'create') {
      const { error: rpcError } = await supabase.rpc(
        'create_deal_with_activity',
        {
          p_pitch_id: draft.pitch_id,
          p_stage: draft.stage,
          p_current_budget_amount: draft.current_budget_amount,
          p_current_budget_currency: draft.current_budget_currency,
          p_current_deliverables: draft.current_deliverables,
          p_current_scope_notes: draft.current_scope_notes,
        }
      )
      if (rpcError) {
        setError(rpcError.message)
        setState('error')
        return
      }
      if (onSaved) onSaved()
      onClose()
      return
    }

    // Compute stage change and non-stage diff. Per spec AC4.2 mixed save
    // (stage + non-stage) emits TWO activity rows — one per RPC call.
    const stageChanged = deal.stage !== draft.stage
    const nonStageDiffs: Record<string, [unknown, unknown]> = {}
    if (deal.current_budget_amount !== draft.current_budget_amount) {
      nonStageDiffs.current_budget_amount = [
        deal.current_budget_amount,
        draft.current_budget_amount,
      ]
    }
    if (deal.current_budget_currency !== draft.current_budget_currency) {
      nonStageDiffs.current_budget_currency = [
        deal.current_budget_currency,
        draft.current_budget_currency,
      ]
    }
    if (
      !arraysEqual(deal.current_deliverables, draft.current_deliverables)
    ) {
      nonStageDiffs.current_deliverables = [
        deal.current_deliverables,
        draft.current_deliverables,
      ]
    }
    if (deal.current_scope_notes !== draft.current_scope_notes) {
      nonStageDiffs.current_scope_notes = [
        deal.current_scope_notes,
        draft.current_scope_notes,
      ]
    }
    const hasNonStageDiff = Object.keys(nonStageDiffs).length > 0

    if (!stageChanged && !hasNonStageDiff) {
      onClose()
      return
    }

    // Non-stage fields first (more data); then stage transition. If call 2
    // fails after call 1 succeeded the deal is consistent but the activity
    // log lacks the stage_change row — user retries the stage edit; safe
    // because UPDATE deals is idempotent on field values.
    if (hasNonStageDiff) {
      const { error: rpcError } = await supabase.rpc(
        'update_deal_with_activity',
        {
          p_deal_id: deal.id,
          p_current_budget_amount: draft.current_budget_amount,
          p_current_budget_currency: draft.current_budget_currency,
          p_current_deliverables: draft.current_deliverables,
          p_current_scope_notes: draft.current_scope_notes,
          p_field_diffs: nonStageDiffs,
        }
      )
      if (rpcError) {
        setError(rpcError.message)
        setState('error')
        return
      }
    }

    if (stageChanged) {
      const { error: rpcError } = await supabase.rpc(
        'change_deal_stage_with_activity',
        {
          p_deal_id: deal.id,
          p_from_stage: deal.stage,
          p_to_stage: draft.stage,
        }
      )
      if (rpcError) {
        setError(rpcError.message)
        setState('error')
        return
      }
    }

    if (onSaved) onSaved()
    onClose()
  }

  return (
    <div className="pitch-modal-overlay" onClick={onClose}>
      <div className="pitch-modal" onClick={(e) => e.stopPropagation()}>
        <header className="pitch-modal-head">
          <span className="kicker">
            {mode === 'create' ? 'Start tracking deal' : 'Edit deal'}
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

        <form onSubmit={onSave} className="pitch-edit">
          <Field label="Stage">
            <div className="flex flex-wrap gap-2 pt-1">
              {STAGES.map((stage) => {
                const active = draft.stage === stage
                return (
                  <button
                    key={stage}
                    type="button"
                    onClick={() => update('stage', stage)}
                    className={`stage ${stage} cursor-pointer transition-opacity ${active ? '' : 'opacity-40 hover:opacity-70'}`}
                    aria-pressed={active}
                  >
                    {getStageLabel(stage, direction)}
                  </button>
                )
              })}
            </div>
          </Field>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Current budget amount">
              <input
                type="number"
                step="0.01"
                value={draft.current_budget_amount ?? ''}
                onChange={(e) =>
                  update(
                    'current_budget_amount',
                    e.target.value === '' ? null : Number(e.target.value)
                  )
                }
                className="signin-input w-full"
              />
            </Field>
            <Field label="Currency">
              <input
                type="text"
                value={draft.current_budget_currency ?? ''}
                onChange={(e) =>
                  update('current_budget_currency', e.target.value || null)
                }
                className="signin-input w-full"
              />
            </Field>
          </div>

          <Field label="Deliverables (comma-separated)">
            <input
              type="text"
              value={deliverablesInput}
              onChange={(e) => {
                setDeliverablesInput(e.target.value)
                update('current_deliverables', parseDeliverables(e.target.value))
              }}
              className="signin-input w-full"
            />
          </Field>

          <Field label="Scope notes">
            <textarea
              rows={3}
              value={draft.current_scope_notes ?? ''}
              onChange={(e) =>
                update('current_scope_notes', e.target.value || null)
              }
              className="signin-input w-full"
              placeholder="Negotiation context, agreed terms, follow-ups…"
            />
          </Field>
        </form>

        <footer className="pitch-modal-foot">
          <div />
          <div className="pitch-modal-actions">
            {error && <p className="pitch-modal-error">{error}</p>}
            <button
              type="button"
              onClick={onClose}
              className="btn-outline"
              disabled={state === 'loading'}
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
              {state === 'loading'
                ? 'Saving…'
                : mode === 'create'
                  ? 'Start tracking'
                  : 'Save changes'}
            </button>
          </div>
        </footer>
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
