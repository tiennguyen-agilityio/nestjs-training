import { Suspense } from 'react'

import Loading from '@/components/Loading'
import { PageContent } from './PageContent'

export default function DashboardShippingMethodsPage() {
  return (
    <Suspense fallback={<Loading label="Loading shipping methods page" />}>
      <PageContent />
    </Suspense>
  )
}
