import { Spinner } from '@/components/Spinner'

// FR-8 smoke-fix 2026-06-01 — scoped Suspense boundary for the contact-detail
// route. Without this, navigation from /app/people (list) → /app/people/[person]
// blocks on the page server-component's awaits (auth + contact resolve +
// contact_brands + contact_pitches + pitches + deals — RLS-protected, ~200–500ms).
// With this, Next.js renders the spinner INSTANTLY on URL change; the page
// swaps in when the data resolves. TopBar persists from the parent /app layout
// throughout — only the page slot shows the spinner.
//
// Mirrors /app/loading.tsx (parent) intentionally for visual consistency; the
// tighter scope at [person]/ is what makes the boundary fire on this transition.

export default function ContactDetailLoading() {
  return (
    <div className="page">
      <div
        className="flex flex-col items-center justify-center gap-3 text-ink-3"
        style={{ minHeight: '60vh' }}
      >
        <Spinner className="h-6 w-6" />
        <span className="kicker">Loading contact</span>
      </div>
    </div>
  )
}
