import { render, screen } from '@testing-library/react'

import DashboardInventoryHistoryPage, {
  metadata,
} from '@/app/dashboard/inventory/[variantId]/page'

jest.mock('@/sections/InventoryHistoryPageContent', () => ({
  __esModule: true,
  default: () => <section aria-label="Stock history section" />,
}))

describe('DashboardInventoryHistoryPage', () => {
  it('renders the stock history section with its metadata', () => {
    render(<DashboardInventoryHistoryPage />)

    expect(
      screen.getByRole('region', { name: 'Stock history section' }),
    ).toBeInTheDocument()
    expect(metadata.title).toBe('CoffeeHub | Stock history')
  })
})
