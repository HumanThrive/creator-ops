'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ContactRole } from '@/lib/types/contact'
import { RolePopover } from '@/components/RolePopover'
import { UnlinkModal } from '@/components/UnlinkModal'

// FR-8 S5 (slice #76) — wrapper around RolePopover + UnlinkModal.
// Mounted on Contact-detail stacked Brand card head AND BrandContactsTable row.
// Owns: role optimistic-state + unlink-modal open/close + server-router refresh
// on unlink success (so the surrounding server-rendered card / table picks up
// the new state).

interface BrandAssocRoleControlProps {
  contactId: string
  brandId: string
  brandName: string
  contactName: string
  initialRole: ContactRole | null
  pitchCountForPair: number
  closedDealCount?: number
  closedDealAmountDisplay?: string | null
  variant?: 'card-foot' | 'table-row'
}

export function BrandAssocRoleControl({
  contactId,
  brandId,
  brandName,
  contactName,
  initialRole,
  pitchCountForPair,
  closedDealCount,
  closedDealAmountDisplay,
  variant = 'card-foot',
}: BrandAssocRoleControlProps) {
  const router = useRouter()
  const [unlinkOpen, setUnlinkOpen] = useState(false)

  return (
    <>
      <RolePopover
        contactId={contactId}
        brandId={brandId}
        initialRole={initialRole}
        variant={variant}
        onUnlinkRequested={() => setUnlinkOpen(true)}
      />
      {unlinkOpen ? (
        <UnlinkModal
          contactId={contactId}
          brandId={brandId}
          brandName={brandName}
          contactName={contactName}
          pitchCountForPair={pitchCountForPair}
          closedDealCount={closedDealCount}
          closedDealAmountDisplay={closedDealAmountDisplay}
          onClose={() => setUnlinkOpen(false)}
          onUnlinked={() => {
            // Refresh the surrounding server component so the unlink lands
            // visually (ended-row treatment on Contact-detail, or row drops
            // out of BrandContactsTable per AC5.6).
            router.refresh()
          }}
        />
      ) : null}
    </>
  )
}
