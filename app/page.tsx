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
      {/* Top bar — full-width per design */}
      <header
        className="flex w-full items-center justify-between border-b border-line"
        style={{ padding: '18px clamp(20px, 4vw, 56px)' }}
      >
        <span className="wordmark text-lg">
          SupaSpike<sup>+</sup>
        </span>
        {/* Center menu placeholder — items added when corresponding pages exist */}
        <nav aria-label="Primary" className="hidden flex-1 justify-center gap-9 sm:flex" />
        <div className="flex items-center gap-5">
          <Link
            href="/signin"
            className="font-body text-[13.5px] font-medium text-ink-3 transition-colors hover:text-ink"
          >
            Sign in
          </Link>
          <Link href="#get-access" className="btn-nav">
            Get access
          </Link>
        </div>
      </header>

      {/* Hero — full design fidelity */}
      <section className="hero">
        <div className="hero-top">
          <p className="hero-lead">
            We build the brand-deal CRM for solo creators — every pitch from
            email, IG and TikTok turns into{' '}
            <strong>structured rows you keep forever.</strong> Your inbox stops
            being the database.
          </p>
          <div className="hero-tags">
            <span>Pitch capture</span>
            <span>Pipeline tracking</span>
            <span>Brand history</span>
            <span>Quote recall</span>
          </div>
        </div>
        <div className="hero-massive">
          <h1 className="hero-h1">
            Spike Your
            <br />
            Brand Deals
          </h1>
          <div className="hero-photo">
            <svg viewBox="0 0 160 200" preserveAspectRatio="xMidYMid slice">
              <defs>
                <linearGradient id="hg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#1F1F1F" />
                  <stop offset="60%" stopColor="#0A0A0A" />
                  <stop offset="100%" stopColor="#1A1A1A" />
                </linearGradient>
              </defs>
              <rect width="160" height="200" fill="url(#hg)" />
              <polygon
                points="80,30 92,96 154,100 92,104 80,170 68,104 6,100 68,96"
                fill="#FFFFFF"
                opacity="0.95"
              />
              <polygon
                points="80,30 88,96 154,100 88,104 80,170 80,104 6,100 80,96"
                fill="#E83A1F"
                opacity="0.6"
              />
              <text
                x="80"
                y="190"
                textAnchor="middle"
                fontFamily="JetBrains Mono"
                fontSize="7"
                fill="#FFFFFF"
                opacity="0.6"
                letterSpacing="2"
              >
                / ASSET
              </text>
            </svg>
          </div>
        </div>
        <div className="hero-foot">
          <div className="hero-foot-left">
            <Link href="#get-access" className="btn-lg">
              Get early access
            </Link>
            <Link href="#demo" className="btn-text">
              See the dashboard <span className="arrow">→</span>
            </Link>
          </div>
          <div className="hero-foot-right">PHASE A · PRIVATE BETA · MAY 2026</div>
        </div>
      </section>

      {/* About — dark band statement */}
      <section className="dark-band">
        <div className="dark-band-inner">
          <div className="dark-kicker">ABOUT</div>
          <h2 className="dark-band-h2">
            We turn the chaos of brand outreach into{' '}
            <em>one calm, structured asset</em> — a database of every pitch,
            every brand, every quote. Built for the creator running themselves.
          </h2>
        </div>
      </section>

      {/* Logos strip — Founder will swap to SupaSpike feature list before launch */}
      {/* <section className="logos">
        <div className="logos-track">
          <div className="logo"><span className="logo-mark sp" /> Glossier</div>
          <div className="logo"><span className="logo-mark" /> Olipop</div>
          <div className="logo"><span className="logo-mark sq" /> Gymshark</div>
          <div className="logo"><span className="logo-mark tri" /> Audible</div>
          <div className="logo"><span className="logo-mark" /> Adobe</div>
          <div className="logo"><span className="logo-mark sp" /> Notion</div>
          <div className="logo"><span className="logo-mark sq" /> Figma</div>
        </div>
      </section> */}

      {/* How it works (value props) */}
      <section id="how" className="px-6 py-16 sm:py-24">
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
      <section id="demo" className="px-6 py-16 sm:py-24">
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
      <section id="pricing" className="px-6 py-16 sm:py-24">
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
      <section id="get-access" className="bg-ink px-6 py-20">
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
