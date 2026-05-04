import { Spinner } from '@/components/Spinner'

export default function AppLoading() {
  return (
    <div className="page">
      <div
        className="flex flex-col items-center justify-center gap-3 text-ink-3"
        style={{ minHeight: '60vh' }}
      >
        <Spinner className="h-6 w-6" />
        <span className="kicker">Loading</span>
      </div>
    </div>
  )
}
