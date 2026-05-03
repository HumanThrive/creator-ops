import Link from 'next/link'
import { AddPitchTrigger } from '@/components/AddPitchTrigger'

type ActiveTab = 'pitches' | 'brands'

interface TopBarProps {
  active: ActiveTab
}

export function TopBar({ active }: TopBarProps) {
  return (
    <header className="topbar">
      <Link href="/app" className="topbar-brand">
        SupaSpike<sup>+</sup>
      </Link>
      <nav className="topbar-nav">
        <Link href="/app" className={active === 'pitches' ? 'active' : ''}>
          Pitches
        </Link>
        <Link href="/app/brands" className={active === 'brands' ? 'active' : ''}>
          Brands
        </Link>
      </nav>
      <div className="topbar-spacer" />
      <span className="topbar-meta">PHASE A · BUILD MODE</span>
      <div className="topbar-actions">
        <AddPitchTrigger className="btn-pill" label="Add pitch" />
        <form action="/auth/signout" method="post">
          <button type="submit" className="topbar-signout">
            Sign out
          </button>
        </form>
      </div>
    </header>
  )
}
