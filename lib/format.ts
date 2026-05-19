// Tiny formatting helpers shared across the CRM surface.

import type { PitchSourceChannel } from './types/pitch'

const SOURCE_CHANNEL_LABELS: Record<PitchSourceChannel, string> = {
  email: 'Email',
  ig_dm: 'IG DM',
  tiktok_dm: 'TikTok DM',
  whatsapp: 'WhatsApp',
  linkedin_dm: 'LinkedIn DM',
  x_dm: 'X DM',
  other: 'Other',
}

/**
 * FR-6 2026-05-19 — display label for pitches.source_channel.
 * NULL renders as em-dash `—` (CR-6 NULL-fallback convention); unknown
 * non-null values fall through to the raw string so a legacy/un-typed value
 * never leaks `undefined` to the UI.
 */
export function formatSourceChannel(channel: string | null): string {
  if (!channel) return '—'
  return SOURCE_CHANNEL_LABELS[channel as PitchSourceChannel] ?? channel
}


const MS_PER_DAY = 1000 * 60 * 60 * 24

export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso)
  const diffMs = now.getTime() - then.getTime()
  if (diffMs < 0) return 'Just now'

  const diffDays = Math.floor(diffMs / MS_PER_DAY)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7)
    return weeks === 1 ? '1 week ago' : `${weeks} weeks ago`
  }
  if (diffDays < 365) {
    const months = Math.floor(diffDays / 30)
    return months === 1 ? '1 month ago' : `${months} months ago`
  }
  const years = Math.floor(diffDays / 365)
  return years === 1 ? '1 year ago' : `${years} years ago`
}

function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

/**
 * CR-6 2026-05-19 — fine-grained relative time used by PitchFeed.
 * Same-calendar-day events render at hour/minute resolution ("4 hours ago",
 * "23 minutes ago", "Just now"). Cross-day events use calendar-day
 * resolution ("Yesterday", "3 days ago", "2 weeks ago"). Calendar-aware
 * boundary fixes the diff-ms edge case where a pitch from 11pm yesterday
 * read at 8am today incorrectly showed "Today" under formatRelativeTime.
 */
export function formatRelativeTimeFine(iso: string, now: Date = new Date()): string {
  const then = new Date(iso)
  const diffMs = now.getTime() - then.getTime()
  if (diffMs < 0) return 'Just now'

  if (isSameLocalDay(then, now)) {
    const diffMinutes = Math.floor(diffMs / 60000)
    if (diffMinutes < 1) return 'Just now'
    if (diffMinutes < 60) {
      return diffMinutes === 1 ? '1 minute ago' : `${diffMinutes} minutes ago`
    }
    const diffHours = Math.floor(diffMinutes / 60)
    return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`
  }

  // Cross-day path — calendar-aware day diff so the "Today"/"Yesterday"
  // boundary respects local midnight, not 24-hour windows.
  const thenMid = new Date(
    then.getFullYear(),
    then.getMonth(),
    then.getDate(),
  ).getTime()
  const nowMid = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime()
  const calDays = Math.round((nowMid - thenMid) / MS_PER_DAY)
  if (calDays === 1) return 'Yesterday'
  if (calDays < 7) return `${calDays} days ago`
  if (calDays < 30) {
    const weeks = Math.floor(calDays / 7)
    return weeks === 1 ? '1 week ago' : `${weeks} weeks ago`
  }
  if (calDays < 365) {
    const months = Math.floor(calDays / 30)
    return months === 1 ? '1 month ago' : `${months} months ago`
  }
  const years = Math.floor(calDays / 365)
  return years === 1 ? '1 year ago' : `${years} years ago`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function formatFullDate(iso: string): string {
  const d = new Date(iso)
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
}

/**
 * CR-6 2026-05-19 — used by the PitchDetail History timeline. Same-day
 * activities render relative ("4 hours ago", "Just now"); older activities
 * render as the canonical "Mon D, YYYY" full date.
 */
export function formatTodayRelativeElseFullDate(
  iso: string,
  now: Date = new Date(),
): string {
  const then = new Date(iso)
  if (isSameLocalDay(then, now)) return formatRelativeTimeFine(iso, now)
  return formatFullDate(iso)
}
