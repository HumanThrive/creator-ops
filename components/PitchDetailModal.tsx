'use client'

import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Pitch } from '@/lib/types/pitch'
import type { Deal, DealStage } from '@/lib/types/deal'
import type { Activity } from '@/lib/types/activity'
import { formatFullDate } from '@/lib/format'
import { formatCurrencyAmount } from '@/lib/pitch-stats'
import { formatActivityEvent } from '@/lib/activity-format'
import { useEntityTags, type Tag } from '@/lib/hooks/useEntityTags'
import { Spinner } from './Spinner'
import { StageChip } from './StageChip'
import { DealEditModal } from './DealEditModal'
import { ChipSelector, type ChipSelectorOption } from './ChipSelector'
import { TagBadges } from './TagBadges'

// CR-2 — mirrors `tags WHERE scope='pitch'` seed (Migration 1, 2026-05-17).
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

function splitTagsByAxis(tags: Tag[]): {
  legitimacy: string | null
  compensation: string[]
} {
  let legitimacy: string | null = null
  const compensation: string[] = []
  for (const t of tags) {
    if (t.axis === 'legitimacy') legitimacy = t.slug
    else if (t.axis === 'compensation') compensation.push(t.slug)
  }
  return { legitimacy, compensation }
}

// Pipeline stage row — visualizes deal progression at the top of the modal.
// `rejected` is a terminal off-pipeline state (reachable only via Deal Edit
// modal per FR-4 design decision #5) and is excluded from this row.
const STAGE_PROGRESSION: { value: DealStage; label: string }[] = [
  { value: 'inbox', label: 'Inbox' },
  { value: 'negotiating', label: 'Negotiating' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'delivered', label: 'Delivered' },
]

function stageProgressionState(
  current: DealStage,
  step: DealStage
): 'past' | 'current' | 'future' {
  if (current === step) return 'current'
  const currentIdx = STAGE_PROGRESSION.findIndex((s) => s.value === current)
  const stepIdx = STAGE_PROGRESSION.findIndex((s) => s.value === step)
  if (currentIdx === -1 || stepIdx === -1) return 'future'
  return stepIdx < currentIdx ? 'past' : 'future'
}

function nextPipelineStage(
  current: DealStage
): { value: DealStage; label: string } | null {
  if (current === 'rejected' || current === 'delivered') return null
  const idx = STAGE_PROGRESSION.findIndex((s) => s.value === current)
  if (idx === -1) return null
  return STAGE_PROGRESSION[idx + 1] ?? null
}

const PITCH_EDITABLE_FIELDS = [
  'brand_name',
  'sender_name',
  'deliverables',
  'budget_amount',
  'budget_currency',
  'budget_notes',
  'deadline',
  'ai_summary',
  'user_notes',
] as const

type AsyncState = 'idle' | 'loading' | 'error'
type Mode = 'read' | 'edit'
type Tab = 'pitch' | 'deal' | 'activity'

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  return a.every((v, i) => v === b[i])
}

function computePitchDiff(
  orig: Pitch,
  draft: Pitch
): Record<string, [unknown, unknown]> {
  const diff: Record<string, [unknown, unknown]> = {}
  for (const field of PITCH_EDITABLE_FIELDS) {
    if (field === 'deliverables') {
      if (!arraysEqual(orig.deliverables, draft.deliverables)) {
        diff[field] = [orig.deliverables, draft.deliverables]
      }
    } else if (orig[field] !== draft[field]) {
      diff[field] = [orig[field], draft[field]]
    }
  }
  return diff
}

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
  // Deal lookup: undefined = checking; null = no deal exists; Deal = found.
  const [deal, setDeal] = useState<Deal | null | undefined>(undefined)
  const [activities, setActivities] = useState<Activity[]>([])
  const [dealEditOpen, setDealEditOpen] = useState(false)
  // Mobile-only tab state — drives `data-tab` on `.pitch-modal`. On desktop
  // (container >720px) all `.pdetail-pane` divs render via `display: contents`
  // so this value is visually inert.
  const [activeTab, setActiveTab] = useState<Tab>('pitch')
  // CR-2 — tag-edit mode: pencil opens, chevron closes. Animation is pure CSS
  // (250ms ease-out grid-template-rows 0fr → 1fr + opacity 0 → 1).
  const [editTagsOpen, setEditTagsOpen] = useState(false)

  // CR-2 — tag read/write via the generic taggable hook.
  const { tags, setTags, loading: tagsLoading } = useEntityTags(
    'pitch',
    pitch.id,
  )
  const { legitimacy, compensation } = splitTagsByAxis(tags)
  const compensationDisabled =
    pitch.direction === 'inbound' &&
    legitimacy !== null &&
    legitimacy !== 'valid'

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const fetchDeal = useCallback(async () => {
    const supabase = createClient()
    const { data, error: lookupError } = await supabase
      .from('deals')
      .select('*')
      .eq('pitch_id', pitch.id)
      .limit(1)
      .maybeSingle()
    if (lookupError) {
      console.error(
        '[PitchDetailModal] deal lookup failed:',
        lookupError.message
      )
      return
    }
    setDeal((data as Deal | null) ?? null)
  }, [pitch.id])

  const fetchActivities = useCallback(async () => {
    const supabase = createClient()
    const { data, error: lookupError } = await supabase
      .from('activities')
      .select('*')
      .eq('pitch_id', pitch.id)
      .order('created_at', { ascending: true })
    if (lookupError) {
      console.error(
        '[PitchDetailModal] activity lookup failed:',
        lookupError.message
      )
      return
    }
    setActivities((data as Activity[] | null) ?? [])
  }, [pitch.id])

  useEffect(() => {
    let cancelled = false
    async function run() {
      const supabase = createClient()
      const [dealRes, activitiesRes] = await Promise.all([
        supabase
          .from('deals')
          .select('*')
          .eq('pitch_id', pitch.id)
          .limit(1)
          .maybeSingle(),
        supabase
          .from('activities')
          .select('*')
          .eq('pitch_id', pitch.id)
          .order('created_at', { ascending: true }),
      ])
      if (cancelled) return
      if (dealRes.error) {
        console.error(
          '[PitchDetailModal] deal lookup failed:',
          dealRes.error.message
        )
        setDeal(null)
      } else {
        setDeal((dealRes.data as Deal | null) ?? null)
      }
      if (activitiesRes.error) {
        console.error(
          '[PitchDetailModal] activity lookup failed:',
          activitiesRes.error.message
        )
      } else {
        setActivities((activitiesRes.data as Activity[] | null) ?? [])
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [pitch.id])

  function update<K extends keyof Pitch>(key: K, value: Pitch[K]) {
    setDraft({ ...draft, [key]: value })
  }

  // CR-2 — chip-click handlers for the edit-tags section. Each toggle composes
  // the full tag-set (legitimacy + compensation per axis rules) and fires
  // useEntityTags.setTags, which calls update_pitch_with_activity + refetches.
  // Per AC1.6: compensation tags only persisted when legitimacy === 'valid'.
  async function onLegitimacyChange(nextLeg: string) {
    if (pitch.direction === 'outbound') return // legitimacy server-injected
    const nextSlugs =
      nextLeg === 'valid'
        ? [nextLeg, ...compensation]
        : [nextLeg]
    try {
      await setTags(nextSlugs)
      await fetchActivities()
    } catch {
      // useEntityTags surfaces the error via its own state; nothing extra here.
    }
  }

  async function onCompensationChange(nextComp: string[]) {
    // For inbound + legitimacy !== 'valid', UI is disabled so this shouldn't
    // fire; defensive guard.
    if (pitch.direction === 'inbound' && legitimacy !== 'valid') return
    const legSlug =
      pitch.direction === 'outbound' ? 'valid' : legitimacy ?? 'unclear'
    try {
      await setTags([legSlug, ...nextComp])
      await fetchActivities()
    } catch {
      // hook owns the error surface
    }
  }

  async function onSave(e?: FormEvent) {
    e?.preventDefault()
    const diff = computePitchDiff(pitch, draft)
    if (Object.keys(diff).length === 0) {
      setMode('read')
      return
    }

    setState('loading')
    setError(null)
    const supabase = createClient()
    // CR-2 — pass current tag set (from useEntityTags) through unchanged.
    // EditView no longer edits tags; the pencil-affordance flow owns that.
    const tagSlugs = tags.map((t) => t.slug)
    const { error: rpcError } = await supabase.rpc(
      'update_pitch_with_activity',
      {
        p_pitch_id: pitch.id,
        p_brand_name: draft.brand_name,
        p_sender_name: draft.sender_name,
        p_deliverables: draft.deliverables,
        p_budget_amount: draft.budget_amount,
        p_budget_currency: draft.budget_currency,
        p_budget_notes: draft.budget_notes,
        p_deadline: draft.deadline,
        p_tag_slugs: tagSlugs,
        p_ai_summary: draft.ai_summary,
        p_user_notes: draft.user_notes,
        p_field_diffs: diff,
      }
    )
    if (rpcError) {
      setError(rpcError.message)
      setState('error')
      return
    }
    onClose()
    router.refresh()
  }

  // ReadView notes auto-save on blur when user_notes changed in place.
  async function persistUserNotesOnBlur() {
    if (draft.user_notes === pitch.user_notes) return
    const supabase = createClient()
    const tagSlugs = tags.map((t) => t.slug)
    const { error: rpcError } = await supabase.rpc(
      'update_pitch_with_activity',
      {
        p_pitch_id: pitch.id,
        p_brand_name: pitch.brand_name,
        p_sender_name: pitch.sender_name,
        p_deliverables: pitch.deliverables,
        p_budget_amount: pitch.budget_amount,
        p_budget_currency: pitch.budget_currency,
        p_budget_notes: pitch.budget_notes,
        p_deadline: pitch.deadline,
        p_tag_slugs: tagSlugs,
        p_ai_summary: pitch.ai_summary,
        p_user_notes: draft.user_notes,
        p_field_diffs: { user_notes: [pitch.user_notes, draft.user_notes] },
      }
    )
    if (rpcError) {
      console.error(
        '[PitchDetailModal] note auto-save failed:',
        rpcError.message
      )
      return
    }
    router.refresh()
  }

  const startTrackingDraft: Deal = {
    id: '',
    pitch_id: pitch.id,
    user_id: '',
    stage: 'inbox',
    current_budget_amount: pitch.budget_amount,
    current_budget_currency: pitch.budget_currency,
    current_deliverables: pitch.deliverables,
    current_scope_notes: null,
    created_at: '',
    updated_at: '',
  }

  async function onAdvanceStage() {
    if (!deal) return
    const next = nextPipelineStage(deal.stage)
    if (!next) return
    setState('loading')
    setError(null)
    const supabase = createClient()
    const { error: rpcError } = await supabase.rpc(
      'change_deal_stage_with_activity',
      {
        p_deal_id: deal.id,
        p_from_stage: deal.stage,
        p_to_stage: next.value,
      }
    )
    if (rpcError) {
      setError(rpcError.message)
      setState('error')
      return
    }
    setState('idle')
    await fetchDeal()
    await fetchActivities()
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

  // Gate the body + footer on initial loads. Includes tags so the receipts
  // grid doesn't show "Untagged" briefly before the real tag set arrives.
  const initialLoading = deal === undefined || tagsLoading

  return (
    <>
      <div className="pitch-modal-overlay" onClick={onClose}>
        <div
          className="pitch-modal"
          data-tab={activeTab}
          onClick={(e) => e.stopPropagation()}
        >
          <header className="pitch-modal-head">
            <div className="pitch-modal-head-l">
              <span
                className={
                  'pitch-modal-dirchip' +
                  (pitch.direction === 'outbound' ? ' is-outbound' : '')
                }
                aria-label={`Direction: ${pitch.direction}`}
              >
                <span className="pitch-modal-dirchip-arrow" aria-hidden>
                  {pitch.direction === 'outbound' ? '↗' : '↘'}
                </span>
                {pitch.direction === 'outbound'
                  ? 'Pitch to brand'
                  : 'Pitch from brand'}
              </span>
              <span className="pitch-modal-band-when">
                {pitch.direction === 'outbound' ? 'Sent' : 'Received'}{' '}
                {formatFullDate(pitch.created_at)}
              </span>
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


          {initialLoading ? (
            <div className="pitch-modal-loading" role="status" aria-live="polite">
              <Spinner className="h-6 w-6" />
              <span className="sr-only">Loading pitch detail…</span>
            </div>
          ) : (
            <>
              {mode === 'read' ? (
                <ReadView
                  pitch={pitch}
                  draft={draft}
                  setDraft={setDraft}
                  deal={deal}
                  activities={activities}
                  activeTab={activeTab}
                  setActiveTab={setActiveTab}
                  onNoteBlur={persistUserNotesOnBlur}
                  onStartTracking={() => setDealEditOpen(true)}
                  onEditDeal={() => setDealEditOpen(true)}
                  tags={tags}
                  legitimacy={legitimacy}
                  compensation={compensation}
                  compensationDisabled={compensationDisabled}
                  editTagsOpen={editTagsOpen}
                  onOpenEditTags={() => setEditTagsOpen(true)}
                  onCloseEditTags={() => setEditTagsOpen(false)}
                  onLegitimacyChange={onLegitimacyChange}
                  onCompensationChange={onCompensationChange}
                />
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
                    className="pdetail-edit"
                  >
                    Edit details
                  </button>
                  {deal === null && (
                    <button
                      type="button"
                      onClick={() => setDealEditOpen(true)}
                      className="pdetail-primary"
                    >
                      Start tracking deal{' '}
                      <span className="arr" aria-hidden>
                        →
                      </span>
                    </button>
                  )}
                  {deal &&
                    (() => {
                      const next = nextPipelineStage(deal.stage)
                      return next ? (
                        <button
                          type="button"
                          onClick={onAdvanceStage}
                          disabled={state === 'loading'}
                          className="pdetail-primary"
                        >
                          {state === 'loading' && (
                            <Spinner className="h-4 w-4" />
                          )}
                          Move to {next.label}{' '}
                          <span className="arr" aria-hidden>
                            →
                          </span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled
                          className="pdetail-primary"
                        >
                          Final stage
                        </button>
                      )
                    })()}
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
            </>
          )}
        </div>
      </div>

      {dealEditOpen && (
        <DealEditModal
          mode={deal ? 'edit' : 'create'}
          deal={deal ?? startTrackingDraft}
          onClose={() => setDealEditOpen(false)}
          onSaved={() => {
            fetchDeal()
            fetchActivities()
            router.refresh()
          }}
        />
      )}
    </>
  )
}

interface ReadViewProps {
  pitch: Pitch
  draft: Pitch
  setDraft: (p: Pitch) => void
  deal: Deal | null | undefined
  activities: Activity[]
  activeTab: Tab
  setActiveTab: (t: Tab) => void
  onNoteBlur: () => void
  onStartTracking: () => void
  onEditDeal: () => void
  tags: Tag[]
  legitimacy: string | null
  compensation: string[]
  compensationDisabled: boolean
  editTagsOpen: boolean
  onOpenEditTags: () => void
  onCloseEditTags: () => void
  onLegitimacyChange: (next: string) => void
  onCompensationChange: (next: string[]) => void
}

function ReadView({
  pitch,
  draft,
  setDraft,
  deal,
  activities,
  activeTab,
  setActiveTab,
  onNoteBlur,
  onStartTracking,
  onEditDeal,
  tags,
  legitimacy,
  compensation,
  compensationDisabled,
  editTagsOpen,
  onOpenEditTags,
  onCloseEditTags,
  onLegitimacyChange,
  onCompensationChange,
}: ReadViewProps) {
  const deadlineParts = formatDeadline(pitch.deadline)
  const isOutbound = pitch.direction === 'outbound'

  return (
    <div className="pitch-read">
      <div className="pitch-hero">
        <h1 className="pitch-hero-h1">
          {(pitch.brand_name ?? 'Untitled pitch').toUpperCase()}
          <span className="pitch-hero-dot">.</span>
        </h1>
      </div>

      {deal && deal.stage !== 'rejected' && (
        <div className="pitch-modal-stage">
          <span className="pitch-modal-stage-l">Pipeline stage</span>
          <div className="pitch-modal-stages">
            {STAGE_PROGRESSION.map((s) => {
              const variant = stageProgressionState(deal.stage, s.value)
              return (
                <span
                  key={s.value}
                  className={`pitch-modal-stage-btn${
                    variant === 'current'
                      ? ' is-current'
                      : variant === 'past'
                        ? ' is-past'
                        : ''
                  }`}
                >
                  {s.label}
                </span>
              )
            })}
          </div>
        </div>
      )}

      <nav
        className="pdetail-tabs"
        role="tablist"
        aria-label="Pitch detail sections"
      >
        <button
          type="button"
          role="tab"
          onClick={() => setActiveTab('pitch')}
          className={
            'pdetail-tab-btn' + (activeTab === 'pitch' ? ' is-active' : '')
          }
          aria-selected={activeTab === 'pitch'}
        >
          Pitch
        </button>
        <button
          type="button"
          role="tab"
          onClick={() => setActiveTab('deal')}
          className={
            'pdetail-tab-btn' + (activeTab === 'deal' ? ' is-active' : '')
          }
          aria-selected={activeTab === 'deal'}
        >
          Deal
        </button>
        <button
          type="button"
          role="tab"
          onClick={() => setActiveTab('activity')}
          className={
            'pdetail-tab-btn' + (activeTab === 'activity' ? ' is-active' : '')
          }
          aria-selected={activeTab === 'activity'}
        >
          Activity
          {activities.length > 0 && (
            <span className="pdetail-tab-n">{activities.length}</span>
          )}
        </button>
      </nav>

      <div className="pdetail-pane" data-pane="pitch">
        <div className="pitch-grid">
          {!isOutbound && (
            <Cell label="Sender">
              <strong className="pitch-cell-name">
                {pitch.sender_name ?? '—'}
              </strong>
            </Cell>
          )}
          <Cell label={isOutbound ? 'Proposed budget' : 'Budget'}>
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
          {/* CR-2 — Tags cell replaces the prior Category cell. Always renders
              (both inbound + outbound); TagBadges hides legitimacy for outbound
              and hides compensation when legitimacy !== 'valid'. Inline pencil
              affordance at the top-right opens the slide-down edit-tags section
              below the receipts grid. */}
          <div className="pitch-cell pdetail-cell is-tags">
            <span className="kicker">Tags</span>
            <button
              type="button"
              className="pdetail-cell-edit-trigger"
              onClick={onOpenEditTags}
              aria-label="Edit tags"
              aria-expanded={editTagsOpen}
            >
              <PencilIcon />
            </button>
            <div className="pitch-cell-body">
              <TagBadges
                tags={tags}
                direction={pitch.direction}
                hideLegitimacy={isOutbound}
              />
            </div>
          </div>
        </div>

        {/* CR-2 — Edit-tags slide-down section. Always rendered for the
            animation (parent's grid-template-rows 0fr → 1fr handles the
            collapse). Receipts grid above + deal block below stay anchored. */}
        <div
          className={
            'pdetail-edit-tags-slot' + (editTagsOpen ? ' is-open' : '')
          }
        >
          <div className="pdetail-edit-tags-inner">
            <div className="pdetail-edit-tags">
              <div className="pdetail-edit-tags-head">
                <span className="pdetail-edit-tags-l">
                  Edit tags
                  <span className="pdetail-edit-tags-meta">
                    {isOutbound
                      ? 'Outbound · only compensation is editable'
                      : 'Legitimacy first · compensation enables on Valid'}
                  </span>
                </span>
                <button
                  type="button"
                  className="pdetail-edit-tags-collapse"
                  onClick={onCloseEditTags}
                  aria-label="Collapse edit-tags section"
                >
                  ⌃
                </button>
              </div>
              <div className="pdetail-edit-tags-body">
                {!isOutbound && (
                  <ChipSelector
                    axis="Legitimacy"
                    kind="radio"
                    options={LEGITIMACY_OPTIONS}
                    value={legitimacy}
                    onChange={onLegitimacyChange}
                  />
                )}
                <ChipSelector
                  axis="Compensation"
                  kind="checkbox"
                  options={COMPENSATION_OPTIONS}
                  value={compensation}
                  onChange={onCompensationChange}
                  disabled={compensationDisabled}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="pdetail-pane" data-pane="deal">
        {deal === null && (
          <div className="pitch-section is-deal">
            <span className="kicker">Deal tracking</span>
            <div className="pdetail-deal-empty">
              <p className="pdetail-deal-empty-text">
                <strong>No deal attached yet.</strong> Start tracking when
                this pitch becomes a negotiation — budget, deliverables, and
                scope evolve here without overwriting the original message.
              </p>
              <button
                type="button"
                onClick={onStartTracking}
                className="btn-pill"
              >
                Start tracking deal <span className="arrow">→</span>
              </button>
            </div>
          </div>
        )}
        {deal && (
          <div className="pitch-section is-deal">
            <div className="pdetail-deal-head">
              <span className="kicker">Deal · current</span>
              <button
                type="button"
                onClick={onEditDeal}
                className="pdetail-deal-edit"
              >
                <span className="pdetail-deal-edit-icon" aria-hidden>
                  ✎
                </span>
                Edit deal
              </button>
            </div>
            <div className="pdetail-deal-grid">
              <div className="pdetail-deal-cell">
                <span className="pdetail-deal-cell-l">Stage</span>
                <StageChip stage={deal.stage} />
              </div>
              <div className="pdetail-deal-cell">
                <span className="pdetail-deal-cell-l">Current budget</span>
                {deal.current_budget_amount != null ? (
                  <span className="pdetail-deal-cell-v is-amount">
                    {formatCurrencyAmount(
                      deal.current_budget_currency ?? '',
                      deal.current_budget_amount
                    )}
                    {deal.current_budget_currency && (
                      <sup>{deal.current_budget_currency}</sup>
                    )}
                  </span>
                ) : (
                  <span className="pdetail-deal-cell-v is-empty">—</span>
                )}
              </div>
              <div className="pdetail-deal-cell">
                <span className="pdetail-deal-cell-l">
                  Current {isOutbound ? 'offered' : 'requested'} deliverables
                </span>
                {deal.current_deliverables.length > 0 ? (
                  <ul className="pdetail-deal-deliverables">
                    {deal.current_deliverables.map((d, i) => (
                      <li key={i}>{d}</li>
                    ))}
                  </ul>
                ) : (
                  <span className="pdetail-deal-cell-v is-empty">—</span>
                )}
              </div>
            </div>
            {deal.current_scope_notes && (
              <div className="pitch-deal-notes">
                &ldquo;{deal.current_scope_notes}&rdquo;
              </div>
            )}
          </div>
        )}
      </div>

      <div className="pdetail-pane" data-pane="pitch">
        {pitch.deliverables.length > 0 && (
          <div className="pitch-section">
            <span className="kicker">
              {isOutbound ? 'Offered deliverables' : 'Deliverables'} ·{' '}
              {pitch.deliverables.length}
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
            <blockquote className="pitch-summary">
              {pitch.ai_summary}
            </blockquote>
          </div>
        )}

        <div className="pitch-section">
          <span className="kicker">Your notes</span>
          <textarea
            className="pitch-notes"
            value={draft.user_notes ?? ''}
            onChange={(e) =>
              setDraft({ ...draft, user_notes: e.target.value || null })
            }
            onBlur={onNoteBlur}
            placeholder="Personal notes, follow-up reminders, negotiation context…"
            rows={3}
          />
        </div>
      </div>

      <div className="pdetail-pane" data-pane="activity">
        {activities.length > 0 && (
          <div className="pitch-section">
            <span className="kicker">
              Activity log · {activities.length}{' '}
              {activities.length === 1 ? 'event' : 'events'}
            </span>
            <div className="timeline">
              {activities.map((a) => {
                const ev = formatActivityEvent(a)
                const accentClass =
                  ev.accent === 'accent'
                    ? ' is-accent'
                    : ev.accent === 'ink'
                      ? ' is-ink'
                      : ''
                return (
                  <div key={a.id} className={'tl-event' + accentClass}>
                    <span className="tl-dot" aria-hidden />
                    <div className="tl-body">
                      <span className="tl-type">{ev.label}</span>
                      {ev.payload && (
                        <span className="tl-payload">{ev.payload}</span>
                      )}
                    </div>
                    <span className="tl-when">
                      {formatFullDate(a.created_at)}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
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
  const isOutbound = draft.direction === 'outbound'
  const [deliverablesInput, setDeliverablesInput] = useState(
    draft.deliverables.join(', ')
  )
  return (
    <form onSubmit={onSave} className="pitch-edit">
      <Field label="Brand">
        <TextInput
          value={draft.brand_name ?? ''}
          onChange={(v) => update('brand_name', v || null)}
        />
      </Field>
      {!isOutbound && (
        <Field label="Sender">
          <TextInput
            value={draft.sender_name ?? ''}
            onChange={(v) => update('sender_name', v || null)}
          />
        </Field>
      )}
      <Field
        label={
          isOutbound
            ? 'Offered deliverables (comma-separated)'
            : 'Deliverables (comma-separated)'
        }
      >
        <TextInput
          value={deliverablesInput}
          onChange={(v) => {
            setDeliverablesInput(v)
            update(
              'deliverables',
              v
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
            )
          }}
        />
      </Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label={isOutbound ? 'Proposed price' : 'Budget amount'}>
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
      {/* CR-2 — Category dropdown removed. Tags are edited via the pencil
          affordance in the Tags cell (ReadView) which opens an in-place
          slide-down edit section; chip-toggle auto-saves via the
          useEntityTags hook. EditView is for non-tag fields only. */}
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

// Lucide `Pencil` icon (MIT-licensed; https://lucide.dev). 12px in 16×16 hit
// target. `stroke: currentColor` so the color follows the affordance state
// (--ink-3 resting → --ink hover) via the parent button's CSS.
function PencilIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
      <path d="m15 5 4 4" />
    </svg>
  )
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
