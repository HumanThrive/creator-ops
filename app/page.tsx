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
    <div className="flex min-h-screen flex-col bg-white text-zinc-900">
      {/* Top bar */}
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <span className="text-lg font-semibold tracking-tight">
          SupaSpike
        </span>
        <Link
          href="/signin"
          className="text-sm font-medium text-zinc-600 hover:text-zinc-900"
        >
          Sign in
        </Link>
      </header>

      {/* Hero */}
      <section className="mx-auto w-full max-w-6xl px-6 pb-16 pt-12 sm:pt-20">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-4xl font-semibold tracking-tight text-zinc-900 sm:text-6xl">
            Spike your brand deals.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-zinc-600 sm:text-xl">
            SupaSpike pulls every brand pitch — email, Instagram, TikTok,
            anywhere — into your own brand-deal CRM. Track from pitch to
            paid. Built for creators running themselves.
          </p>
          <div className="mx-auto mt-10 max-w-xl">
            <p className="mb-3 text-sm font-medium text-zinc-700">
              Drop your email. We&apos;ll let you in early.
            </p>
            <WaitlistForm />
            <p className="mt-4 text-sm text-zinc-500">
              Follow{' '}
              <a
                href="https://x.com/supaspikehq"
                className="font-medium text-zinc-700 underline-offset-2 hover:underline"
              >
                @supaspikehq
              </a>{' '}
              on X for daily build updates →
            </p>
          </div>
        </div>
      </section>

      {/* Value props */}
      <section className="mx-auto w-full max-w-6xl px-6 py-16 sm:py-24">
        <div className="grid gap-8 sm:grid-cols-3">
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-6">
            <h3 className="text-lg font-semibold text-zinc-900">
              Your brand-deal database, built as you go.
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-zinc-600">
              Every pitch you paste — email, IG DM, TikTok, anywhere — becomes
              part of your own structured CRM of brand relationships. Your
              data, owned by you. Building an asset, not just dumping into a
              tool.
            </p>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-6">
            <h3 className="text-lg font-semibold text-zinc-900">
              Paste the pitch. We extract the deal.
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-zinc-600">
              Brand name, deliverables, budget, deadline, category — extracted
              from any pitch in seconds. No spreadsheet typing. Every paste
              adds a structured record to your CRM.
            </p>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-6">
            <h3 className="text-lg font-semibold text-zinc-900">
              Every deal, from inbox to paid.
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-zinc-600">
              Four stages — Inbox, Negotiating, Confirmed, Delivered &amp;
              Paid. See your whole pipeline at a glance. Nothing falls
              through. Nothing gets forgotten.
            </p>
          </div>
        </div>
      </section>

      {/* Demo */}
      <section className="mx-auto w-full max-w-6xl px-6 py-16 sm:py-24">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Your dashboard, day one.
          </h2>
          <p className="mt-4 text-lg text-zinc-600">
            Every pitch, sorted. Every deal, tracked. No spreadsheets harmed.
          </p>
        </div>
        <div className="mx-auto mt-10 max-w-5xl">
          <div className="aspect-video w-full overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100 shadow-sm">
            {/* Screenshot placeholder — swap for /public/dashboard.png after #8 bug-bash */}
            <div className="flex h-full w-full items-center justify-center text-sm text-zinc-400">
              Dashboard preview
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="mx-auto w-full max-w-6xl px-6 py-16 sm:py-24">
        <div className="mx-auto max-w-2xl rounded-xl border border-zinc-200 bg-zinc-50 p-8 text-center sm:p-12">
          <h2 className="text-3xl font-semibold tracking-tight">
            Free during the beta.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-zinc-600">
            $30/mo at public launch — founder pricing locks in for life if
            you join now. Free tier stays for creators 1k–5k climbing toward
            monetization.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t border-zinc-200 px-6 py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 text-sm text-zinc-500 sm:flex-row">
          <span>© 2026 SupaSpike</span>
          <div className="flex items-center gap-6">
            <a
              href="mailto:founder@supaspike.com"
              className="hover:text-zinc-900"
            >
              founder@supaspike.com
            </a>
            <Link href="/signin" className="hover:text-zinc-900">
              Sign in
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
