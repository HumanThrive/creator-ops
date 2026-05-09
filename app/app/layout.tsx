import { TopBar } from '@/components/TopBar'
import { AuthVerifier } from '@/components/AuthVerifier'
import { createClient } from '@/lib/supabase/server'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const initial = (user?.email?.[0] ?? 'U').toUpperCase()

  return (
    <div className="app">
      <AuthVerifier />
      <TopBar initial={initial} />
      {children}
    </div>
  )
}
