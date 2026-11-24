import { render, screen } from '@testing-library/react'

import OrderDetailPage, {
  metadata,
} from '@/app/(shop)/profile/orders/[orderNumber]/page'

jest.mock('@/sections/OrderDetailPageContent', () => ({
  __esModule: true,
  default: () => <section aria-label="Order details section" />,
}))

describe('OrderDetailPage', () => {
  it('renders the order details section with its metadata', () => {
    render(<OrderDetailPage />)

    expect(
      screen.getByRole('region', { name: 'Order details section' }),
    ).toBeInTheDocument()
    expect(metadata.title).toBe('CoffeeHub | Order details')
  })
})
