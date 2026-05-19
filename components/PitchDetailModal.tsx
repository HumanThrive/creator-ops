'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Pitch } from '@/lib/types/pitch'
import type { Deal, DealStage } from '@/lib/types/deal'
import type { Activity } from '@/lib/types/activity'
import { useEntityTags } from '@/lib/hooks/useEntityTags'
import { formatFullDate } from '@/lib/format'
import {
  getMockIndustry,
  getMockSourceSubject,
} from '@/lib/pitch-mock'
import { Spinner } from './Spinner'
import { DirIndicator } from './DirIndicator'
import { FactsStrip } from './pitch-detail/FactsStrip'
import { DealCard, type DealCardDraft } from './pitch-detail/DealCard'
import { NoDealPanel, pickLegitimacy, type LegitimacyVariant } from './pitch-detail/NoDealPanel'
import { HistoryTimeline } from './pitch-detail/HistoryTimeline'
import {
  EditDetailsOverlay,
  type PitchEditDraft,
} from './pitch-detail/EditDetailsOverlay'

type Mode = 'default' | 'edit-tags' | 'edit-deal' | 'view-original' | 'edit-details'

interface PitchDetailModalProps {
  pitch: Pitch
  onClose: () => void
  // Computed by caller — true if this pitch is the first the user saved
  // for `brand_name`. Optional; modal omits the flag if absent.
  isFirstTouch?: boolean
}

export function PitchDetailModal({
  pitch,
  onClose,
  isFirstTouch,
}: PitchDetailModalProps) {
  const router = useRouter()
  const supabase = createClient()

  const [mode, setMode] = useState<Mode>('default')
  const [deal, setDeal] = useState<Deal | null | undefined>(undefined)
  const [activities, setActivities] = useState<Activity[]>([])
  const [notesDraft, setNotesDraft] = useState(pitch.user_notes ?? '')
  const [notesSaving, setNotesSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [advanceWorking, setAdvanceWorking] = useState(false)

  const { tags, setTags } = useEntityTags('pitch', pitch.id)
  const legitimacy: LegitimacyVariant | null = pickLegitimacy(
    tags.map((t) => t.slug),
  )

  // Initial parallel fetch + Esc handler.
  const fetchDeal = useCallback(async () => {
    const { data, error } = await supabase
      .from('deals')
      .select('*')
      .eq('pitch_id', pitch.id)
      .limit(1)
      .maybeSingle()
    if (error) {
      console.error('[PitchDetailModal] deal lookup failed:', error.message)
      return
    }
    setDeal((data as Deal | null) ?? null)
  }, [pitch.id, supabase])

  const fetchActivities = useCallback(async () => {
    const { data, error } = await supabase
      .from('activities')
      .select('*')
      .eq('pitch_id', pitch.id)
      .order('created_at', { ascending: false })
    if (error) {
      console.error(
        '[PitchDetailModal] activity lookup failed:',
        error.message,
      )
      return
    }
    setActivities((data as Activity[] | null) ?? [])
  }, [pitch.id, supabase])

  useEffect(() => {
    let cancelled = false
    async function run() {
      const [dealRes, actsRes] = await Promise.all([
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
          .order('created_at', { ascending: false }),
      ])
      if (cancelled) return
      setDeal((dealRes.data as Deal | null) ?? null)
      setActivities((actsRes.data as Activity[] | null) ?? [])
    }
    run()
    return () => {
      cancelled = true
    }
  }, [pitch.id, supabase])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && mode !== 'edit-details') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, mode])

  // ───────────────── RPC handlers ─────────────────
  async function handleStartTrackingDeal() {
    const { error } = await supabase.rpc('create_deal_with_activity', {
      p_pitch_id: pitch.id,
      p_stage: 'inbox',
      p_current_budget_amount: pitch.budget_amount,
      p_current_budget_currency: pitch.budget_currency,
      p_current_deliverables: pitch.deliverables,
      p_current_scope_notes: null,
      p_seeded_from: 'manual_recover',
    })
    if (error) {
      console.error('[PitchDetailModal] create_deal failed:', error.message)
      return
    }
    await Promise.all([fetchDeal(), fetchActivities()])
  }

  async function handleStageChange(next: DealStage) {
    if (!deal) return
    const { error } = await supabase.rpc('change_deal_stage_with_activity', {
      p_deal_id: deal.id,
      p_to_stage: next,
    })
    if (error) {
      console.error('[PitchDetailModal] stage change failed:', error.message)
      return
    }
    await Promise.all([fetchDeal(), fetchActivities()])
  }

  async function handleSaveDeal(draft: DealCardDraft) {
    if (!deal) return
    const diffs: Record<string, { from: unknown; to: unknown }> = {}
    if (draft.current_budget_amount !== deal.current_budget_amount) {
      diffs.current_budget_amount = {
        from: deal.current_budget_amount,
        to: draft.current_budget_amount,
      }
    }
    if (draft.current_budget_currency !== deal.current_budget_currency) {
      diffs.current_budget_currency = {
        from: deal.current_budget_currency,
        to: draft.current_budget_currency,
      }
    }
    const sameDeliv =
      draft.current_deliverables.length === deal.current_deliverables.length &&
      draft.current_deliverables.every((v, i) => v === deal.current_deliverables[i])
    if (!sameDeliv) {
      diffs.current_deliverables = {
        from: deal.current_deliverables,
        to: draft.current_deliverables,
      }
    }
    if (draft.current_scope_notes !== deal.current_scope_notes) {
      diffs.current_scope_notes = {
        from: deal.current_scope_notes,
        to: draft.current_scope_notes,
      }
    }
    if (Object.keys(diffs).length === 0) {
      setMode('default')
      return
    }
    const { error } = await supabase.rpc('update_deal_with_activity', {
      p_deal_id: deal.id,
      p_current_budget_amount: draft.current_budget_amount,
      p_current_budget_currency: draft.current_budget_currency,
      p_current_deliverables: draft.current_deliverables,
      p_current_scope_notes: draft.current_scope_notes,
      p_field_diffs: { field_diffs: diffs },
    })
    if (error) {
      throw new Error(error.message)
    }
    await Promise.all([fetchDeal(), fetchActivities()])
    setMode('default')
  }

  async function handleLegitimacyChange(next: string) {
    if (pitch.direction === 'outbound') return
    const compensation = tags
      .filter((t) => t.axis === 'compensation')
      .map((t) => t.slug)
    const nextSlugs = next === 'valid' ? [next, ...compensation] : [next]
    try {
      await setTags(nextSlugs)
      await fetchActivities()
    } catch {
      /* useEntityTags owns the error surface */
    }
  }

  async function handleCompensationChange(next: string[]) {
    const legSlug =
      pitch.direction === 'outbound'
        ? 'valid'
        : legitimacy ?? 'unclear'
    try {
      await setTags([legSlug, ...next])
      await fetchActivities()
    } catch {
      /* hook owns the surface */
    }
  }

  async function handleSavePitchDetails(draft: PitchEditDraft) {
    const tagSlugs = tags.map((t) => t.slug)
    const diffs: Record<string, { from: unknown; to: unknown }> = {}
    if (draft.brand_name !== pitch.brand_name) {
      diffs.brand_name = { from: pitch.brand_name, to: draft.brand_name }
    }
    if (draft.sender_name !== pitch.sender_name) {
      diffs.sender_name = { from: pitch.sender_name, to: draft.sender_name }
    }
    const sameDeliv =
      draft.deliverables.length === pitch.deliverables.length &&
      draft.deliverables.every((v, i) => v === pitch.deliverables[i])
    if (!sameDeliv) {
      diffs.deliverables = { from: pitch.deliverables, to: draft.deliverables }
    }
    if (draft.budget_amount !== pitch.budget_amount) {
      diffs.budget_amount = { from: pitch.budget_amount, to: draft.budget_amount }
    }
    if (draft.budget_currency !== pitch.budget_currency) {
      diffs.budget_currency = {
        from: pitch.budget_currency,
        to: draft.budget_currency,
      }
    }
    if (draft.deadline !== pitch.deadline) {
      diffs.deadline = { from: pitch.deadline, to: draft.deadline }
    }
    const { error } = await supabase.rpc('update_pitch_with_activity', {
      p_pitch_id: pitch.id,
      p_brand_name: draft.brand_name,
      p_sender_name: draft.sender_name,
      p_deliverables: draft.deliverables,
      p_budget_amount: draft.budget_amount,
      p_budget_currency: draft.budget_currency,
      p_budget_notes: pitch.budget_notes,
      p_deadline: draft.deadline,
      p_tag_slugs: tagSlugs,
      p_ai_summary: pitch.ai_summary,
      p_user_notes: pitch.user_notes,
      p_field_diffs: { field_diffs: diffs },
    })
    if (error) throw new Error(error.message)
    setMode('default')
    router.refresh()
  }

  async function handleNotesBlur() {
    if (notesDraft === (pitch.user_notes ?? '')) return
    setNotesSaving(true)
    const tagSlugs = tags.map((t) => t.slug)
    const { error } = await supabase.rpc('update_pitch_with_activity', {
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
      p_user_notes: notesDraft,
      p_field_diffs: {
        field_diffs: {
          user_notes: { from: pitch.user_notes, to: notesDraft },
        },
      },
    })
    setNotesSaving(false)
    if (error) {
      console.error('[PitchDetailModal] notes save failed:', error.message)
      return
    }
    await fetchActivities()
    router.refresh()
  }

  async function handleDeletePitch() {
    if (deleting) return
    setDeleting(true)
    const { error } = await supabase.from('pitches').delete().eq('id', pitch.id)
    setDeleting(false)
    if (error) {
      console.error('[PitchDetailModal] delete failed:', error.message)
      return
    }
    onClose()
    router.refresh()
  }

  async function handleAdvance() {
    if (!deal || advanceWorking) return
    const order: DealStage[] = ['inbox', 'negotiating', 'confirmed', 'delivered']
    const idx = order.indexOf(deal.stage)
    if (idx < 0 || idx >= order.length - 1) return
    setAdvanceWorking(true)
    try {
      await handleStageChange(order[idx + 1])
    } finally {
      setAdvanceWorking(false)
    }
  }

  // ───────────────── Routing: deal-card vs no-deal-panel ─────────────────
  const isSimpleNoDeal =
    deal === null &&
    (legitimacy === 'spam_or_scam' || legitimacy === 'not_a_pitch' || legitimacy === 'low_quality')

  const loading = deal === undefined

  // ───────────────── Meta line for brand head ─────────────────
  const headMetaSegments: string[] = []
  if (isFirstTouch === true) headMetaSegments.push('1st touch')
  else if (isFirstTouch === false) headMetaSegments.push('Repeat')
  headMetaSegments.push(getMockIndustry(pitch))
  headMetaSegments.push(`Source: ${getMockSourceSubject(pitch).split(' · ')[0]}`)
  const headMeta = headMetaSegments.join(' · ')

  return (
    <div className="pdetail-scrim" onClick={onClose}>
      <div
        className="pdetail"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pdetail-band">
          <div className="pdetail-band-l">
            <DirIndicator direction={pitch.direction} variant="chip" />
            <span className="pdetail-band-when">
              Received {formatFullDate(pitch.created_at)}
            </span>
          </div>
          <button
            type="button"
            className="pitch-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="pdetail-head">
          <h1 className="pdetail-h1">
            {pitch.brand_name || 'Unknown brand'}
            <span style={{ color: 'var(--accent)' }}>.</span>
          </h1>
          <div className="pdetail-meta">{headMeta}</div>
        </div>

        {pitch.ai_summary ? (
          <div className="pdetail-cr8-intro">
            <p className="pdetail-cr8-intro-summary">{pitch.ai_summary}</p>
          </div>
        ) : null}

        <FactsStrip pitch={pitch} />

        {loading ? (
          <div style={{ padding: '40px 32px', display: 'flex', justifyContent: 'center' }}>
            <Spinner />
          </div>
        ) : isSimpleNoDeal ? (
          <section className="pdetail-cr8-section">
            <div className="pdetail-cr8-section-l">Pitch · no deal</div>
            <NoDealPanel
              legitimacy={legitimacy}
              onStartTracking={handleStartTrackingDeal}
              onDeletePitch={handleDeletePitch}
            />
          </section>
        ) : (
          <DealCard
            pitch={pitch}
            deal={deal ?? null}
            tags={tags}
            editing={mode === 'edit-deal'}
            editingTags={mode === 'edit-tags'}
            onEnterEditDeal={() => setMode('edit-deal')}
            onCancelEditDeal={() => setMode('default')}
            onSaveDealRequest={handleSaveDeal}
            onEnterEditTags={() => setMode('edit-tags')}
            onExitEditTags={() => setMode('default')}
            onLegitimacyChange={handleLegitimacyChange}
            onCompensationChange={handleCompensationChange}
            onStageChangeRequest={handleStageChange}
            onStartTrackingDeal={handleStartTrackingDeal}
          />
        )}

        <section className="pdetail-cr8-section">
          <div className="pdetail-cr8-section-l">
            Your notes
            {notesSaving ? (
              <span className="pdetail-cr8-section-l-meta">Saving…</span>
            ) : null}
          </div>
          <textarea
            className="pdetail-cr8-notes-ta"
            placeholder="Personal notes, follow-up reminders, negotiation context…"
            value={notesDraft}
            onChange={(e) => setNotesDraft(e.target.value)}
            onBlur={handleNotesBlur}
          />
        </section>

        <HistoryTimeline
          pitch={pitch}
          activities={activities}
          expandedOriginal={mode === 'view-original'}
          onToggleOriginal={() =>
            setMode(mode === 'view-original' ? 'default' : 'view-original')
          }
        />

        <div className="pdetail-foot">
          <div className="pdetail-foot-l">
            <button
              type="button"
              className="pdetail-delete"
              onClick={handleDeletePitch}
              disabled={deleting}
            >
              {deleting ? 'Deleting…' : 'Delete pitch'}
            </button>
          </div>
          <div className="pdetail-foot-r">
            <button
              type="button"
              className="pdetail-edit"
              onClick={() => setMode('edit-details')}
            >
              Edit details
            </button>
            {deal && deal.stage !== 'delivered' && deal.stage !== 'rejected' ? (
              <button
                type="button"
                className="pdetail-primary"
                onClick={handleAdvance}
                disabled={advanceWorking}
              >
                {advanceWorking ? 'Advancing…' : 'Advance →'}
              </button>
            ) : null}
          </div>
        </div>

        {mode === 'edit-details' ? (
          <EditDetailsOverlay
            pitch={pitch}
            onClose={() => setMode('default')}
            onSaveRequest={handleSavePitchDetails}
          />
        ) : null}
      </div>
    </div>
  )
}
