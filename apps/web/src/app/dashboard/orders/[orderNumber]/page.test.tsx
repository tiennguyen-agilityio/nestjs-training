import { render, screen } from '@testing-library/react'

import DashboardOrderDetailPage, {
  metadata,
} from '@/app/dashboard/orders/[orderNumber]/page'

jest.mock('@/sections/OrderDetailPageContent', () => ({
  __esModule: true,
  default: ({ variant }: { variant?: string }) => (
    <section aria-label="Order details section" data-variant={variant} />
  ),
}))

describe('DashboardOrderDetailPage', () => {
  it('DashboardOrderDetailPage renders the dashboard variant', () => {
    render(<DashboardOrderDetailPage />)

    expect(
      screen.getByRole('region', { name: 'Order details section' }),
    ).toHaveAttribute('data-variant', 'dashboard')
    expect(metadata.title).toBe('CoffeeHub | Order details')
  })
})
