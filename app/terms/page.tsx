import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Terms — SupaSpike',
  description: 'SupaSpike terms of service, plain English.',
}

export default function TermsPage() {
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
          <span className="kicker">Terms</span>
          <h1
            className="font-display text-ink"
            style={{
              fontSize: 'clamp(48px, 6vw, 80px)',
              lineHeight: 0.95,
              letterSpacing: '-0.03em',
              marginTop: '12px',
            }}
          >
            Terms.
          </h1>

          <p
            className="font-body text-ink"
            style={{ fontSize: '17px', lineHeight: 1.6, marginTop: '32px' }}
          >
            We&apos;re a small team in private beta. Plain English, what
            you&apos;re agreeing to:
          </p>

          <h2
            className="font-body text-ink"
            style={{ fontSize: '20px', fontWeight: 700, marginTop: '40px' }}
          >
            The basics
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
              SupaSpike is in private beta. Things may break. We&apos;ll fix
              them as we find them.
            </li>
            <li>
              Founder pricing ($30/month) locks for life if you sign up before
              public launch. We grandfather your rate forever.
            </li>
            <li>
              Your data is yours. You can delete it any time by emailing{' '}
              <a
                href="mailto:founder@supaspike.com"
                className="text-accent underline"
              >
                founder@supaspike.com
              </a>{' '}
              — done within 7 days. Export ships when it ships.
            </li>
          </ul>

          <h2
            className="font-body text-ink"
            style={{ fontSize: '20px', fontWeight: 700, marginTop: '32px' }}
          >
            What we ask
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
              Don&apos;t paste content you&apos;re not legally allowed to share
              — signed NDAs, confidential contracts, etc.
            </li>
            <li>
              Don&apos;t abuse the system: no spam, no scraping, no using
              SupaSpike to do something illegal.
            </li>
            <li>
              We may suspend accounts that violate the above. We&apos;ll email
              you first if it&apos;s not obvious.
            </li>
          </ul>

          <h2
            className="font-body text-ink"
            style={{ fontSize: '20px', fontWeight: 700, marginTop: '32px' }}
          >
            No warranty for now
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
              We use SupaSpike ourselves every day, but it&apos;s still a beta.
              Don&apos;t run mission-critical workflows on it yet.
            </li>
          </ul>

          <p
            className="font-body text-ink"
            style={{ fontSize: '17px', lineHeight: 1.6, marginTop: '32px' }}
          >
            <strong>If something goes wrong</strong> — email{' '}
            <a
              href="mailto:founder@supaspike.com"
              className="text-accent underline"
            >
              founder@supaspike.com
            </a>
            . A real human reads it.
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
