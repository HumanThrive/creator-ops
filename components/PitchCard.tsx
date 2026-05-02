'use client'

import type { Pitch } from '@/lib/types/pitch'
import { CategoryBadge } from './CategoryBadge'

export function PitchCard({
  pitch,
  onClick,
}: {
  pitch: Pitch
  onClick: () => void
}) {
  const budgetText =
    pitch.budget_amount !== null
      ? `$${pitch.budget_amount.toLocaleString()} ${pitch.budget_currency ?? ''}`.trim()
      : 'No cash budget'

  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full rounded-md border border-gray-200 bg-white p-3 text-left text-sm shadow-sm transition hover:border-gray-300 hover:shadow"
    >
      <div className="mb-1 font-medium text-gray-900">
        {pitch.brand_name ?? 'Unknown brand'}
      </div>
      <div className="text-gray-700">{budgetText}</div>
      {pitch.budget_notes && (
        <div className="text-xs text-gray-500">{pitch.budget_notes}</div>
      )}
      {pitch.deadline && (
        <div className="mt-1 text-xs text-gray-600">Due: {pitch.deadline}</div>
      )}
      <div className="mt-2">
        <CategoryBadge category={pitch.category} />
      </div>
      {pitch.ai_summary && (
        <p className="mt-2 line-clamp-2 text-xs text-gray-600">
          {pitch.ai_summary}
        </p>
      )}
    </button>
  )
}
