import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()
    const { error } = await supabase.from('pitches').select('id').limit(0)

    if (error) {
      return Response.json(
        { ok: false, schemaApplied: false, error: error.message },
        { status: 500 }
      )
    }

    return Response.json({ ok: true, schemaApplied: true })
  } catch (e) {
    return Response.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : 'unknown error',
      },
      { status: 500 }
    )
  }
}
