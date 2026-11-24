import { render, screen } from '@testing-library/react'
import type React from 'react'

import { CheckoutOrderSummary } from '@/components/CheckoutOrderSummary'
import { EMPTY_IMAGE } from '@/constants/images'
import type { CartItem, CartTotals } from '@/types/cart'

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({
    alt,
    src,
  }: React.ImgHTMLAttributes<HTMLImageElement> & { src: string }) => (
    <img alt={alt ?? ''} src={src} />
  ),
}))

const line = (overrides: Partial<CartItem> = {}): CartItem => ({
  id: 'line-1',
  variantId: 'v1',
  productId: 'p1',
  name: 'Colombia Huila',
  meta: '250g',
  imageUrl: EMPTY_IMAGE,
  unitPrice: 15,
  listPrice: 20,
  quantity: 2,
  ...overrides,
})

const totals: CartTotals = {
  subtotal: 30,
  shipping: 5,
  tax: 3,
  total: 38,
}

describe('CheckoutOrderSummary', () => {
  it('shows the struck list price for a discounted line', () => {
    render(
      <CheckoutOrderSummary
        items={[line()]}
        totals={totals}
        onPlaceOrder={jest.fn()}
      />,
    )

    expect(screen.getByText('$15.00')).toBeInTheDocument()
    expect(screen.getByRole('deletion')).toHaveTextContent('$20.00')
  })

  it('renders the estimated tax and the total it receives', () => {
    render(
      <CheckoutOrderSummary
        items={[line({ listPrice: undefined })]}
        totals={totals}
        onPlaceOrder={jest.fn()}
      />,
    )

    expect(
      screen.getByText('Estimated Tax').nextElementSibling,
    ).toHaveTextContent('$3.00')
    expect(screen.getByText('$38.00')).toBeInTheDocument()
    expect(screen.queryByRole('deletion')).not.toBeInTheDocument()
  })
})
