'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createClient } from '@/lib/supabase/client'

// FR-7 W68 — EntityTypeahead v2
//
// Per design canon CR-7 Surface D HTML + CLAUDE.md §7 item 41. Single reusable
// component for Brand and Contact typeahead in two contexts:
//   - AddPitchModal (W68) — resolution-at-submit override per AC7.2
//   - EditDetailsOverlay (W69) — immediate re-link per AC7.2
//
// W68 v1 scope:
//   - Search + select existing entity (debounced query against Supabase)
//   - "Create new <X>" affordance per AC7.3
//   - Brand create-new: simple (typed name → string passed through; W66 API
//     route auto-creates on save)
//   - Contact create-new: opens full channel-aware inline form per Gap 2 (b)
//     Founder lock — 9-kind picker, multi-channel rows, role chips
//   - Default no-typeahead-action per AC7.6 (user can free-type without
//     opening the dropdown; W66 API route auto-resolves from string values)
//
// Out of scope at W68:
//   - Brand-scoped Contact filter + scope toggle (Surface D v2 feature)
//   - Glanceable detail rows (.is-active reveal of brand-chain + channels)
//   - "Uncommitted" state pill / Save-gate
//   - Search-match mark highlighting

export type ChannelKind =
  | 'Email'
  | 'IG'
  | 'TikTok'
  | 'WhatsApp'
  | 'X'
  | 'IRL'
  | 'Facebook'
  | 'LinkedIn'
  | 'Website'

const CHANNEL_KINDS: ChannelKind[] = [
  'Email',
  'IG',
  'TikTok',
  'WhatsApp',
  'X',
  'IRL',
  'Facebook',
  'LinkedIn',
  'Website',
]

const CHANNEL_KIND_CLASS: Record<ChannelKind, string> = {
  Email: 'ch-email',
  IG: 'ch-ig',
  TikTok: 'ch-tt',
  WhatsApp: 'ch-wa',
  X: 'ch-x',
  IRL: 'ch-irl',
  Facebook: 'ch-facebook',
  LinkedIn: 'ch-linkedin',
  Website: 'ch-website',
}

const CHANNEL_PLACEHOLDER: Record<ChannelKind, string> = {
  Email: 'sarah@brand.co',
  IG: '@sarah.brand',
  TikTok: '@sarahb',
  WhatsApp: '+1 555 0100',
  X: '@sarahb',
  IRL: 'Met at IRL conf 2025',
  Facebook: 'facebook.com/sarah.brand',
  LinkedIn: 'linkedin.com/in/sarahb',
  Website: 'sarahbrand.com',
}

export interface ChannelEntry {
  kind: ChannelKind
  identifier: string
  primary: boolean
}

const ROLE_OPTIONS = ['PR', 'Brand team', 'Connector', 'Founder', 'Other'] as const
export type ContactRole = (typeof ROLE_OPTIONS)[number]

export interface BrandMatch {
  id: string
  name: string
}

export interface ContactMatch {
  id: string
  display_name: string | null
  channels: ChannelEntry[]
}

export interface ContactCreatePayload {
  display_name: string | null
  channels: ChannelEntry[]
  role: ContactRole | null
}

type Props =
  | {
      kind: 'brand'
      value: string
      onChange: (value: string) => void
      onSelectExisting: (entity: BrandMatch | null) => void
      onCreateNew: (typed: string) => void
      placeholder?: string
      disabled?: boolean
      // Chip state lifted to parent (defect 2.1-fix v2): internal state was
      // resetting between renders for reasons we couldn't pin down; parent
      // state survives any child remount.
      selected: { label: string } | null
      onSelectedChange: (s: { label: string } | null) => void
    }
  | {
      kind: 'contact'
      value: string
      onChange: (value: string) => void
      onSelectExisting: (entity: ContactMatch | null) => void
      onCreateNew: (payload: ContactCreatePayload) => void
      placeholder?: string
      disabled?: boolean
      seedEmail?: string | null
      selected: { label: string } | null
      onSelectedChange: (s: { label: string } | null) => void
    }

export function EntityTypeahead(props: Props) {
  const { kind, value, onChange, placeholder, disabled, selected, onSelectedChange } = props
  const supabase = useMemo(() => createClient(), [])
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [brandResults, setBrandResults] = useState<BrandMatch[]>([])
  const [contactResults, setContactResults] = useState<ContactMatch[]>([])
  const wrapRef = useRef<HTMLDivElement | null>(null)
  // Phantom-click guard: when user clicks a dropdown row, React renders the
  // chip mode (with X button at the same screen position as the row) FAST.
  // The same physical click event can then re-dispatch to the X button,
  // immediately clearing the just-made selection. Suppress handleClearSelection
  // within 300ms of any selection.
  const lastSelectionAtRef = useRef<number>(0)

  // Close on outside click
  useEffect(() => {
    if (!open && !creating) return
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current) return
      if (!wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
        setCreating(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open, creating])

  // Debounced search — only fires when dropdown is open + input non-empty.
  // We don't reset results in the empty branch because the dropdown is
  // hidden whenever value is empty (per render condition below); stale
  // results aren't visible.
  useEffect(() => {
    const text = value.trim()
    if (!text || !open) return
    const t = setTimeout(async () => {
      if (kind === 'brand') {
        const { data } = await supabase
          .from('brands')
          .select('id, name')
          .ilike('name', `%${text}%`)
          .order('name')
          .limit(8)
        setBrandResults((data as BrandMatch[]) ?? [])
      } else {
        const { data } = await supabase
          .from('contacts')
          .select('id, display_name, channels')
          .ilike('display_name', `%${text}%`)
          .order('display_name', { nullsFirst: false })
          .limit(8)
        setContactResults((data as ContactMatch[]) ?? [])
      }
    }, 180)
    return () => clearTimeout(t)
  }, [value, open, kind, supabase])

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    onChange(e.target.value)
    setOpen(true)
  }

  // Selection handlers: DO NOT call onChange after onSelectExisting. The
  // parent's onChange handler clears the entity-id override (treating any
  // change as "user is free-typing"), so calling onChange here would defeat
  // the override that onSelectExisting just set. Parent's onSelectExisting
  // handler is the one responsible for updating the underlying text value
  // (via updateField('brand_name', ...) etc.); the input's `value` prop will
  // reflect the new text on next render. In chip mode the input isn't even
  // shown, so input-text sync isn't required at selection time.
  function handleSelectBrand(brand: BrandMatch) {
    if (props.kind !== 'brand') return
    props.onSelectExisting(brand)
    onSelectedChange({ label: brand.name })
    lastSelectionAtRef.current = Date.now()
    setOpen(false)
  }

  function handleSelectContact(contact: ContactMatch) {
    if (props.kind !== 'contact') return
    props.onSelectExisting(contact)
    onSelectedChange({ label: contact.display_name ?? '(no name)' })
    lastSelectionAtRef.current = Date.now()
    setOpen(false)
  }

  function handleBrandCreate() {
    if (props.kind !== 'brand') return
    const typed = value.trim()
    props.onCreateNew(typed)
    onSelectedChange({ label: typed })
    lastSelectionAtRef.current = Date.now()
    setOpen(false)
  }

  function openContactCreating() {
    setOpen(false)
    setCreating(true)
  }

  function handleClearSelection() {
    // Phantom-click guard: ignore X button clicks that fire within 300ms of
    // a selection (likely the same physical user click re-dispatched to the
    // X button due to fast DOM mutation between event phases).
    const sinceSelect = Date.now() - lastSelectionAtRef.current
    if (sinceSelect < 300) {
      console.warn('[ETA] handleClearSelection IGNORED (phantom click; sinceSelect=' + sinceSelect + 'ms)')
      return
    }
    onSelectedChange(null)
    props.onSelectExisting(null)
    onChange('') // clear the input text on Clear (parent state syncs)
  }

  const results = kind === 'brand' ? brandResults : contactResults
  const trimmed = value.trim()

  // Post-selection chip mode — replaces the input until user clicks Clear.
  // Dropdown can't reopen because the input is unmounted.
  if (selected) {
    return (
      <div className="ta is-selected" ref={wrapRef}>
        <div className="ta-selected">
          <div className={`ta-row-avatar ${kind === 'brand' ? 'is-brand' : ''}`}>
            {initials(selected.label)}
          </div>
          <div className="ta-selected-glance">
            <span className="ta-row-name">{selected.label}</span>
          </div>
          <span className="ta-selected-mark">Linked</span>
          <button
            type="button"
            className="ta-selected-clear"
            onClick={handleClearSelection}
            aria-label="Clear selection"
          >
            ✕
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`ta ${open ? 'is-open' : ''} ${creating ? 'is-creating' : ''}`}
      ref={wrapRef}
    >
      <div className="ta-input-wrap">
        <input
          type="text"
          className="ta-input"
          value={value}
          onChange={handleInputChange}
          onFocus={() => {
            if (!creating) setOpen(true)
          }}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
        />
        <span className="ta-input-icon">⌄</span>
      </div>

      {open && !creating && trimmed.length > 0 && (
        <div className="ta-card">
          {results.length > 0 && (
            <div className="ta-rows">
              {kind === 'brand'
                ? brandResults.map((b) => (
                    <div
                      key={b.id}
                      className="ta-row"
                      onClick={() => handleSelectBrand(b)}
                    >
                      <div className="ta-row-avatar is-brand">
                        {initials(b.name)}
                      </div>
                      <div className="ta-row-glance">
                        <span className="ta-row-name">{b.name}</span>
                      </div>
                      <span className="ta-row-right">Existing</span>
                    </div>
                  ))
                : contactResults.map((c) => (
                    <div
                      key={c.id}
                      className="ta-row"
                      onClick={() => handleSelectContact(c)}
                    >
                      <div className="ta-row-avatar">
                        {initials(c.display_name)}
                      </div>
                      <div className="ta-row-glance">
                        <span className="ta-row-name">
                          {c.display_name ?? '(no name)'}
                        </span>
                        <span className="ta-row-context">
                          {c.channels?.slice(0, 4).map((ch, i) => (
                            <span
                              key={i}
                              className={`ch-dot ${CHANNEL_KIND_CLASS[ch.kind] ?? ''}`}
                            />
                          ))}
                        </span>
                      </div>
                      <span className="ta-row-right">Existing</span>
                    </div>
                  ))}
            </div>
          )}

          {kind === 'brand' && trimmed.length > 0 && (
            <div
              className={`ta-create ${results.length === 0 ? 'is-only' : ''}`}
              onClick={handleBrandCreate}
            >
              <div className="ta-create-glyph">+</div>
              <div className="ta-create-body">
                <span className="ta-create-name">
                  Create new brand: <em>{trimmed}</em>
                </span>
              </div>
              <span className="ta-row-right is-new">New</span>
            </div>
          )}
          {kind === 'contact' && trimmed.length > 0 && (
            <div
              className={`ta-create ${results.length === 0 ? 'is-only' : ''}`}
              onClick={openContactCreating}
            >
              <div className="ta-create-glyph">+</div>
              <div className="ta-create-body">
                <span className="ta-create-name">
                  Create new contact: <em>{trimmed}</em>
                </span>
              </div>
              <span className="ta-row-right is-new">New</span>
            </div>
          )}

        </div>
      )}

      {creating && props.kind === 'contact' && (
        <ContactCreateForm
          initialDisplayName={value.trim()}
          initialEmail={props.seedEmail ?? null}
          onSubmit={(payload) => {
            props.onCreateNew(payload)
            const label = payload.display_name?.trim() || value.trim() || '(no name)'
            onSelectedChange({ label })
            lastSelectionAtRef.current = Date.now()
            setCreating(false)
          }}
          onCancel={() => setCreating(false)}
        />
      )}
    </div>
  )
}

function ContactCreateForm({
  initialDisplayName,
  initialEmail,
  onSubmit,
  onCancel,
}: {
  initialDisplayName: string
  initialEmail: string | null
  onSubmit: (payload: ContactCreatePayload) => void
  onCancel: () => void
}) {
  const [displayName, setDisplayName] = useState(initialDisplayName)
  const [role, setRole] = useState<ContactRole | null>(null)
  const [channels, setChannels] = useState<ChannelEntry[]>(() => [
    {
      kind: 'Email',
      identifier: initialEmail ?? '',
      primary: true,
    },
  ])

  const setChannel = useCallback(
    (idx: number, patch: Partial<ChannelEntry>) => {
      setChannels((rows) =>
        rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)),
      )
    },
    [],
  )

  const togglePrimary = useCallback((idx: number) => {
    setChannels((rows) =>
      rows.map((r, i) => ({ ...r, primary: i === idx ? !r.primary : false })),
    )
  }, [])

  const addChannel = useCallback(() => {
    setChannels((rows) => [
      ...rows,
      { kind: 'Email', identifier: '', primary: rows.length === 0 },
    ])
  }, [])

  const removeChannel = useCallback((idx: number) => {
    setChannels((rows) => {
      const next = rows.filter((_, i) => i !== idx)
      // If removed row was primary and rows remain, mark first as primary
      if (next.length > 0 && !next.some((r) => r.primary)) {
        next[0] = { ...next[0], primary: true }
      }
      return next
    })
  }, [])

  // No <form> element — AddPitchModal already wraps in <form> and HTML
  // forbids nested forms (hydration error 3.1). Use a <div> + click handler.
  function handleSubmit() {
    const cleaned = channels
      .map((r) => ({ ...r, identifier: r.identifier.trim() }))
      .filter((r) => r.identifier.length > 0)
    onSubmit({
      display_name: displayName.trim() || null,
      channels: cleaned,
      role,
    })
  }

  return (
    <div className="ta-card">
      <div className="ta-create-form">
        <div className="ta-create-form-row">
          <label className="ta-create-form-l">Display name</label>
          <input
            type="text"
            className="ta-channel-input"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Sarah Chen"
            autoFocus
          />
        </div>

        <div className="ta-create-form-row">
          <label className="ta-create-form-l">
            Role
            <span className="ta-create-form-l-opt">optional</span>
          </label>
          <div className="ta-role-chips">
            {ROLE_OPTIONS.map((r) => (
              <button
                type="button"
                key={r}
                className={`ta-role-chip ${role === r ? 'is-on' : ''}`}
                onClick={() => setRole(role === r ? null : r)}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        <div className="ta-create-form-row">
          <label className="ta-create-form-l">Channels</label>
          <div className="ta-channel-rows">
            {channels.map((ch, idx) => (
              <div className="ta-channel-row" key={idx}>
                <span
                  className={`ta-channel-picker-wrap ${CHANNEL_KIND_CLASS[ch.kind]}`}
                >
                  <select
                    className="ta-channel-picker"
                    value={ch.kind}
                    onChange={(e) =>
                      setChannel(idx, { kind: e.target.value as ChannelKind })
                    }
                  >
                    {CHANNEL_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </select>
                </span>
                <input
                  type="text"
                  className="ta-channel-input"
                  value={ch.identifier}
                  onChange={(e) =>
                    setChannel(idx, { identifier: e.target.value })
                  }
                  placeholder={CHANNEL_PLACEHOLDER[ch.kind]}
                />
                <div style={{ display: 'inline-flex', gap: 6 }}>
                  <button
                    type="button"
                    className={`ta-channel-primary ${ch.primary ? 'is-on' : ''}`}
                    onClick={() => togglePrimary(idx)}
                  >
                    {ch.primary ? '★ Primary' : 'Primary'}
                  </button>
                  {channels.length > 1 && (
                    <button
                      type="button"
                      className="ta-channel-remove"
                      onClick={() => removeChannel(idx)}
                      aria-label="Remove channel"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            ))}
            <button
              type="button"
              className="ta-add-channel-btn"
              onClick={addChannel}
            >
              + Add another channel
            </button>
          </div>
        </div>
      </div>

      <div className="ta-create-foot">
        <button
          type="button"
          className="ta-scope-toggle"
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          type="button"
          className="ta-scope-toggle is-on"
          onClick={handleSubmit}
        >
          Create contact
        </button>
      </div>
    </div>
  )
}

function initials(name: string | null | undefined): string {
  if (!name) return '·'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '·'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
