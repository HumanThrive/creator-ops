import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Kanban } from '@/components/Kanban'
import { AddPitchTrigger } from '@/components/AddPitchTrigger'
import type { Pitch } from '@/lib/types/pitch'

export default async function AppPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/signin')

  const { data: pitches, error } = await supabase
    .from('pitches')
    .select('*')
    .order('created_at', { ascending: false })

  return (
    <main className="min-h-screen p-6">
      <header className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-semibold">Creator Ops</h1>
          <AddPitchTrigger />
        </div>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            Sign out
          </button>
        </form>
      </header>
      {error ? (
        <p className="text-sm text-red-600">
          Failed to load pitches: {error.message}
        </p>
      ) : (
        <Kanban pitches={(pitches ?? []) as Pitch[]} />
      )}
    </main>
  )
}
