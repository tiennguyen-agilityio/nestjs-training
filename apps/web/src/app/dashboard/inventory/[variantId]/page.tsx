import type { Metadata } from 'next'

import InventoryHistoryPageContent from '@/sections/InventoryHistoryPageContent'

export const metadata: Metadata = {
  title: 'CoffeeHub | Stock history',
  description: 'Every stock movement of one product variant.',
}

export default function DashboardInventoryHistoryPage() {
  return <InventoryHistoryPageContent />
}
