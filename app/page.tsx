import type { Metadata } from 'next'
import Link from 'next/link'
import WaitlistForm from '@/components/WaitlistForm'

export const metadata: Metadata = {
  title: 'SupaSpike — Spike your brand deals',
  description:
    'SupaSpike pulls every brand pitch — email, Instagram, TikTok, anywhere — into your own brand-deal CRM. Track from pitch to paid. Built for creators running themselves.',
}

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink">
      {/* Top bar */}
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <span className="wordmark text-lg">
          SupaSpike<sup>+</sup>
        </span>
        <Link href="/signin" className="btn-ghost">
          Sign in
        </Link>
      </header>

      {/* Hero */}
      <section className="px-6 pb-16 pt-12 sm:pt-20">
        <div className="mx-auto w-full max-w-5xl">
          <span className="kicker">Phase A · Brand-deal CRM</span>
          <h1
            className="font-display mt-6 uppercase text-ink"
            style={{
              fontSize: 'clamp(56px, 11vw, 160px)',
              lineHeight: 0.88,
              letterSpacing: '0.005em',
              margin: '24px 0 0',
            }}
          >
            Spike your
            <br />
            <em className="not-italic text-accent">brand deals.</em>
          </h1>
          <p className="font-body mt-10 max-w-2xl text-lg leading-relaxed text-ink-2">
            SupaSpike pulls every brand pitch — email, Instagram, TikTok,
            anywhere — into your own brand-deal CRM. Track from pitch to paid.
            Built for creators running themselves.
          </p>
          <div className="mt-10 max-w-xl">
            <span className="signin-label mb-3 block">Drop your email</span>
            <WaitlistForm />
            <p className="mt-4 font-mono text-xs uppercase tracking-wider text-ink-4">
              Follow{' '}
              <a
                href="https://x.com/supaspikehq"
                className="text-ink hover:text-accent"
              >
                @supaspikehq
              </a>{' '}
              on X for daily build updates →
            </p>
          </div>
        </div>
      </section>

      {/* How it works (value props) */}
      <section className="px-6 py-16 sm:py-24">
        <div className="mx-auto max-w-5xl">
          <span className="kicker mb-8 block">
            Three moves · zero spreadsheets
          </span>
          <div className="grid gap-4 sm:grid-cols-3">
            <ValueCard
              title="Your brand-deal database, built as you go."
              body="Every pitch you paste — email, IG DM, TikTok, anywhere — becomes part of your own structured CRM of brand relationships. Your data, owned by you. Building an asset, not just dumping into a tool."
            />
            <ValueCard
              title="Paste the pitch. We extract the deal."
              body="Brand name, deliverables, budget, deadline, category — extracted from any pitch in seconds. No spreadsheet typing. Every paste adds a structured record to your CRM."
            />
            <ValueCard
              title="Every deal, from inbox to paid."
              body="Four stages — Inbox, Negotiating, Confirmed, Delivered & Paid. See your whole pipeline at a glance. Nothing falls through. Nothing gets forgotten."
            />
          </div>
        </div>
      </section>

      {/* Demo */}
      <section className="px-6 py-16 sm:py-24">
        <div className="mx-auto max-w-5xl">
          <span className="kicker block">Day one</span>
          <h2
            className="font-display mt-4 uppercase text-ink"
            style={{
              fontSize: 'clamp(40px, 6vw, 84px)',
              lineHeight: 0.9,
              letterSpacing: '0.005em',
            }}
          >
            Your dashboard,
            <br />
            <em className="not-italic text-accent">day one.</em>
          </h2>
          <p className="font-body mt-6 max-w-2xl text-lg text-ink-3">
            Every pitch, sorted. Every deal, tracked. No spreadsheets harmed.
          </p>
          <div className="mt-10">
            <div className="aspect-video w-full overflow-hidden rounded-md border border-line-2 bg-paper-2">
              {/* Screenshot placeholder — swapped to /public/dashboard.png by task #13 */}
              <div className="flex h-full w-full items-center justify-center font-mono text-xs uppercase tracking-wider text-ink-4">
                Dashboard preview
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="px-6 py-16 sm:py-24">
        <div className="mx-auto max-w-3xl">
          <span className="kicker block">Pricing</span>
          <h2
            className="font-display mt-4 uppercase text-ink"
            style={{
              fontSize: 'clamp(48px, 7vw, 96px)',
              lineHeight: 0.88,
              letterSpacing: '0.005em',
            }}
          >
            <em className="not-italic text-accent">$0</em>
            <span className="font-mono ml-3 text-base align-baseline text-ink-3">
              FREE IN BETA
            </span>
          </h2>
          <p className="font-body mt-6 text-base leading-relaxed text-ink-2">
            $30/mo at public launch — founder pricing locks in for life if you
            join now. Free tier stays for creators 1k–5k climbing toward
            monetization.
          </p>
        </div>
      </section>

      {/* Email capture (closing) */}
      <section className="bg-ink px-6 py-20">
        <div className="mx-auto max-w-3xl">
          <span className="kicker" style={{ color: 'rgba(255,255,255,0.6)' }}>
            Get in
          </span>
          <h2
            className="font-display mt-4 uppercase text-paper"
            style={{
              fontSize: 'clamp(40px, 6vw, 80px)',
              lineHeight: 0.9,
              letterSpacing: '0.005em',
            }}
          >
            Stop losing pitches
            <br />
            to <em className="not-italic text-accent">your inbox.</em>
          </h2>
          <p className="font-body mt-6 max-w-xl text-base text-paper opacity-80">
            Drop your email. We&apos;ll let you in early.
          </p>
          <div className="mt-8 max-w-xl">
            <WaitlistForm />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t border-line px-6 py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 font-mono text-xs uppercase tracking-wider text-ink-4 sm:flex-row">
          <span>© 2026 SUPASPIKE</span>
          <div className="flex items-center gap-6">
            <a
              href="mailto:founder@supaspike.com"
              className="hover:text-ink"
            >
              FOUNDER@SUPASPIKE.COM
            </a>
            <Link href="/signin" className="hover:text-ink">
              SIGN IN
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}

function ValueCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-md border border-line-2 bg-paper p-6">
      <h3
        className="font-display uppercase text-ink"
        style={{
          fontSize: 22,
          lineHeight: 1.05,
          letterSpacing: '0.005em',
        }}
      >
        {title}
      </h3>
      <p className="font-body mt-4 text-sm leading-relaxed text-ink-3">{body}</p>
    </div>
  )
}
