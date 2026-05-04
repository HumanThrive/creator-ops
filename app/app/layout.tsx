import { TopBar } from '@/components/TopBar'
import { AuthVerifier } from '@/components/AuthVerifier'

export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="app">
      <AuthVerifier />
      <TopBar />
      {children}
    </div>
  )
}
