'use client'

import { useEffect, useRef, useState } from 'react'
import type { Pitch } from '@/lib/types/pitch'
import type { Deal, DealStage } from '@/lib/types/deal'
import type { Tag } from '@/lib/hooks/useEntityTags'
import { TagBadges } from '@/components/TagBadges'
import { ChipSelector } from '@/components/ChipSelector'
import { getStageLabel } from '@/lib/stage-labels'
import { formatFullDate } from '@/lib/format'

export interface DealCardDraft {
  current_budget_amount: number | null
  current_budget_currency: string | null
  current_deliverables: string[]
  current_scope_notes: string | null
}

interface DealCardProps {
  pitch: Pitch
  deal: Deal | null
  tags: Tag[]
  editing: boolean
  editingTags: boolean
  onEnterEditDeal: () => void
  onCancelEditDeal: () => void
  onSaveDealRequest: (draft: DealCardDraft) => Promise<void>
  onEnterEditTags: () => void
  onExitEditTags: () => void
  onLegitimacyChange: (next: string) => Promise<void>
  onCompensationChange: (next: string[]) => Promise<void>
  onStageChangeRequest: (next: DealStage) => Promise<void>
  onStartTrackingDeal: () => void
}

// 4 happy-path stages — `rejected` reachable via the future delete/reject affordance only.
const HAPPY_STAGES: DealStage[] = ['inbox', 'negotiating', 'confirmed', 'delivered']

const LEGIT_OPTIONS = [
  { id: 'valid', label: 'Valid' },
  { id: 'low_quality', label: 'Low quality' },
  { id: 'spam_or_scam', label: 'Spam / Scam' },
  { id: 'unclear', label: 'Unclear' },
  { id: 'not_a_pitch', label: 'Not a pitch' },
]

const COMP_OPTIONS = [
  { id: 'cash', label: 'Cash' },
  { id: 'gifting', label: 'Gifting' },
  { id: 'collaboration', label: 'Collaboration' },
  { id: 'unspecified', label: 'Unspecified' },
]

function formatMoney(amount: number | null, currency: string | null): string | null {
  if (amount == null) return null
  const c = currency ? ` ${currency.toUpperCase()}` : ''
  return `$${amount.toLocaleString()}${c}`
}

function pickLegitimacy(tags: Tag[]): string | null {
  for (const t of tags) if (t.axis === 'legitimacy') return t.slug
  return null
}

function pickCompensation(tags: Tag[]): string[] {
  return tags.filter((t) => t.axis === 'compensation').map((t) => t.slug)
}

export function DealCard({
  pitch,
  deal,
  tags,
  editing,
  editingTags,
  onEnterEditDeal,
  onCancelEditDeal,
  onSaveDealRequest,
  onEnterEditTags,
  onExitEditTags,
  onLegitimacyChange,
  onCompensationChange,
  onStageChangeRequest,
  onStartTrackingDeal,
}: DealCardProps) {
  const hasDeal = deal !== null

  const legitimacy = pickLegitimacy(tags)
  const compensation = pickCompensation(tags)
  const compDisabled = !!legitimacy && legitimacy !== 'valid' && pitch.direction !== 'outbound'

  const askBudget = formatMoney(pitch.budget_amount, pitch.budget_currency)
  const askDeliverables = pitch.deliverables.length
  const nowDeliverables = hasDeal ? deal.current_deliverables.length : askDeliverables
  const deliverablesDiff = nowDeliverables - askDeliverables
  const dealBudget = hasDeal ? formatMoney(deal.current_budget_amount, deal.current_budget_currency) : null

  // Stage dropdown — local state. Click-outside closes.
  const [stageMenuOpen, setStageMenuOpen] = useState(false)
  const stageWrapRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!stageMenuOpen) return
    function onDoc(e: MouseEvent) {
      if (!stageWrapRef.current?.contains(e.target as Node)) setStageMenuOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [stageMenuOpen])

  async function pickStage(next: DealStage) {
    setStageMenuOpen(false)
    if (deal && deal.stage !== next) await onStageChangeRequest(next)
  }

  // ─────────── Section header ───────────
  const sectionLabel = !hasDeal
    ? 'Pitch · no deal yet'
    : editing
    ? 'Deal · editing'
    : 'Deal · current state'
  const sectionMeta = !hasDeal
    ? null
    : editing
    ? 'Editing — changes save on submit'
    : `Updated ${formatFullDate(deal.updated_at)}`

  // ─────────── Stage button (shared across view + edit + no-deal-rich) ───────────
  const currentStage: DealStage = hasDeal ? deal.stage : 'inbox'
  const stageLabel = getStageLabel(currentStage, pitch.direction)
  const stageBtn = (
    <div className="pdetail-deal-stage-wrap" ref={stageWrapRef}>
      <button
        type="button"
        className={
          'pdetail-deal-stage-btn ' + currentStage + (stageMenuOpen ? ' is-open' : '')
        }
        onClick={() => hasDeal && setStageMenuOpen((v) => !v)}
        disabled={!hasDeal}
        aria-haspopup="menu"
        aria-expanded={stageMenuOpen}
      >
        {stageLabel}
        <span className="pdetail-deal-stage-btn-caret" aria-hidden>
          ▾
        </span>
      </button>
      {stageMenuOpen && hasDeal ? (
        <div className="pdetail-deal-stage-menu" role="menu">
          <span className="pdetail-deal-stage-menu-l">Move deal to…</span>
          {HAPPY_STAGES.map((s) => (
            <button
              key={s}
              type="button"
              role="menuitem"
              className={
                'pdetail-deal-stage-menu-item ' + s + (s === deal.stage ? ' is-current' : '')
              }
              onClick={() => pickStage(s)}
            >
              <span className="pdetail-deal-stage-menu-item-label">
                {getStageLabel(s, pitch.direction)}
              </span>
              {s === deal.stage ? (
                <span className="pdetail-deal-stage-menu-item-check">✓</span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )

  // ─────────── Tags stat cell ───────────
  const tagsCell = (
    <div className="pdetail-cr8-stat">
      <span className="pdetail-cr8-stat-l">Tags</span>
      <div className="pdetail-cr8-stat-tags">
        <div className="pdetail-cr8-stat-tags-row">
          {tags.length > 0 ? (
            <TagBadges tags={tags} direction={pitch.direction} />
          ) : (
            <span className="pdetail-cr8-stat-v is-empty">None</span>
          )}
        </div>
        {!editingTags && !editing ? (
          <button
            type="button"
            className="pdetail-cr8-stat-edit-tags"
            onClick={onEnterEditTags}
          >
            <span aria-hidden>✎</span> Edit tags
          </button>
        ) : editing ? (
          <span className="pdetail-cr8-stat-was">
            Tags edited separately · use ✎ Edit tags
          </span>
        ) : null}
      </div>
    </div>
  )

  // ─────────── Edit-tags inline panel ───────────
  const editTagsPanel = editingTags ? (
    <div className="pdetail-cr8-edit-tags-panel">
      <div className="pdetail-cr8-edit-tags-head">
        <span className="pdetail-cr8-edit-tags-l">Edit tags</span>
        <button
          type="button"
          className="pdetail-cr8-edit-tags-done"
          onClick={onExitEditTags}
        >
          <span className="check" aria-hidden>✓</span>
          Done
        </button>
      </div>
      {pitch.direction !== 'outbound' ? (
        <ChipSelector
          axis="Legitimacy"
          kind="radio"
          options={LEGIT_OPTIONS}
          value={legitimacy}
          onChange={(slug) => {
            void onLegitimacyChange(slug)
          }}
        />
      ) : null}
      <ChipSelector
        axis="Compensation"
        kind="checkbox"
        options={COMP_OPTIONS}
        value={compensation}
        disabled={compDisabled}
        onChange={(slugs) => {
          void onCompensationChange(slugs)
        }}
      />
      <span className="pdetail-cr8-edit-tags-auto">
        <b>Auto-saved</b> · changes apply instantly · close with <b>Done</b>
      </span>
    </div>
  ) : null

  // ─────────── Deliverables list (display variant) ───────────
  function renderDeliverablesDisplay(items: string[]) {
    const removed: string[] = [] // future: persist removed-deliverables in deal payload
    return (
      <div className="pdetail-cr8-card-deliv-wrap">
        <div className="pdetail-cr8-card-deliv-h">
          Deliverables
          {hasDeal && deliverablesDiff !== 0 && askDeliverables > 0 ? (
            <span className="pdetail-cr8-card-deliv-h-meta">
              {nowDeliverables} now · was {askDeliverables} in pitch
            </span>
          ) : (
            <span className="pdetail-cr8-card-deliv-h-meta">{nowDeliverables} items</span>
          )}
        </div>
        <ol className="pdetail-cr8-card-deliv">
          {items.map((d, i) => {
            // Explicit "(added)" / "(modified · was X)" suffix markers carry priority.
            const addedMatch = /\(added\)\s*$/i.test(d)
            const modMatch = /\(modified\s*·\s*was\s+(.+?)\)\s*$/i.exec(d)
            const isModified = !!modMatch
            const wasText = isModified ? modMatch[1] : null
            const isAdded = addedMatch || (!isModified && hasDeal && i >= askDeliverables)
            const text = d
              .replace(/\s*\(added\)\s*$/i, '')
              .replace(/\s*\(modified\s*·\s*was\s+.+?\)\s*$/i, '')
            return (
              <li key={i} className={isModified ? 'is-modified' : ''}>
                <span>
                  {text}
                  {wasText ? (
                    <span className="pdetail-cr8-card-deliv-was">
                      was <b>{wasText}</b>
                    </span>
                  ) : null}
                </span>
                {isAdded ? (
                  <span className="pdetail-cr8-card-deliv-tag">Added</span>
                ) : isModified ? (
                  <span className="pdetail-cr8-card-deliv-tag is-modified">Modified</span>
                ) : null}
              </li>
            )
          })}
          {removed.map((d, i) => (
            <li key={'r' + i} className="is-removed">
              <span>{d}</span>
              <span className="pdetail-cr8-card-deliv-tag is-removed">Removed</span>
            </li>
          ))}
        </ol>
      </div>
    )
  }

  return (
    <section className="pdetail-cr8-section">
      <div className="pdetail-cr8-section-l">
        {sectionLabel}
        {sectionMeta ? (
          <span className="pdetail-cr8-section-l-meta">{sectionMeta}</span>
        ) : null}
      </div>

      {hasDeal && editing && deal ? (
        <DealCardEditForm
          deal={deal}
          askBudget={askBudget}
          stageBtn={stageBtn}
          tagsCell={tagsCell}
          onSave={onSaveDealRequest}
          onCancel={onCancelEditDeal}
        />
      ) : hasDeal && deal ? (
        // ─── Default Deal card (view + optional edit-tags panel) ───
        <div className="pdetail-cr8-card">
          <div className="pdetail-cr8-card-r1">{stageBtn}</div>

          <div className="pdetail-cr8-card-stats">
            <div className="pdetail-cr8-stat">
              <span className="pdetail-cr8-stat-l">Budget</span>
              {dealBudget ? (
                <span className="pdetail-cr8-stat-v">{dealBudget}</span>
              ) : (
                <span className="pdetail-cr8-stat-v is-empty">Not stated</span>
              )}
              {askBudget && dealBudget && askBudget !== dealBudget ? (
                <span className="pdetail-cr8-stat-was is-accent">
                  was <b>{askBudget}</b>
                </span>
              ) : askBudget && dealBudget === askBudget ? (
                <span className="pdetail-cr8-stat-was">
                  Matches ask · was <b>{askBudget}</b>
                </span>
              ) : null}
            </div>
            <div className="pdetail-cr8-stat">
              <span className="pdetail-cr8-stat-l">Deliverables</span>
              {nowDeliverables > 0 ? (
                <span className="pdetail-cr8-stat-v">{nowDeliverables}</span>
              ) : (
                <span className="pdetail-cr8-stat-v is-empty">None set</span>
              )}
              {deliverablesDiff !== 0 && askDeliverables > 0 ? (
                <span className="pdetail-cr8-stat-was is-accent">
                  {deliverablesDiff > 0 ? '+' : ''}
                  {deliverablesDiff} since pitch · was <b>{askDeliverables}</b>
                </span>
              ) : askDeliverables > 0 ? (
                <span className="pdetail-cr8-stat-was">Matches ask</span>
              ) : null}
            </div>
            {tagsCell}
          </div>

          {editTagsPanel}

          {deal.current_deliverables.length > 0
            ? renderDeliverablesDisplay(deal.current_deliverables)
            : null}

          {deal.current_scope_notes ? (
            <p className="pdetail-cr8-card-scope">&quot;{deal.current_scope_notes}&quot;</p>
          ) : null}

          <div className="pdetail-cr8-card-foot">
            <button
              type="button"
              className="pdetail-cr8-card-edit-deal"
              onClick={onEnterEditDeal}
            >
              <span aria-hidden>✎</span> Edit deal
            </button>
          </div>
        </div>
      ) : (
        // ─── No-deal-rich variant (legitimacy = valid/unclear/null + no deal) ───
        <div className="pdetail-cr8-card is-nodeal">
          <div className="pdetail-cr8-card-r1">{stageBtn}</div>

          <div className="pdetail-cr8-card-stats">
            <div className="pdetail-cr8-stat">
              <span className="pdetail-cr8-stat-l">Budget</span>
              {askBudget ? (
                <span className="pdetail-cr8-stat-v">{askBudget}</span>
              ) : (
                <span className="pdetail-cr8-stat-v is-empty">Not stated</span>
              )}
              <span className="pdetail-cr8-stat-was">Proposed · no deal yet</span>
            </div>
            <div className="pdetail-cr8-stat">
              <span className="pdetail-cr8-stat-l">Deliverables</span>
              {askDeliverables > 0 ? (
                <span className="pdetail-cr8-stat-v">{askDeliverables}</span>
              ) : (
                <span className="pdetail-cr8-stat-v is-empty">None set</span>
              )}
              <span className="pdetail-cr8-stat-was">Proposed · no deal yet</span>
            </div>
            {tagsCell}
          </div>

          {editTagsPanel}

          {pitch.deliverables.length > 0 ? (
            <div className="pdetail-cr8-card-deliv-wrap">
              <div className="pdetail-cr8-card-deliv-h">
                Proposed deliverables
                <span className="pdetail-cr8-card-deliv-h-meta">from original pitch</span>
              </div>
              <ol className="pdetail-cr8-card-deliv">
                {pitch.deliverables.map((d, i) => (
                  <li key={i}>
                    <span>{d}</span>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}

          <div className="pdetail-cr8-card-foot">
            <button
              type="button"
              className="pdetail-cr8-start-tracking"
              onClick={onStartTrackingDeal}
            >
              Start tracking deal
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

// Edit-deal form — sub-component so React mounts a fresh state instance each
// time the user enters edit mode (initialized from `deal` at mount time). The
// alternative (useEffect resetting draft state on `editing` prop flip) trips
// react-hooks/set-state-in-effect.
interface DealCardEditFormProps {
  deal: Deal
  askBudget: string | null
  stageBtn: React.ReactNode
  tagsCell: React.ReactNode
  onSave: (draft: DealCardDraft) => Promise<void>
  onCancel: () => void
}

function DealCardEditForm({
  deal,
  askBudget,
  stageBtn,
  tagsCell,
  onSave,
  onCancel,
}: DealCardEditFormProps) {
  const [draftBudget, setDraftBudget] = useState<string>(
    deal.current_budget_amount?.toString() ?? '',
  )
  const [draftCurrency, setDraftCurrency] = useState<string>(
    deal.current_budget_currency ?? '',
  )
  const [draftDeliverables, setDraftDeliverables] = useState<string[]>([
    ...deal.current_deliverables,
  ])
  const [draftScope, setDraftScope] = useState<string>(deal.current_scope_notes ?? '')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  async function handleSave() {
    const parsedBudget = draftBudget.trim() === '' ? null : Number(draftBudget)
    if (parsedBudget != null && !Number.isFinite(parsedBudget)) {
      setSaveError('Budget must be a number or empty.')
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      await onSave({
        current_budget_amount: parsedBudget,
        current_budget_currency: draftCurrency.trim() || null,
        current_deliverables: draftDeliverables.map((d) => d.trim()).filter(Boolean),
        current_scope_notes: draftScope.trim() || null,
      })
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="pdetail-cr8-card">
      <div className="pdetail-cr8-card-r1">{stageBtn}</div>

      <div className="pdetail-cr8-card-stats">
        <div className="pdetail-cr8-stat">
          <span className="pdetail-cr8-stat-l">Budget</span>
          <input
            className="pdetail-cr8-edit-input"
            value={draftBudget}
            onChange={(e) => setDraftBudget(e.target.value)}
            placeholder="0"
            inputMode="decimal"
          />
          {askBudget ? (
            <span className="pdetail-cr8-stat-was">
              Original ask · <b>{askBudget}</b>
            </span>
          ) : null}
        </div>
        <div className="pdetail-cr8-stat">
          <span className="pdetail-cr8-stat-l">Deliverables</span>
          <span className="pdetail-cr8-stat-v">{draftDeliverables.length}</span>
          <span className="pdetail-cr8-stat-was">Edit list below</span>
        </div>
        {tagsCell}
      </div>

      <div className="pdetail-cr8-card-deliv-wrap">
        <div className="pdetail-cr8-card-deliv-h">
          Deliverables · edit
          <span className="pdetail-cr8-card-deliv-h-meta">
            {draftDeliverables.length} items
          </span>
        </div>
        <ul className="pdetail-cr8-deliv-edit">
          {draftDeliverables.map((d, i) => (
            <li key={i}>
              <input
                value={d}
                onChange={(e) => {
                  const next = [...draftDeliverables]
                  next[i] = e.target.value
                  setDraftDeliverables(next)
                }}
              />
              <button
                type="button"
                className="pdetail-cr8-deliv-edit-remove"
                onClick={() =>
                  setDraftDeliverables(draftDeliverables.filter((_, j) => j !== i))
                }
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="pdetail-cr8-deliv-edit-add"
          onClick={() => setDraftDeliverables([...draftDeliverables, ''])}
        >
          Add deliverable
        </button>
      </div>

      <div>
        <div
          className="pdetail-cr8-card-deliv-h"
          style={{ borderBottom: 'none', paddingBottom: 6 }}
        >
          Scope notes
        </div>
        <textarea
          className="pdetail-cr8-edit-textarea"
          value={draftScope}
          onChange={(e) => setDraftScope(e.target.value)}
          placeholder="Negotiation context, scope clarifications, exclusivity terms…"
        />
        <div style={{ marginTop: 8 }}>
          <input
            className="pdetail-cr8-edit-input"
            value={draftCurrency}
            onChange={(e) => setDraftCurrency(e.target.value)}
            placeholder="Currency (e.g. USD)"
            style={{ fontSize: 14, padding: '8px 10px' }}
          />
        </div>
      </div>

      {saveError ? (
        <div
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 11,
            color: 'var(--accent)',
            padding: '0 4px',
          }}
        >
          {saveError}
        </div>
      ) : null}

      <div className="pdetail-cr8-edit-foot">
        <button
          type="button"
          className="pdetail-cr8-edit-cancel"
          onClick={onCancel}
          disabled={saving}
        >
          Cancel
        </button>
        <button
          type="button"
          className="pdetail-cr8-edit-save"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Saving…' : 'Save deal'}
        </button>
      </div>
    </div>
  )
}
