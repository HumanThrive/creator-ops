import type { Activity } from '@/lib/types/activity'
import type { Pitch } from '@/lib/types/pitch'
import { formatActivityEvent } from '@/lib/activity-format'
import { formatFullDate, formatTodayRelativeElseFullDate } from '@/lib/format'
import { getMockSenderEmail, getMockSourceSubject } from '@/lib/pitch-mock'

interface HistoryTimelineProps {
  pitch: Pitch
  activities: Activity[]
  // CR-6 — the History timeline supports one inline-expanded `pitch_created`
  // event at a time, holding the verbatim raw_pitch_text. Parent owns the
  // open/close state so the modal's footer / scrim / mode prop can coordinate.
  expandedOriginal: boolean
  onToggleOriginal: () => void
}

export function HistoryTimeline({
  pitch,
  activities,
  expandedOriginal,
  onToggleOriginal,
}: HistoryTimelineProps) {
  // Newest first.
  const ordered = [...activities].sort(
    (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
  )
  const sourceSubject = getMockSourceSubject(pitch)
  const senderEmail = getMockSenderEmail(pitch)

  return (
    <section className="pdetail-cr8-section">
      <div className="pdetail-cr8-section-l">
        History
        <span className="pdetail-cr8-section-l-meta">
          {ordered.length} event{ordered.length === 1 ? '' : 's'} · newest first
        </span>
      </div>
      <div className="pdetail-cr8-history-list">
        {ordered.map((a) => {
          const isPitchEvent = a.type === 'pitch_created'
          const expand = isPitchEvent && expandedOriginal
          const event = formatActivityEvent(a)
          return (
            <div
              key={a.id}
              className={
                'pdetail-cr8-event' + (expand ? ' is-expanded' : '')
              }
            >
              <span className="pdetail-cr8-event-d">
                {formatTodayRelativeElseFullDate(a.created_at)}
              </span>
              <span className="pdetail-cr8-event-body">
                <b>{event.label}</b>
                {event.payload ? (
                  <span className="pdetail-cr8-event-sub">{event.payload}</span>
                ) : null}
                {isPitchEvent && sourceSubject ? (
                  <span className="pdetail-cr8-event-sub">
                    &quot;{sourceSubject}&quot;
                  </span>
                ) : null}
              </span>
              {isPitchEvent ? (
                <button
                  type="button"
                  className={
                    expand
                      ? 'pdetail-cr8-event-collapse'
                      : 'pdetail-cr8-event-link'
                  }
                  onClick={onToggleOriginal}
                >
                  {expand ? '↑ Collapse' : 'View original ↗'}
                </button>
              ) : null}

              {expand ? (
                <div className="pdetail-cr8-event-original">
                  <dl className="pdetail-cr8-event-original-head">
                    <dt>From</dt>
                    <dd>
                      {pitch.sender_name || '—'}
                      {senderEmail && pitch.sender_name ? (
                        <span className="pdetail-cr8-event-original-head-email">
                          {' '}&lt;{senderEmail}&gt;
                        </span>
                      ) : null}
                    </dd>
                    <dt>Subject</dt>
                    <dd>&quot;{sourceSubject}&quot;</dd>
                    <dt>Received</dt>
                    <dd className="is-mono">{formatFullDate(pitch.created_at)}</dd>
                  </dl>
                  <p className="pdetail-cr8-event-original-msg">
                    {pitch.raw_pitch_text}
                  </p>
                  <div className="pdetail-cr8-event-original-foot">
                    <span>
                      <b>AI extracted</b> · {pitch.deliverables.length} deliverable
                      {pitch.deliverables.length === 1 ? '' : 's'}
                      {pitch.deadline ? ` · ${pitch.deadline}` : ''}
                    </span>
                    <span>Verbatim · read-only</span>
                  </div>
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </section>
  )
}
