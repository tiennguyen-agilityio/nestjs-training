import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  DiscountType,
  ProductStatus,
  ProductUnit,
  RoastLevel,
} from '@repo/constants'

import { ProductPurchasePanel } from '@/components/ProductPurchasePanel'
import { API_FALLBACK_ERRORS } from '@/constants/messages'
import { ROUTES } from '@/constants/routes'
import { useCart, type UseCartResult } from '@/hooks/useCart'
import type { Product } from '@/types/product'

jest.mock('next/navigation', () => ({ useRouter: jest.fn() }))
jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
}))
jest.mock('@/hooks/useCart', () => ({ useCart: jest.fn() }))

const push = jest.fn()
const addItem = jest.fn()

const product = (stockQuantity = 5): Product => ({
  id: 'p1',
  categoryId: 'c1',
  name: 'Colombia Huila',
  description: 'Balanced and sweet.',
  roastLevel: RoastLevel.MEDIUM,
  isOrganic: false,
  isFairTrade: false,
  status: ProductStatus.ACTIVE,
  tastingNotes: 'Caramel',
  origin: 'Huila, Colombia',
  processingMethod: 'Washed',
  variants: [
    {
      id: 'v1',
      size: 250,
      unit: ProductUnit.G,
      name: '250g',
      price: 14,
      discountType: null,
      discountValue: null,
      stockQuantity,
    },
  ],
  images: [],
  createdAt: null,
  updatedAt: null,
  deletedAt: null,
})

describe('ProductPurchasePanel', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.mocked(useRouter).mockReturnValue({
      push,
    } as unknown as ReturnType<typeof useRouter>)
    jest.mocked(useCart).mockReturnValue({
      addItem,
    } as unknown as UseCartResult)
  })

  it('signed in: adds through the API, toasts and goes to the cart', async () => {
    const user = userEvent.setup()
    addItem.mockResolvedValue({ ok: true })
    render(<ProductPurchasePanel product={product()} />)

    await user.click(screen.getByRole('button', { name: 'Increase quantity' }))
    await user.click(screen.getByRole('button', { name: 'Add to Cart' }))

    expect(addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        variantId: 'v1',
        productId: 'p1',
        quantity: 2,
      }),
    )
    await waitFor(() => expect(push).toHaveBeenCalledWith(ROUTES.CART))
    expect(jest.mocked(toast.success)).toHaveBeenCalledWith('Added to cart', {
      description: '2 × Colombia Huila',
    })
  })

  it('signed in: shows the API error and stays', async () => {
    const user = userEvent.setup()
    addItem.mockResolvedValue({
      ok: false,
      error: 'Only 3 left for this variant',
    })
    render(<ProductPurchasePanel product={product()} />)

    await user.click(screen.getByRole('button', { name: 'Add to Cart' }))

    await waitFor(() =>
      expect(jest.mocked(toast.error)).toHaveBeenCalledWith(
        'Only 3 left for this variant',
      ),
    )
    expect(push).not.toHaveBeenCalled()
  })

  it('disables Add to Cart when out of stock', () => {
    render(<ProductPurchasePanel product={product(0)} />)

    expect(screen.getByRole('button', { name: 'Add to Cart' })).toBeDisabled()
  })

  it('re-enables Add to Cart when adding throws', async () => {
    const user = userEvent.setup()
    addItem.mockRejectedValue(new Error('token failed'))
    render(<ProductPurchasePanel product={product()} />)

    await user.click(screen.getByRole('button', { name: 'Add to Cart' }))

    await waitFor(() =>
      expect(jest.mocked(toast.error)).toHaveBeenCalledWith(
        API_FALLBACK_ERRORS.CART_ADD,
      ),
    )
    expect(screen.getByRole('button', { name: 'Add to Cart' })).toBeEnabled()
    expect(push).not.toHaveBeenCalled()
  })

  it('adds the sale price and the list price', async () => {
    const user = userEvent.setup()
    addItem.mockResolvedValue({ ok: true })
    const discounted = product()
    discounted.variants[0] = {
      ...discounted.variants[0],
      price: 20,
      discountType: DiscountType.PERCENT,
      discountValue: 25,
    }
    render(<ProductPurchasePanel product={discounted} />)

    await user.click(screen.getByRole('button', { name: 'Add to Cart' }))

    expect(addItem).toHaveBeenCalledWith(
      expect.objectContaining({ unitPrice: 15, listPrice: 20 }),
    )
  })
})
