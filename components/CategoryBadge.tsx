import type { PitchCategory } from '@/lib/types/pitch'

const STYLES: Record<PitchCategory, { label: string; classes: string }> = {
  legit: { label: 'Legit', classes: 'bg-green-100 text-green-800' },
  gifting_only: { label: 'Gifting', classes: 'bg-blue-100 text-blue-800' },
  low_quality: { label: 'Low quality', classes: 'bg-gray-200 text-gray-700' },
  spam_or_scam: { label: 'Spam/Scam', classes: 'bg-red-100 text-red-800' },
  unclear: { label: 'Unclear', classes: 'bg-yellow-100 text-yellow-800' },
  not_a_pitch: { label: 'Not a pitch', classes: 'bg-purple-100 text-purple-800' },
}

export function CategoryBadge({ category }: { category: PitchCategory }) {
  const { label, classes } = STYLES[category]
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${classes}`}
    >
      {label}
    </span>
  )
}
