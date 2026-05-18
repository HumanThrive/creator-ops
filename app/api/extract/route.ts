import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import {
  buildSystemPrompt,
  type ExtractDirection,
  type TagListItem,
} from '@/lib/prompts/extract-system'
import type { ExtractedPitch } from '@/lib/types/pitch'

const anthropic = new Anthropic()

const DAILY_LIMIT = 100
const INPUT_MAX_CHARS = 5000

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

  let body: { pitch_text?: string; direction?: string }
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

  if (pitchText.length > INPUT_MAX_CHARS) {
    return Response.json(
      { success: false, error: 'pitch_too_long' },
      { status: 400 }
    )
  }

  // Default to 'inbound' if direction is absent or invalid — backwards-clean
  // for any incidental caller that hasn't been updated to the FR-4 contract.
  const direction: ExtractDirection =
    body.direction === 'outbound' ? 'outbound' : 'inbound'

  // check_and_increment_extraction is security definer — bypasses RLS.
  // Fail open on DB error so a rate-limit glitch never blocks a real user.
  const { data: allowed, error: rateLimitError } = await supabase.rpc(
    'check_and_increment_extraction',
    { p_user_id: user.id, p_limit: DAILY_LIMIT },
  )
  if (rateLimitError) {
    console.error('[api/extract] rate limit check failed:', rateLimitError.message)
  } else if (allowed === false) {
    return Response.json(
      { success: false, error: 'rate_limit_exceeded' },
      { status: 429 },
    )
  }

  const { data: tagRows, error: tagError } = await supabase
    .from('tags')
    .select('slug, display_label, axis')
    .eq('scope', 'pitch')
    .order('axis')
    .order('slug')
  if (tagError || !tagRows || tagRows.length === 0) {
    console.error('[api/extract] tag list query failed:', tagError?.message)
    return Response.json(
      { success: false, error: 'tag_list_unavailable' },
      { status: 502 },
    )
  }
  const tagList: TagListItem[] = tagRows

  let message
  try {
    message = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 1024,
      system: [
        {
          type: 'text',
          text: buildSystemPrompt(direction, tagList),
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

  // Outbound: server injects 'valid' legitimacy tag (AI emits compensation only per AC1.4).
  if (direction === 'outbound') {
    const aiTags = Array.isArray(parsed.tags) ? parsed.tags : []
    parsed.tags = aiTags.includes('valid') ? aiTags : ['valid', ...aiTags]
  }

  return Response.json({ success: true, data: parsed })
}
