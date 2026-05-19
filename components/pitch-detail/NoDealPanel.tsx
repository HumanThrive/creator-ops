// Legitimacy slugs that drive the NoDealPanel variant. Other compensation
// tags don't surface the panel.
export type LegitimacyVariant =
  | 'valid'
  | 'low_quality'
  | 'spam_or_scam'
  | 'unclear'
  | 'not_a_pitch'

interface NoDealPanelProps {
  legitimacy: LegitimacyVariant | null
  onStartTracking: () => void
  onDeletePitch: () => void
}

// Variant copy. Voice register: confident, slightly polished (handbook §2.2).
const SPAM_OR_SCAM_BODY = (
  <>
    <b>No deal attached.</b>{' '}
    This pitch was filtered as <b>spam / scam</b>. Keep as audit record or
    delete from the footer.
  </>
)

const NOT_A_PITCH_BODY = (
  <>
    <b>No deal attached.</b>{' '}
    This message was filtered as <b>not a pitch</b>. Keep as audit record or
    delete from the footer.
  </>
)

const LOW_QUALITY_BODY = (
  <>
    <b>No deal attached.</b>{' '}
    The AI flagged this as <b>low quality</b>. Track it anyway, or clear it
    from your queue.
  </>
)

const UNCLEAR_BODY = (
  <>
    <b>No deal attached.</b>{' '}
    The pitch is <b>unclear</b> — start tracking once you&rsquo;ve followed up
    and know what&rsquo;s on the table.
  </>
)

const VALID_BODY = (
  <>
    <b>No deal attached yet.</b>{' '}
    Start tracking once you&rsquo;ve replied — current values, stage, and notes
    accumulate on the deal arc.
  </>
)

export function NoDealPanel({
  legitimacy,
  onStartTracking,
  onDeletePitch,
}: NoDealPanelProps) {
  if (legitimacy === 'spam_or_scam' || legitimacy === 'not_a_pitch') {
    return (
      <div className="pdetail-cr8-nodeal">
        <div className="pdetail-cr8-nodeal-t">
          {legitimacy === 'spam_or_scam' ? SPAM_OR_SCAM_BODY : NOT_A_PITCH_BODY}
        </div>
      </div>
    )
  }

  if (legitimacy === 'low_quality') {
    return (
      <div className="pdetail-cr8-nodeal">
        <div className="pdetail-cr8-nodeal-t">{LOW_QUALITY_BODY}</div>
        <button
          type="button"
          className="pdetail-cr8-nodeal-cta"
          onClick={onStartTracking}
        >
          Start tracking deal
        </button>
        <button
          type="button"
          className="pdetail-cr8-edit-cancel"
          onClick={onDeletePitch}
        >
          Delete pitch
        </button>
      </div>
    )
  }

  // valid + unclear + null → encourage tracking
  return (
    <div className="pdetail-cr8-nodeal">
      <div className="pdetail-cr8-nodeal-t">
        {legitimacy === 'unclear' ? UNCLEAR_BODY : VALID_BODY}
      </div>
      <button
        type="button"
        className="pdetail-cr8-nodeal-cta"
        onClick={onStartTracking}
      >
        Start tracking deal
      </button>
    </div>
  )
}

// Helper for callers that hold the full pitch tag-set (legitimacy + compensation
// mixed). Returns the legitimacy slug if present, else null. Compensation slugs
// don't drive the panel variant.
const LEGITIMACY_SLUGS: ReadonlySet<string> = new Set([
  'valid',
  'low_quality',
  'spam_or_scam',
  'unclear',
  'not_a_pitch',
])

export function pickLegitimacy(slugs: readonly string[]): LegitimacyVariant | null {
  for (const slug of slugs) {
    if (LEGITIMACY_SLUGS.has(slug)) return slug as LegitimacyVariant
  }
  return null
}
