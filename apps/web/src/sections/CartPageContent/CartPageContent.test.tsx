import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import type React from 'react'
import { useRouter } from 'next/navigation'

import {
  CART_CHECKOUT_BLOCKED_MESSAGE,
  OUT_OF_STOCK_LABEL,
} from '@/constants/order'
import { API_FALLBACK_ERRORS } from '@/constants/messages'
import { useCart, type UseCartResult } from '@/hooks/useCart'
import CartPageContent from '@/sections/CartPageContent'
import { useCartStore } from '@/store/useCartStore'

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}))

jest.mock('@/hooks/useCart', () => ({
  useCart: jest.fn(),
}))

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({
    alt,
    src,
    ...rest
  }: React.ImgHTMLAttributes<HTMLImageElement> & { src: string }) => (
    <img alt={alt ?? ''} src={src} {...rest} />
  ),
}))

const mockUseRouter = jest.mocked(useRouter)
const mockUseCart = jest.mocked(useCart)

const baseUseCartResult: UseCartResult = {
  items: [
    {
      id: 'line-1',
      variantId: 'variant-1',
      productId: 'product-1',
      name: 'Ethiopian Yirgacheffe',
      meta: 'Light Roast • Floral & Citrus Notes',
      imageUrl: '/images/empty-image.webp',
      unitPrice: 24,
      quantity: 1,
      maxQuantity: 20,
    },
    {
      id: 'line-2',
      variantId: 'variant-2',
      productId: 'product-2',
      name: 'Precision Gooseneck Kettle',
      meta: 'Matte Black • Variable Temp Control',
      imageUrl: '/images/empty-image.webp',
      unitPrice: 145,
      quantity: 1,
      maxQuantity: 10,
    },
  ],
  totals: {
    subtotal: 169,
    shipping: null,
    tax: 0,
    total: 169,
  },
  itemCount: 2,
  isServerCart: true,
  isLoading: false,
  isError: false,
  errorMessage: null,
  addItem: jest.fn(async () => ({ ok: true as const })),
  changeQuantity: jest.fn(async () => ({ ok: true as const })),
  removeItem: jest.fn(async () => ({ ok: true as const })),
  refetch: jest.fn(),
}

describe('CartPageContent', () => {
  beforeEach(() => {
    mockUseRouter.mockReturnValue({
      push: jest.fn(),
    } as unknown as ReturnType<typeof useRouter>)
    mockUseCart.mockReturnValue(baseUseCartResult)
    useCartStore.setState({ mergeNotice: null })
  })

  it('renders heading and line items in success state', () => {
    render(<CartPageContent />)

    expect(
      screen.getByRole('heading', { name: 'Your Sensory Cart' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Ethiopian Yirgacheffe')).toBeInTheDocument()
    expect(screen.getByText('Precision Gooseneck Kettle')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Order Summary' }),
    ).toBeInTheDocument()
    expect(screen.getAllByText('$169.00')).toHaveLength(2)
  })

  it('shows loading state while cart is hydrating', () => {
    mockUseCart.mockReturnValue({
      ...baseUseCartResult,
      isLoading: true,
    })

    render(<CartPageContent />)
    expect(screen.getByTestId('cart-loading')).toBeInTheDocument()
  })

  it('shows error state and allows retry', () => {
    mockUseCart.mockReturnValue({
      ...baseUseCartResult,
      isError: true,
      errorMessage: 'Storage parse error',
    })

    render(<CartPageContent />)
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(screen.getByText('Storage parse error')).toBeInTheDocument()
    expect(baseUseCartResult.refetch).toHaveBeenCalled()
  })

  it('shows empty state when there are no items', () => {
    const push = jest.fn()
    mockUseRouter.mockReturnValue({
      push,
    } as unknown as ReturnType<typeof useRouter>)
    mockUseCart.mockReturnValue({
      ...baseUseCartResult,
      items: [],
      itemCount: 0,
      totals: {
        subtotal: 0,
        shipping: null,
        tax: 0,
        total: 0,
      },
    })

    render(<CartPageContent />)
    fireEvent.click(screen.getByRole('button', { name: 'Continue Shopping' }))

    expect(screen.getByText('Your cart is empty.')).toBeInTheDocument()
    expect(push).toHaveBeenCalledWith('/')
  })

  it('navigates to checkout when clicking proceed to checkout', () => {
    const push = jest.fn()
    mockUseRouter.mockReturnValue({
      push,
    } as unknown as ReturnType<typeof useRouter>)

    render(<CartPageContent />)
    fireEvent.click(screen.getByRole('button', { name: 'Proceed to Checkout' }))

    expect(push).toHaveBeenCalledWith('/checkout')
  })

  it('opens remove dialog and confirms removing item', () => {
    render(<CartPageContent />)

    fireEvent.click(
      screen.getByRole('button', { name: 'Remove Ethiopian Yirgacheffe' }),
    )
    const modal = screen.getByTestId('modal-confirm-remove-cart-item')
    expect(within(modal).getByText('Remove item?')).toBeInTheDocument()
    expect(within(modal).getByText('Ethiopian Yirgacheffe')).toBeInTheDocument()

    fireEvent.click(within(modal).getByRole('button', { name: 'Remove' }))
    expect(baseUseCartResult.removeItem).toHaveBeenCalledWith('line-1')
  })

  it('shows the total quantity in the subtitle', () => {
    mockUseCart.mockReturnValue({ ...baseUseCartResult, itemCount: 3 })

    render(<CartPageContent />)

    expect(
      screen.getByText('3 items selected for your next brewing experience.'),
    ).toBeInTheDocument()
  })

  it('flags an unavailable line and blocks checkout', () => {
    mockUseCart.mockReturnValue({
      ...baseUseCartResult,
      items: [
        ...baseUseCartResult.items.map((item, index) =>
          index === 0 ? { ...item, isUnavailable: true } : item,
        ),
      ],
    })

    render(<CartPageContent />)

    expect(screen.getByText(OUT_OF_STOCK_LABEL)).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(
      CART_CHECKOUT_BLOCKED_MESSAGE,
    )
    expect(
      screen.getByRole('button', { name: 'Proceed to Checkout' }),
    ).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Remove Ethiopian Yirgacheffe' }),
    ).toBeEnabled()
  })

  it('signed in: changes and removes lines through the API', async () => {
    const user = userEvent.setup()
    render(<CartPageContent />)

    const [firstLineIncrease] = screen.getAllByRole('button', {
      name: 'Increase quantity',
    })
    await user.click(firstLineIncrease)
    expect(baseUseCartResult.changeQuantity).toHaveBeenCalledWith('line-1', 2)

    await user.click(
      screen.getByRole('button', { name: 'Remove Ethiopian Yirgacheffe' }),
    )
    const modal = screen.getByTestId('modal-confirm-remove-cart-item')
    await user.click(within(modal).getByRole('button', { name: 'Remove' }))
    expect(baseUseCartResult.removeItem).toHaveBeenCalledWith('line-1')
  })

  it('signed in: shows the API error in a banner', async () => {
    const user = userEvent.setup()
    mockUseCart.mockReturnValue({
      ...baseUseCartResult,
      changeQuantity: jest.fn(async () => ({
        ok: false as const,
        error: 'Only 3 left for this variant',
      })),
    })
    render(<CartPageContent />)

    const [firstLineIncrease] = screen.getAllByRole('button', {
      name: 'Increase quantity',
    })
    await user.click(firstLineIncrease)

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Only 3 left for this variant',
      ),
    )
  })

  it('shows the merge notice', async () => {
    act(() => {
      useCartStore.setState({ mergeNotice: 'Some items changed' })
    })

    const { unmount } = render(<CartPageContent />)

    expect(screen.getByRole('alert')).toHaveTextContent('Some items changed')
    unmount()
    await waitFor(() => expect(useCartStore.getState().mergeNotice).toBeNull())
  })

  it('keeps the merge notice under Strict Mode', async () => {
    act(() => {
      useCartStore.setState({ mergeNotice: 'Some items changed' })
    })

    render(
      <StrictMode>
        <CartPageContent />
      </StrictMode>,
    )

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(screen.getByRole('alert')).toHaveTextContent('Some items changed')
  })

  it('shows the merge notice when every line was skipped', () => {
    mockUseCart.mockReturnValue({
      ...baseUseCartResult,
      items: [],
      itemCount: 0,
    })
    act(() => {
      useCartStore.setState({ mergeNotice: 'Some items changed' })
    })

    render(<CartPageContent />)

    expect(screen.getByText('Your cart is empty.')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Some items changed')
  })

  it('blocks checkout for a line above the stock', () => {
    mockUseCart.mockReturnValue({
      ...baseUseCartResult,
      items: baseUseCartResult.items.map((item, index) =>
        index === 0
          ? { ...item, quantity: 5, maxQuantity: 3, exceedsStock: true }
          : item,
      ),
    })

    render(<CartPageContent />)

    expect(screen.getByRole('alert')).toHaveTextContent(
      CART_CHECKOUT_BLOCKED_MESSAGE,
    )
    expect(
      screen.getByRole('button', { name: 'Proceed to Checkout' }),
    ).toBeDisabled()
  })

  it('sends one change at a time for a line', async () => {
    const user = userEvent.setup()
    let settle: (value: { ok: true }) => void = () => undefined
    const changeQuantity = jest.fn(
      () =>
        new Promise<{ ok: true }>((resolve) => {
          settle = resolve
        }),
    )
    mockUseCart.mockReturnValue({ ...baseUseCartResult, changeQuantity })
    render(<CartPageContent />)

    const [firstLineIncrease] = screen.getAllByRole('button', {
      name: 'Increase quantity',
    })
    await user.click(firstLineIncrease)
    await user.click(firstLineIncrease)
    expect(changeQuantity).toHaveBeenCalledTimes(1)
    expect(
      screen.getByRole('button', { name: 'Remove Ethiopian Yirgacheffe' }),
    ).toBeDisabled()

    await act(async () => {
      settle({ ok: true })
    })
    expect(
      screen.getByRole('button', { name: 'Remove Ethiopian Yirgacheffe' }),
    ).toBeEnabled()
  })

  it('shows the fallback error when a cart action throws', async () => {
    const user = userEvent.setup()
    mockUseCart.mockReturnValue({
      ...baseUseCartResult,
      changeQuantity: jest.fn(async () => {
        throw new Error('token failed')
      }),
    })
    render(<CartPageContent />)

    const [firstLineIncrease] = screen.getAllByRole('button', {
      name: 'Increase quantity',
    })
    await user.click(firstLineIncrease)

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        API_FALLBACK_ERRORS.CART_UPDATE,
      ),
    )
  })
})
