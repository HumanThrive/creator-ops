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
      {/* Top bar — full-width, sticky per design */}
      <header
        className="sticky top-0 z-50 flex w-full items-center justify-between border-b border-line"
        style={{
          padding: '18px clamp(20px, 4vw, 56px)',
          background: 'color-mix(in oklab, var(--paper) 92%, transparent)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
        }}
      >
        <span className="wordmark text-lg">
          SupaSpike<sup>®</sup>
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
                / SupaSpike
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
          <div className="hero-foot-right">GET EARLY ACCESS · FOR LIMITED TIME · MAY 2026</div>
        </div>
      </section>

      {/* About — dark band statement */}
      <section className="dark-band">
        <div className="dark-band-inner">
          <div className="dark-kicker">ABOUT</div>
          <div>
            <h2 className="dark-band-h2">
              We turn the chaos of brand outreach into{' '}
              <em>one calm, structured asset</em> 
            </h2>
            — a database of every pitch,
            every brand, every quote. Built for the creator running themselves.
          </div>
        </div>
      </section>

      {/* Logos strip — Founder will swap to SupaSpike feature list before launch */}
      <section className="logos">
        <div className="logos-track">
          <div className="logo"><span className="logo-mark sp" /> Pitch Capture</div>
          <div className="logo"><span className="logo-mark" /> Pipeline Tracking</div>
          <div className="logo"><span className="logo-mark sq" /> Brand History</div>
          <div className="logo"><span className="logo-mark tri" /> Quote Recall</div>
        </div>
      </section>

      {/* How — work process, full design fidelity */}
      <section id="how" className="how">
        <div className="how-inner">
          <div className="how-head">
            <h2 className="how-h2">
              Three
              <br />
              moves.
              <br />
              <em>Zero spreadsheets.</em>
            </h2>
            <div className="how-head-right">
              The asset compounds. Month six is twelve times richer than month
              one — every new pitch is read against the history of every pitch
              before it.
            </div>
          </div>
          <div className="how-grid">
            <div className="how-card">
              <div className="how-card-n">01</div>
              <h3 className="how-card-h">
                Paste a pitch.
                <br />
                <em>Get structure.</em>
              </h3>
              <p className="how-card-body">
                Drop in any brand DM, email or message. SupaSpike extracts
                brand, deliverables, budget, deadline, contact — every field, in
                seconds.
              </p>
              <div className="how-card-visual">
                <div className="v1-paste">
                  <div className="v1-paste-h">— from: brand@glossier.com</div>
                  Hi! We&apos;d love to send <mark>3 products</mark> for{' '}
                  <mark>2 IG Reels</mark> by <mark>May 18</mark>. Budget around{' '}
                  <mark>$3,500</mark>. Let me know!
                </div>
                <div className="v1-arrow">↓ EXTRACTED</div>
                <div className="v1-fields">
                  <div className="v1-field">
                    <div className="v1-field-k">Brand</div>
                    <div className="v1-field-v">Glossier</div>
                  </div>
                  <div className="v1-field">
                    <div className="v1-field-k">Budget</div>
                    <div className="v1-field-v">$3,500 USD</div>
                  </div>
                  <div className="v1-field">
                    <div className="v1-field-k">Deliverables</div>
                    <div className="v1-field-v">2 IG Reels</div>
                  </div>
                  <div className="v1-field">
                    <div className="v1-field-k">Due</div>
                    <div className="v1-field-v">May 18, 2026</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="how-card">
              <div className="how-card-n">02</div>
              <h3 className="how-card-h">
                Every deal,
                <br />
                <em>inbox to paid.</em>
              </h3>
              <p className="how-card-body">
                Four stages — Inbox, Negotiating, Confirmed, Paid. The whole
                pipeline, in one view. Nothing falls through the cracks.
              </p>
              <div className="how-card-visual">
                <div className="v2-pipe">
                  <div className="v2-seg" style={{ '--w': 4 } as React.CSSProperties}>Inbox</div>
                  <div className="v2-seg is-active" style={{ '--w': 3 } as React.CSSProperties}>Negotiating</div>
                  <div className="v2-seg" style={{ '--w': 2 } as React.CSSProperties}>Confirmed</div>
                  <div className="v2-seg" style={{ '--w': 2 } as React.CSSProperties}>Paid</div>
                </div>
                <div className="v2-legend">
                  <div className="v2-leg-row">
                    <div className="v2-leg-n">04</div>
                    <div className="v2-leg-l">Inbox</div>
                  </div>
                  <div className="v2-leg-row is-accent">
                    <div className="v2-leg-n">03</div>
                    <div className="v2-leg-l">Negotiating</div>
                  </div>
                  <div className="v2-leg-row">
                    <div className="v2-leg-n">02</div>
                    <div className="v2-leg-l">Confirmed</div>
                  </div>
                  <div className="v2-leg-row">
                    <div className="v2-leg-n">02</div>
                    <div className="v2-leg-l">Paid</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="how-card">
              <div className="how-card-n">03</div>
              <h3 className="how-card-h">
                A database
                <br />
                <em>that compounds.</em>
              </h3>
              <p className="how-card-body">
                Every saved pitch is a row you keep forever. Search any brand.
                See every prior quote. Know what you charged before answering
                again.
              </p>
              <div
                className="how-card-visual"
                style={{ gap: '6px', justifyContent: 'center' }}
              >
                <div className="v3-row">
                  <span><strong>Glossier</strong></span>
                  <span className="v3-row-mono">$3,500 · May 26</span>
                  <span className="v3-row-stage">NEG</span>
                </div>
                <div className="v3-row">
                  <span><strong>Glossier</strong></span>
                  <span className="v3-row-mono">$2,800 · Mar 26</span>
                  <span className="v3-row-stage">PAID</span>
                </div>
                <div className="v3-row is-accent">
                  <span><strong>Glossier</strong></span>
                  <span className="v3-row-mono">$1,200 · Nov 25</span>
                  <span className="v3-row-stage">PAID</span>
                </div>
                <div className="v3-row">
                  <span><strong>Audible</strong></span>
                  <span className="v3-row-mono">$4,200 · Apr 26</span>
                  <span className="v3-row-stage">CONF</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Service — centered statement */}
      <section className="service">
        <div className="service-inner">
          <div className="kicker">SERVICE</div>
          <h2 className="service-h2">
            We make <em>the asset visible.</em> The pipeline you can see, the
            brand history you can trust, the quote you charged Nike six months
            ago — one place, structured forever.
          </h2>
        </div>
      </section>

      {/* Demo — dashboard preview, full design fidelity */}
      <section id="demo" className="demo">
        <div className="demo-inner">
          <div className="demo-head">
            <h2 className="demo-h2">
              Your dashboard,
              <br />
              <em>day one.</em>
            </h2>
            <p className="demo-sub">
              No setup. No fields to configure. Save your first pitch and the
              asset starts here.
            </p>
          </div>
          <div className="demo-frame">
            <div className="dapp">
              <aside className="dapp-side">
                <div className="dapp-brand">
                  SupaSpike<sup>®</sup>
                </div>
                <nav className="dapp-nav">
                  <div className="dapp-nav-section">Workspace</div>
                  <span className="dapp-nav-item is-active">
                    <span className="dapp-nav-icon">▦</span>Pitches
                  </span>
                  <span className="dapp-nav-item">
                    <span className="dapp-nav-icon">◇</span>Brands
                  </span>
                  <span className="dapp-nav-item">
                    <span className="dapp-nav-icon">⌕</span>Search
                  </span>
                  <div className="dapp-nav-section">Account</div>
                  <span className="dapp-nav-item">
                    <span className="dapp-nav-icon">⚙</span>Settings
                  </span>
                  <span className="dapp-nav-item">
                    <span className="dapp-nav-icon">↗</span>Sign out
                  </span>
                </nav>
                <div className="dapp-side-foot">
                  <div className="dapp-avatar">M</div>
                  <div className="dapp-side-foot-info">
                    <strong>Mira</strong>
                    <span>Beauty creator</span>
                  </div>
                </div>
              </aside>
              <main className="dapp-main">
                <header className="dapp-h1">
                  <h2>Pitches</h2>
                  <span className="dapp-cta">+ Add Pitch</span>
                </header>
                <div className="dapp-stats">
                  <div className="dapp-stat">
                    <div className="dapp-stat-l">Pitches saved</div>
                    <div className="dapp-stat-v">11</div>
                    <div className="dapp-stat-meta">
                      <span className="accent">+ 3</span> this week
                    </div>
                  </div>
                  <div className="dapp-stat">
                    <div className="dapp-stat-l">Brands tracked</div>
                    <div className="dapp-stat-v">07</div>
                    <div className="dapp-stat-meta">2 returning</div>
                  </div>
                  <div className="dapp-stat">
                    <div className="dapp-stat-l">In pipeline</div>
                    <div className="dapp-stat-v">
                      $18,400<sup>USD</sup>
                    </div>
                    <div className="dapp-stat-meta">+ €2,100 EUR</div>
                  </div>
                </div>
                <div className="dapp-board">
                  <div className="fcol">
                    <div className="fcol-head">
                      <strong>Inbox</strong>
                      <span className="fcol-n">04</span>
                    </div>
                    <div className="fcol-cards">
                      <div className="fcard">
                        <div className="fcard-r1">
                          <strong>Glossier</strong>
                          <span className="fcard-amt">$3,500</span>
                        </div>
                        <div className="fcard-del">3 products · 2 IG Reels</div>
                        <div className="fcard-foot">
                          <span>May 18</span>
                          <span>Today</span>
                        </div>
                      </div>
                      <div className="fcard">
                        <div className="fcard-r1">
                          <strong>Olipop</strong>
                          <span className="fcard-amt">$1,800</span>
                        </div>
                        <div className="fcard-del">1 TikTok · 1 IG Story</div>
                        <div className="fcard-foot">
                          <span>Jun 02</span>
                          <span>2d ago</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="fcol">
                    <div className="fcol-head">
                      <strong>Negotiating</strong>
                      <span className="fcol-n">03</span>
                    </div>
                    <div className="fcol-cards">
                      <div className="fcard is-spotlight">
                        <div className="fcard-r1">
                          <strong>Gymshark</strong>
                          <span className="fcard-amt">$4,200</span>
                        </div>
                        <div className="fcard-del">2 Reels · usage rights</div>
                        <div className="fcard-foot">
                          <span>Jun 10</span>
                          <span>3d ago</span>
                        </div>
                      </div>
                      <div className="fcard">
                        <div className="fcard-r1">
                          <strong>Audible</strong>
                          <span className="fcard-amt">$4,200</span>
                        </div>
                        <div className="fcard-del">1 podcast read</div>
                        <div className="fcard-foot">
                          <span>May 28</span>
                          <span>5d ago</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="fcol">
                    <div className="fcol-head">
                      <strong>Confirmed</strong>
                      <span className="fcol-n">02</span>
                    </div>
                    <div className="fcol-cards">
                      <div className="fcard">
                        <div className="fcard-r1">
                          <strong>Glow Skincare</strong>
                          <span className="fcard-amt">$2,400</span>
                        </div>
                        <div className="fcard-del">3 IG Stories</div>
                        <div className="fcard-foot">
                          <span>May 22</span>
                          <span>Signed</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="fcol">
                    <div className="fcol-head">
                      <strong>Paid</strong>
                      <span className="fcol-n">02</span>
                    </div>
                    <div className="fcol-cards">
                      <div className="fcard">
                        <div className="fcard-r1">
                          <strong>Adobe</strong>
                          <span className="fcard-amt">$5,500</span>
                        </div>
                        <div className="fcard-del">YT integration</div>
                        <div className="fcard-foot">
                          <span>Apr 15</span>
                          <span>Cleared</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </main>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing — full design fidelity */}
      <section id="pricing" className="pricing">
        <div className="pricing-inner">
          <div>
            <div className="kicker">PRICING</div>
            <h2 className="pricing-h2">
              One price.
              <br />
              <em>Free in beta.</em>
            </h2>
            <p className="pricing-body">
              No tiers, no seats, no add-ons. SupaSpike costs the same for
              everyone — and nothing while we&apos;re still in private beta.
              Founders who join now keep that price for life.
            </p>
          </div>
          <div className="pricing-card">
            <div className="pricing-card-tag">FOUNDER</div>
            <div className="pricing-card-price">
              <strong>$30</strong>
              <span>/ month at launch</span>
            </div>
            <div className="pricing-card-rows">
              <div className="pricing-card-row">
                Unlimited pitches, brands, history
              </div>
              <div className="pricing-card-row">
                Pipeline board with four stages
              </div>
              <div className="pricing-card-row">
                AI extraction on every save
              </div>
              <div className="pricing-card-row">
                Per-brand history &amp; quote recall
              </div>
            </div>
            <p className="pricing-card-fine">
              Free while in private beta. Founder pricing locks for life if you
              join now.
            </p>
          </div>
        </div>
      </section>

      {/* Capture — closing CTA, full design fidelity */}
      <section id="get-access" className="capture">
        <div className="capture-inner">
          <div className="capture-eyebrow">GET EARLY ACCESS</div>
          <h2 className="capture-h2">
            Stop losing
            <br />
            pitches to <em>your inbox.</em>
          </h2>
          <div className="capture-grid">
            <p className="capture-body">
              Founders join in the order we receive them. We&apos;re onboarding
              ten creators a week. Drop your email — we&apos;ll be in touch
              within seven days.
            </p>
            <div>
              <WaitlistForm />
              <div className="capture-foot">
                Building in public — follow{' '}
                <a
                  href="https://x.com/supaspikehq"
                  target="_blank"
                  rel="noreferrer"
                >
                  @supaspikehq
                </a>{' '}
                on X for daily updates.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer — full design fidelity */}
      <footer className="foot">
        <div className="foot-inner">
          <div className="foot-brand">
            SupaSpike<sup>®</sup>
          </div>
          <div className="foot-meta">
            <span>© 2026 SupaSpike</span>
            <a href="mailto:founder@supaspike.com">founder@supaspike.com</a>
            <a href="#">Privacy</a>
            <a href="#">Terms</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
