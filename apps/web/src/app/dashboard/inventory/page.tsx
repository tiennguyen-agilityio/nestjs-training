import { Suspense } from 'react'

import InventoryPageContent from '@/sections/InventoryPageContent'
import Loading from '@/components/Loading'

export default function DashboardInventoryPage() {
  return (
    <Suspense fallback={<Loading size="lg" label="Loading inventory page" />}>
      <InventoryPageContent />
    </Suspense>
  )
}
