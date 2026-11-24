import type { Metadata } from 'next'

import OrderDetailPageContent from '@/sections/OrderDetailPageContent'

export const metadata: Metadata = {
  title: 'CoffeeHub | Order details',
  description: 'Items, payment, shipping and progress of one of your orders.',
}

export default function OrderDetailPage() {
  return <OrderDetailPageContent />
}
