'use client'

import type { MouseEvent } from 'react'

export interface ChipSelectorOption {
  id: string
  label: string
}

interface ChipSelectorBaseProps {
  axis: string
  options: ChipSelectorOption[]
  disabled?: boolean
}

interface ChipSelectorRadioProps extends ChipSelectorBaseProps {
  kind: 'radio'
  value: string | null
  onChange: (next: string) => void
}

interface ChipSelectorCheckboxProps extends ChipSelectorBaseProps {
  kind: 'checkbox'
  value: string[]
  onChange: (next: string[]) => void
}

export type ChipSelectorProps = ChipSelectorRadioProps | ChipSelectorCheckboxProps

// Multi-axis chip editor per CR-2 spec §4 AC4.5. Visual contract:
// `docs/design/design_handoff_supaspike_phase_a/crm/crm-styles.css` lines 2472–2588.
// Radio = circle marker, "Pick one" sub-pill. Checkbox = rounded-square marker,
// "Multi-select" sub-pill. Disabled = 0.45 opacity (0.7 for previously-selected)
// + dashed "Paused · legitimacy ≠ valid" pill + pointer-events:none. Selection
// state is PRESERVED across disable/enable cycles (no clear-on-pause).
export function ChipSelector(props: ChipSelectorProps) {
  const { axis, options, disabled } = props
  const isCheckbox = props.kind === 'checkbox'

  function handleClick(e: MouseEvent<HTMLButtonElement>, optionId: string) {
    e.preventDefault()
    if (disabled) return
    if (props.kind === 'radio') {
      // Radio: clicking enforces "exactly one selected" by construction (no
      // toggle-to-none). Re-click on current selection is a no-op.
      if (props.value !== optionId) props.onChange(optionId)
    } else {
      const next = props.value.includes(optionId)
        ? props.value.filter((v) => v !== optionId)
        : [...props.value, optionId]
      props.onChange(next)
    }
  }

  const isSelected = (id: string): boolean =>
    props.kind === 'checkbox'
      ? props.value.includes(id)
      : props.value === id

  return (
    <div className={'chip-selector' + (disabled ? ' is-disabled' : '')}>
      <span className="chip-selector-l">
        {axis}
        <span className="axis-kind">{isCheckbox ? 'Multi-select' : 'Pick one'}</span>
        {disabled ? (
          <span className="axis-paused">Paused · legitimacy ≠ valid</span>
        ) : null}
      </span>
      <div className="chip-selector-group">
        {options.map((o) => {
          const selected = isSelected(o.id)
          return (
            <button
              key={o.id}
              type="button"
              className={
                'chip-tag' +
                (isCheckbox ? ' is-checkbox' : '') +
                (selected ? ' is-selected' : '')
              }
              onClick={(e) => handleClick(e, o.id)}
              disabled={disabled}
            >
              {o.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
