import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type React from 'react'
import { useRouter } from 'next/navigation'
import { ShippingMethodStatus } from '@repo/constants'

import { useAuth } from '@/hooks/useAuth'
import { useCart, type UseCartResult } from '@/hooks/useCart'
import {
  useActiveShippingMethods,
  type UseActiveShippingMethodsResult,
} from '@/hooks/useShippingMethod'
import CheckoutPageContent from '@/sections/CheckoutPageContent'
import { useCartStore } from '@/store/useCartStore'
import type { ShippingMethod } from '@/types/shippingMethod'

jest.mock('next/navigation', () => ({ useRouter: jest.fn() }))
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))
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
// Records the props of every render, to catch a frame without a selection.
const mockRecordShippingProps = jest.fn()
jest.mock('@/components/CheckoutShippingMethods', () => {
  const { createElement } = jest.requireActual('react')
  const actual = jest.requireActual('@/components/CheckoutShippingMethods')
  return {
    __esModule: true,
    default: (props: { methods: { id: string }[]; selectedId: string }) => {
      mockRecordShippingProps(props)
      return createElement(actual.default, props)
    },
  }
})
jest.mock('@/store/useCartStore', () => ({ useCartStore: jest.fn() }))
jest.mock('@/hooks/useCart', () => ({ useCart: jest.fn() }))
jest.mock('@/hooks/useAuth', () => ({ useAuth: jest.fn() }))
jest.mock('@/hooks/useShippingMethod', () => ({
  useActiveShippingMethods: jest.fn(),
}))
jest.mock('@/services/mapboxGeocode', () => ({
  findMapboxAddressSuggestions: jest
    .fn()
    .mockResolvedValue({ ok: true, suggestions: [] }),
  mapboxFeatureToCheckoutAddress: jest.fn(),
}))

const mockUseRouter = jest.mocked(useRouter)
const mockUseCartStore = jest.mocked(useCartStore)
const mockUseCart = jest.mocked(useCart)
const mockUseAuth = jest.mocked(useAuth)
const mockUseShippingMethods = jest.mocked(useActiveShippingMethods)

const standard: ShippingMethod = {
  id: 'standard-id',
  name: 'Artisanal Standard',
  description: '3-5 business days',
  price: 0,
  status: ShippingMethodStatus.ACTIVE,
  createdAt: '2026-11-24T00:00:00.000Z',
  updatedAt: '2026-11-24T00:00:00.000Z',
  deletedAt: null,
}

const express: ShippingMethod = {
  ...standard,
  id: 'express-id',
  name: 'Roast Express',
  description: '1-2 business days',
  price: 12,
}

const setItemSnapshots = jest.fn()
const clearCart = jest.fn()

const cartResult = {
  items: [
    {
      id: 'line-1',
      variantId: 'variant-1',
      productId: 'product-1',
      name: 'Ethiopian Yirgacheffe',
      meta: 'Light Roast',
      imageUrl: '/images/empty-image.webp',
      unitPrice: 24,
      quantity: 1,
      maxQuantity: 20,
    },
  ],
  totals: { subtotal: 24, shipping: null, tax: 0, total: 24 },
  itemCount: 1,
  isServerCart: true,
  isLoading: false,
  isError: false,
  errorMessage: null,
  refetch: jest.fn(),
  addItem: jest.fn(async () => ({ ok: true as const })),
  changeQuantity: jest.fn(async () => ({ ok: true as const })),
  removeItem: jest.fn(async () => ({ ok: true as const })),
} satisfies UseCartResult

const shippingResult = (
  overrides: Partial<UseActiveShippingMethodsResult> = {},
): UseActiveShippingMethodsResult => ({
  shippingMethods: [],
  isLoading: false,
  isFetching: false,
  isError: false,
  errorMessage: null,
  refetch: jest.fn().mockResolvedValue(undefined),
  ...overrides,
})

const deliverySpeed = () =>
  within(screen.getByRole('region', { name: 'Delivery Speed' }))

const totalText = () =>
  screen.getByText('Total').nextElementSibling?.textContent ?? ''

const placeOrderButton = () =>
  screen.getByRole('button', { name: /place order/i })

describe('CheckoutPageContent', () => {
  beforeEach(() => {
    setItemSnapshots.mockClear()
    mockUseRouter.mockReturnValue({
      push: jest.fn(),
    } as unknown as ReturnType<typeof useRouter>)
    mockUseCart.mockReturnValue(cartResult)
    mockUseCartStore.mockReturnValue({ clearCart, setItemSnapshots })
    mockUseAuth.mockReturnValue({ user: null } as unknown as ReturnType<
      typeof useAuth
    >)
  })

  it('AC1: offers the ACTIVE methods from the API with their fees', () => {
    mockUseShippingMethods.mockReturnValue(
      shippingResult({ shippingMethods: [standard, express] }),
    )

    render(<CheckoutPageContent />)

    expect(
      deliverySpeed().getByRole('radio', { name: 'Artisanal Standard' }),
    ).toBeInTheDocument()
    expect(
      deliverySpeed().getByRole('radio', { name: 'Roast Express' }),
    ).toBeInTheDocument()
    expect(deliverySpeed().getByText('Free')).toBeInTheDocument()
    expect(deliverySpeed().getByText('$12.00')).toBeInTheDocument()
  })

  it('AC2: offers only the methods the API lists', () => {
    mockUseShippingMethods.mockReturnValue(
      shippingResult({ shippingMethods: [standard] }),
    )

    render(<CheckoutPageContent />)

    expect(
      deliverySpeed().getByRole('radio', { name: 'Artisanal Standard' }),
    ).toBeInTheDocument()
    expect(
      deliverySpeed().queryByRole('radio', { name: 'Roast Express' }),
    ).not.toBeInTheDocument()
  })

  it('preselects the first method the API returns', () => {
    mockUseShippingMethods.mockReturnValue(
      shippingResult({ shippingMethods: [express, standard] }),
    )

    render(<CheckoutPageContent />)

    expect(
      deliverySpeed().getByRole('radio', { name: 'Roast Express' }),
    ).toBeChecked()
    expect(totalText()).toBe('$36.00')
  })

  it('checks a method on every render that has the list', () => {
    mockRecordShippingProps.mockClear()
    mockUseShippingMethods.mockReturnValue(
      shippingResult({ shippingMethods: [standard, express] }),
    )

    render(<CheckoutPageContent />)

    const renders = mockRecordShippingProps.mock.calls.map(
      ([props]) => props as { methods: { id: string }[]; selectedId: string },
    )
    expect(renders.length).toBeGreaterThan(0)
    for (const { methods, selectedId } of renders) {
      expect(methods.map(({ id }) => id)).toContain(selectedId)
    }
  })

  it('AC3: picking Roast Express adds $12 to the total', async () => {
    const user = userEvent.setup()
    mockUseShippingMethods.mockReturnValue(
      shippingResult({ shippingMethods: [standard, express] }),
    )

    render(<CheckoutPageContent />)
    expect(totalText()).toBe('$24.00')

    await user.click(
      deliverySpeed().getByRole('radio', { name: 'Roast Express' }),
    )

    expect(totalText()).toBe('$36.00')
  })

  it('selects the first method when the selected one is no longer listed', async () => {
    const user = userEvent.setup()
    mockUseShippingMethods.mockReturnValue(
      shippingResult({ shippingMethods: [standard, express] }),
    )

    const { rerender } = render(<CheckoutPageContent />)
    await user.click(
      deliverySpeed().getByRole('radio', { name: 'Roast Express' }),
    )
    mockUseShippingMethods.mockReturnValue(
      shippingResult({ shippingMethods: [standard] }),
    )
    rerender(<CheckoutPageContent />)

    expect(
      deliverySpeed().getByRole('radio', { name: 'Artisanal Standard' }),
    ).toBeChecked()
    expect(totalText()).toBe('$24.00')
  })

  it.each([
    ['loading', { isLoading: true }],
    ['failed', { isError: true }],
    ['empty', {}],
  ] as const)(
    'disables Place Order while no method is selected (%s)',
    (_state, overrides) => {
      mockUseShippingMethods.mockReturnValue(shippingResult(overrides))

      render(<CheckoutPageContent />)

      expect(placeOrderButton()).toBeDisabled()
    },
  )

  it('enables Place Order once a method is selected', () => {
    mockUseShippingMethods.mockReturnValue(
      shippingResult({ shippingMethods: [standard] }),
    )

    render(<CheckoutPageContent />)

    expect(placeOrderButton()).toBeEnabled()
  })

  it('places the mocked order with the selected method', async () => {
    const user = userEvent.setup()
    mockUseShippingMethods.mockReturnValue(
      shippingResult({ shippingMethods: [standard, express] }),
    )

    render(<CheckoutPageContent />)
    const fields: [string, string][] = [
      ['First Name', 'Ada'],
      ['Last Name', 'Lovelace'],
      ['Phone Number', '0912345678'],
      ['Delivery Address', '12 Roast Street'],
      ['City', 'Hanoi'],
      ['District', 'Ba Dinh'],
      ['Ward', 'Kim Ma'],
      ['Postal Code', '100000'],
    ]
    for (const [label, value] of fields) {
      await user.type(screen.getByLabelText(label), value)
    }
    await user.click(
      deliverySpeed().getByRole('radio', { name: 'Roast Express' }),
    )
    await user.click(placeOrderButton())

    expect(setItemSnapshots).toHaveBeenCalledWith(
      expect.objectContaining({
        shippingMethodId: express.id,
        shippingMethodName: 'Roast Express',
        shippingFee: 12,
      }),
    )
  })

  it("lists the server cart's lines in the order summary", () => {
    mockUseShippingMethods.mockReturnValue(
      shippingResult({ shippingMethods: [standard] }),
    )

    render(<CheckoutPageContent />)

    expect(screen.getByText('Ethiopian Yirgacheffe')).toBeInTheDocument()
    expect(placeOrderButton()).toBeEnabled()
  })

  it('disables Place Order when a server line is unavailable', () => {
    mockUseShippingMethods.mockReturnValue(
      shippingResult({ shippingMethods: [standard] }),
    )
    mockUseCart.mockReturnValue({
      ...cartResult,
      items: cartResult.items.map((item) => ({ ...item, isUnavailable: true })),
    })

    render(<CheckoutPageContent />)

    expect(placeOrderButton()).toBeDisabled()
  })

  it('disables Place Order while the cart loads', () => {
    mockUseShippingMethods.mockReturnValue(
      shippingResult({ shippingMethods: [standard] }),
    )
    mockUseCart.mockReturnValue({ ...cartResult, isLoading: true })

    render(<CheckoutPageContent />)

    expect(screen.queryByRole('button', { name: /place order/i })).toBeNull()
  })

  it('disables Place Order when a server line is above the stock', () => {
    mockUseShippingMethods.mockReturnValue(
      shippingResult({ shippingMethods: [standard] }),
    )
    mockUseCart.mockReturnValue({
      ...cartResult,
      items: cartResult.items.map((item) => ({ ...item, exceedsStock: true })),
    })

    render(<CheckoutPageContent />)

    expect(placeOrderButton()).toBeDisabled()
  })

  it('sends one removal at a time for a line', async () => {
    const user = userEvent.setup()
    mockUseShippingMethods.mockReturnValue(
      shippingResult({ shippingMethods: [standard] }),
    )
    const removeItem = jest.fn(() => new Promise<{ ok: true }>(() => undefined))
    mockUseCart.mockReturnValue({ ...cartResult, removeItem })

    render(<CheckoutPageContent />)
    const remove = screen.getByRole('button', {
      name: 'Remove Ethiopian Yirgacheffe from order',
    })
    await user.click(remove)
    await user.click(remove)

    expect(removeItem).toHaveBeenCalledTimes(1)
  })
})
