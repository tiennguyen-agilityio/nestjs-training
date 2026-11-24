import { Suspense } from 'react'

import Loading from '@/components/Loading'
import PageContent from './PageContent'

export default function AddShippingMethodPage() {
  return (
    <Suspense fallback={<Loading label="Loading add shipping method page" />}>
      <PageContent />
    </Suspense>
  )
}
