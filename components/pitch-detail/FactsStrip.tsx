import type { Pitch } from '@/lib/types/pitch'
import { formatRelativeTime } from '@/lib/format'

interface FactsStripProps {
  pitch: Pitch
}

export function FactsStrip({ pitch }: FactsStripProps) {
  const senderEmail = pitch.sender_email
  const hasSender = Boolean(pitch.sender_name || senderEmail)
  const hasDeadline = Boolean(pitch.deadline)
  if (!hasSender && !hasDeadline) return null

  return (
    <div className="pdetail-cr8-facts">
      <div className="pdetail-cr8-facts-cell">
        <span className="pdetail-cr8-facts-l">Sender</span>
        {hasSender ? (
          <span className="pdetail-cr8-facts-v">
            {pitch.sender_name || senderEmail}
          </span>
        ) : (
          <span className="pdetail-cr8-facts-v is-empty">Not stated</span>
        )}
        {pitch.sender_name && senderEmail ? (
          <span className="pdetail-cr8-facts-sub">{senderEmail}</span>
        ) : null}
      </div>
      <div className="pdetail-cr8-facts-cell">
        <span className="pdetail-cr8-facts-l">Deadline</span>
        {pitch.deadline ? (
          <span className="pdetail-cr8-facts-v">{pitch.deadline}</span>
        ) : (
          <span className="pdetail-cr8-facts-v is-empty">Open</span>
        )}
        {pitch.deadline ? (
          <span className="pdetail-cr8-facts-sub">
            {formatRelativeTime(pitch.deadline)}
          </span>
        ) : null}
      </div>
    </div>
  )
}
