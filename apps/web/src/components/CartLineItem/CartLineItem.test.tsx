import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type React from 'react'

import { CartLineItem } from '@/components/CartLineItem'
import { EMPTY_IMAGE } from '@/constants/images'
import { ERROR_MESSAGES } from '@/constants/messages'
import { OUT_OF_STOCK_LABEL } from '@/constants/order'
import type { CartItem } from '@/types/cart'

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
  unitPrice: 14,
  quantity: 5,
  maxQuantity: 3,
  ...overrides,
})

describe('CartLineItem', () => {
  it('wraps the price and the Remove button onto the next line on a narrow phone', () => {
    render(
      <CartLineItem
        item={line()}
        onChangeQuantity={jest.fn()}
        onRemove={jest.fn()}
      />,
    )

    const name = screen.getByRole('heading', { name: 'Colombia Huila' })
    expect(name.parentElement?.parentElement).toHaveClass(
      'flex-wrap',
      'md:flex-nowrap',
    )
    expect(
      screen.getByRole('button', { name: 'Remove Colombia Huila' })
        .parentElement,
    ).toHaveClass('flex-wrap')
  })

  it('lets a line above the stock be lowered', async () => {
    const user = userEvent.setup()
    const onChangeQuantity = jest.fn()
    render(
      <CartLineItem
        item={line({ exceedsStock: true })}
        onChangeQuantity={onChangeQuantity}
        onRemove={jest.fn()}
      />,
    )

    expect(
      screen.getByText(ERROR_MESSAGES.CART_LINE_EXCEEDS_STOCK(3, 5)),
    ).toBeInTheDocument()
    expect(ERROR_MESSAGES.CART_LINE_EXCEEDS_STOCK(3, 5)).toBe(
      'Only 3 left · you have 5',
    )
    expect(screen.queryByText(OUT_OF_STOCK_LABEL)).toBeNull()
    expect(
      screen.getByRole('button', { name: 'Increase quantity' }),
    ).toBeDisabled()

    // 5 → 4 would still be above the stock, so the stepper goes straight to 3.
    await user.click(screen.getByRole('button', { name: 'Decrease quantity' }))
    expect(onChangeQuantity).toHaveBeenLastCalledWith('line-1', 3)

    await user.click(screen.getByRole('button', { name: 'Change to 3' }))
    expect(onChangeQuantity).toHaveBeenLastCalledWith('line-1', 3)
  })

  it('labels an unavailable line Out of stock and disables its stepper', () => {
    render(
      <CartLineItem
        item={line({ isUnavailable: true, quantity: 1 })}
        onChangeQuantity={jest.fn()}
        onRemove={jest.fn()}
      />,
    )

    expect(screen.getByText(OUT_OF_STOCK_LABEL)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Decrease quantity' }),
    ).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Remove Colombia Huila' }),
    ).toBeEnabled()
  })

  it('disables the stepper while its line has a request running', () => {
    render(
      <CartLineItem
        item={line({ quantity: 1 })}
        onChangeQuantity={jest.fn()}
        onRemove={jest.fn()}
        disabled
      />,
    )

    expect(
      screen.getByRole('button', { name: 'Increase quantity' }),
    ).toBeDisabled()
  })

  it('shows the struck list price for a discounted line', () => {
    render(
      <CartLineItem
        item={line({ unitPrice: 15, listPrice: 20, maxQuantity: 9 })}
        onChangeQuantity={jest.fn()}
        onRemove={jest.fn()}
      />,
    )

    expect(screen.getByText('$15.00')).toBeInTheDocument()
    expect(screen.getByRole('deletion')).toHaveTextContent('$20.00')
  })
})
