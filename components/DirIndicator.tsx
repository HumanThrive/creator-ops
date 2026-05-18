import type { PitchDirection } from '@/lib/types/pitch'

type DirIndicatorVariant = 'kicker' | 'ribbon' | 'chip'

interface DirIndicatorProps {
  direction: PitchDirection
  // CR-4 surface variants share the markup shape but keep their own CSS:
  //   'kicker' (default) — feed row + future surfaces; canonical `.dir`
  //   'ribbon' — PitchCard corner ribbon (`.card-dir`)
  //   'chip'   — PitchDetailModal head pill (`.pitch-modal-dirchip`)
  variant?: DirIndicatorVariant
  // Optional label override. Default: 'Inbound' / 'Outbound'.
  label?: string
}

const VARIANT_CLASSES: Record<
  DirIndicatorVariant,
  { wrapper: string; arrow: string }
> = {
  kicker: { wrapper: 'dir', arrow: 'dir-arrow' },
  ribbon: { wrapper: 'card-dir', arrow: '' },
  chip: { wrapper: 'pitch-modal-dirchip', arrow: 'pitch-modal-dirchip-arrow' },
}

const DEFAULT_LABEL: Record<PitchDirection, string> = {
  inbound: 'Inbound',
  outbound: 'Outbound',
}

export function DirIndicator({
  direction,
  variant = 'kicker',
  label,
}: DirIndicatorProps) {
  const isOutbound = direction === 'outbound'
  const cls = VARIANT_CLASSES[variant]
  const wrapperClass = cls.wrapper + (isOutbound ? ' is-outbound' : '')
  const resolvedLabel = label ?? DEFAULT_LABEL[direction]
  const arrowProps = cls.arrow ? { className: cls.arrow } : {}
  return (
    <span className={wrapperClass} aria-label={`Direction: ${direction}`}>
      <span aria-hidden {...arrowProps}>
        {isOutbound ? '↗' : '↘'}
      </span>
      {resolvedLabel}
    </span>
  )
}
