import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { buildSystemPrompt } from '@/lib/prompts/extract-system'
import type { ExtractedPitch } from '@/lib/types/pitch'

const anthropic = new Anthropic()

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return Response.json(
      { success: false, error: 'unauthorized' },
      { status: 401 }
    )
  }

  let body: { pitch_text?: string }
  try {
    body = await request.json()
  } catch {
    return Response.json(
      { success: false, error: 'invalid_json' },
      { status: 400 }
    )
  }

  const pitchText = body.pitch_text?.trim()
  if (!pitchText) {
    return Response.json(
      { success: false, error: 'pitch_text_required' },
      { status: 400 }
    )
  }

  let message
  try {
    message = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 1024,
      system: [
        {
          type: 'text',
          text: buildSystemPrompt(),
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: pitchText }],
    })
  } catch (e) {
    if (e instanceof Anthropic.APIError) {
      console.error('[api/extract] Anthropic error:', e.status, e.message)
      return Response.json(
        { success: false, error: `anthropic_${e.status ?? 'error'}` },
        { status: 502 }
      )
    }
    throw e
  }

  const firstBlock = message.content[0]
  if (!firstBlock || firstBlock.type !== 'text') {
    console.error('[api/extract] Unexpected content shape:', message.content)
    return Response.json(
      { success: false, error: 'extraction_invalid_response' },
      { status: 502 }
    )
  }

  const cleanedText = firstBlock.text
    .trim()
    .replace(/^```(?:json)?\s*\n?/i, '')
    .replace(/\n?```\s*$/i, '')
    .trim()

  let parsed: ExtractedPitch
  try {
    parsed = JSON.parse(cleanedText) as ExtractedPitch
  } catch {
    console.error('[api/extract] JSON parse failed. Raw text:', firstBlock.text)
    return Response.json(
      { success: false, error: 'extraction_parse_failed' },
      { status: 502 }
    )
  }

  return Response.json({ success: true, data: parsed })
}
