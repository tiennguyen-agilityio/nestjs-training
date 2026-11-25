import { render, screen } from '@testing-library/react'

import DashboardInventoryPage from '@/app/dashboard/inventory/page'

jest.mock('@/sections/InventoryPageContent', () => ({
  __esModule: true,
  default: () => <section aria-label="Inventory section" />,
}))

describe('DashboardInventoryPage', () => {
  it('renders the inventory section', () => {
    render(<DashboardInventoryPage />)

    expect(
      screen.getByRole('region', { name: 'Inventory section' }),
    ).toBeInTheDocument()
  })
})
