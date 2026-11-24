import type { Metadata } from 'next'

import OrderDetailPageContent from '@/sections/OrderDetailPageContent'

export const metadata: Metadata = {
  title: 'CoffeeHub | Order details',
  description: 'Items, customer, payment and shipping of one order.',
}

export default function DashboardOrderDetailPage() {
  return <OrderDetailPageContent variant="dashboard" />
}
