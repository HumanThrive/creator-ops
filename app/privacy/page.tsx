import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Privacy — SupaSpike',
  description: 'How SupaSpike handles your data, plain English.',
}

export default function PrivacyPage() {
  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink">
      <header
        className="sticky top-0 z-50 flex w-full items-center justify-between border-b border-line"
        style={{
          padding: '18px clamp(20px, 4vw, 56px)',
          background: 'color-mix(in oklab, var(--paper) 92%, transparent)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
        }}
      >
        <Link href="/" className="wordmark text-lg" aria-label="Back to landing">
          SupaSpike<sup>®</sup>
        </Link>
      </header>

      <main
        className="flex-1"
        style={{ padding: '70px clamp(20px, 4vw, 56px) 110px' }}
      >
        <div style={{ maxWidth: '640px', margin: '0 auto' }}>
          <span className="kicker">Privacy</span>
          <h1
            className="font-display text-ink"
            style={{
              fontSize: 'clamp(48px, 6vw, 80px)',
              lineHeight: 0.95,
              letterSpacing: '-0.03em',
              marginTop: '12px',
            }}
          >
            Privacy.
          </h1>

          <p
            className="font-body text-ink"
            style={{ fontSize: '17px', lineHeight: 1.6, marginTop: '32px' }}
          >
            We&apos;re a small team building SupaSpike. Here&apos;s how we handle
            your data, plain English.
          </p>

          <h2
            className="font-body text-ink"
            style={{ fontSize: '20px', fontWeight: 700, marginTop: '40px' }}
          >
            What we collect
          </h2>
          <ul
            style={{
              marginTop: '12px',
              paddingLeft: '20px',
              fontSize: '17px',
              lineHeight: 1.6,
              listStyle: 'disc',
            }}
          >
            <li>Your email when you join the waitlist or sign up.</li>
            <li>The pitches you paste in and the brand data you save.</li>
            <li>
              Basic request logs (what page you visited, when) — standard Vercel
              hosting telemetry.
            </li>
          </ul>

          <h2
            className="font-body text-ink"
            style={{ fontSize: '20px', fontWeight: 700, marginTop: '32px' }}
          >
            Where it lives
          </h2>
          <ul
            style={{
              marginTop: '12px',
              paddingLeft: '20px',
              fontSize: '17px',
              lineHeight: 1.6,
              listStyle: 'disc',
            }}
          >
            <li>
              Your account and pitches are in Supabase (US datacenter), gated by
              row-level security. Only you can read your data — not us, not
              other users.
            </li>
            <li>
              Pitch text is sent to Anthropic&apos;s Claude API for extraction.
              Anthropic doesn&apos;t retain it past the request per their API
              terms.
            </li>
            <li>Email is routed via Cloudflare to a Founder inbox.</li>
          </ul>

          <h2
            className="font-body text-ink"
            style={{ fontSize: '20px', fontWeight: 700, marginTop: '32px' }}
          >
            What we don&apos;t do
          </h2>
          <ul
            style={{
              marginTop: '12px',
              paddingLeft: '20px',
              fontSize: '17px',
              lineHeight: 1.6,
              listStyle: 'disc',
            }}
          >
            <li>We don&apos;t sell your email or your data.</li>
            <li>We don&apos;t read your pitches.</li>
            <li>
              We don&apos;t send marketing blasts beyond launch updates and
              occasional product news you can unsubscribe from.
            </li>
          </ul>

          <p
            className="font-body text-ink"
            style={{ fontSize: '17px', lineHeight: 1.6, marginTop: '32px' }}
          >
            <strong>Want your data deleted?</strong> Email{' '}
            <a
              href="mailto:founder@supaspike.com"
              className="text-accent underline"
            >
              founder@supaspike.com
            </a>{' '}
            — done within 7 days.
          </p>

          <p
            className="font-body text-ink-3"
            style={{ fontSize: '15px', lineHeight: 1.6, marginTop: '24px' }}
          >
            Questions:{' '}
            <a
              href="mailto:founder@supaspike.com"
              className="text-accent underline"
            >
              founder@supaspike.com
            </a>
            .
          </p>

          <p
            className="font-mono text-ink-3"
            style={{
              fontSize: '13px',
              marginTop: '48px',
              letterSpacing: '0.05em',
            }}
          >
            LAST UPDATED · 2026-05-07
          </p>
        </div>
      </main>

      <footer className="foot">
        <div className="foot-inner">
          <div className="foot-brand">
            SupaSpike<sup>®</sup>
          </div>
          <div className="foot-meta">
            <span>© 2026 SupaSpike</span>
            <a href="mailto:founder@supaspike.com">founder@supaspike.com</a>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
