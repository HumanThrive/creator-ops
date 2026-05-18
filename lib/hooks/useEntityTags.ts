'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export interface Tag {
  slug: string
  display_label: string
  axis: string
}

export interface UseEntityTagsResult {
  tags: Tag[]
  setTags: (slugs: string[]) => Promise<void>
  loading: boolean
  error: Error | null
}

// Generic taggable read/write hook. v1 ships pitch-only writes (calls
// update_pitch_with_activity); future entity types (deal, comment, etc.)
// extend the switch in `setTags` when they adopt the taggable subsystem
// per CR-2 §7.1 future-adoption pattern.
//
// Write semantics: setTags(slugs) writes the FULL tag-set (AC4.3 +
// AC4.5). For refType='pitch', the hook fetches the parent pitch's
// current non-tag field values before calling update_pitch_with_activity
// — otherwise the RPC's UPDATE would null out brand_name, sender_name,
// deliverables, etc. This is a 1-extra-SELECT cost per chip click; cheap
// (PK lookup) and isolates the consumer from needing to plumb the full
// pitch object through to a tag-toggle handler.
export function useEntityTags(
  refType: string,
  refId: string | null,
): UseEntityTagsResult {
  const [tags, setTagsState] = useState<Tag[]>([])
  const [loading, setLoading] = useState<boolean>(refId !== null)
  const [error, setError] = useState<Error | null>(null)
  const supabase = useRef(createClient()).current

  const refetch = useCallback(async () => {
    if (!refId) {
      setTagsState([])
      return
    }
    const { data, error: err } = await supabase
      .from('entity_tags')
      .select('tags(slug, display_label, axis)')
      .eq('ref_type', refType)
      .eq('ref_id', refId)
    if (err) {
      setError(new Error(err.message))
      return
    }
    const rows = (data ?? []).flatMap((row) => {
      const t = (row as { tags: Tag | Tag[] | null }).tags
      if (!t) return []
      return Array.isArray(t) ? t : [t]
    })
    setTagsState(rows)
  }, [refType, refId, supabase])

  useEffect(() => {
    if (!refId) {
      setTagsState([])
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    refetch().finally(() => {
      if (!cancelled) setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [refId, refetch])

  const setTags = useCallback(
    async (nextSlugs: string[]) => {
      if (!refId) return

      // Idempotency: skip RPC when next set equals current set (sorted compare).
      const currentSorted = [...tags.map((t) => t.slug)].sort()
      const nextSorted = [...nextSlugs].sort()
      const sameSet =
        currentSorted.length === nextSorted.length &&
        currentSorted.every((s, i) => s === nextSorted[i])
      if (sameSet) return

      const diff = {
        tags: {
          before: currentSorted,
          after: nextSorted,
        },
      }

      if (refType !== 'pitch') {
        throw new Error(
          `useEntityTags: setTags not yet wired for refType="${refType}"`,
        )
      }

      // Fetch current pitch field values — required by update_pitch_with_activity
      // which UPDATEs all fields each call (no partial-update RPC in v1).
      const { data: pitchRow, error: fetchErr } = await supabase
        .from('pitches')
        .select(
          'brand_name, sender_name, deliverables, budget_amount, budget_currency, budget_notes, deadline, ai_summary, user_notes',
        )
        .eq('id', refId)
        .single()

      if (fetchErr || !pitchRow) {
        const e = new Error(fetchErr?.message ?? 'pitch not found')
        setError(e)
        throw e
      }

      const { error: rpcError } = await supabase.rpc(
        'update_pitch_with_activity',
        {
          p_pitch_id: refId,
          p_brand_name: pitchRow.brand_name,
          p_sender_name: pitchRow.sender_name,
          p_deliverables: pitchRow.deliverables,
          p_budget_amount: pitchRow.budget_amount,
          p_budget_currency: pitchRow.budget_currency,
          p_budget_notes: pitchRow.budget_notes,
          p_deadline: pitchRow.deadline,
          p_tag_slugs: nextSlugs,
          p_ai_summary: pitchRow.ai_summary,
          p_user_notes: pitchRow.user_notes,
          p_field_diffs: diff,
        },
      )

      if (rpcError) {
        const e = new Error(rpcError.message)
        setError(e)
        throw e
      }

      await refetch()
    },
    [tags, refType, refId, supabase, refetch],
  )

  return { tags, setTags, loading, error }
}
