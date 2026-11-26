import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  OrderPaymentStatus,
  OrderStatus,
  PaymentMethod,
  ShippingMethodStatus,
  ShippingStatus,
  VALIDATION_MESSAGES,
} from '@repo/constants'

import {
  API_FALLBACK_ERRORS,
  ERROR_MESSAGES,
  NOTICE_MESSAGES,
  SUCCESS_MESSAGES,
} from '@/constants/messages'
import { orderSuccessPath, profileOrderPath, ROUTES } from '@/constants/routes'
import { useAuth } from '@/hooks/useAuth'
import { cartQueryKeys, useCart, type UseCartResult } from '@/hooks/useCart'
import { useCreateOrder } from '@/hooks/useOrder'
import { useCapturePayment, useStartPayment } from '@/hooks/usePayment'
import {
  useActiveShippingMethods,
  type UseActiveShippingMethodsResult,
} from '@/hooks/useShippingMethod'
import CheckoutPageContent from '@/sections/CheckoutPageContent'
import { findMapboxAddressSuggestions } from '@/services/mapboxGeocode'
import { useCartStore } from '@/store/useCartStore'
import type { PlacedOrder } from '@/types/order'
import type { ShippingMethod } from '@/types/shippingMethod'
import type { User, UserAddress } from '@/types/user'
import { ServiceError } from '@/utils/query'

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
jest.mock('@/hooks/useCart', () => ({
  useCart: jest.fn(),
  cartQueryKeys: { root: ['cart'], detail: (id: string) => ['cart', id] },
}))
jest.mock('@/hooks/useOrder', () => ({ useCreateOrder: jest.fn() }))
jest.mock('@/hooks/usePayment', () => ({
  useCapturePayment: jest.fn(),
  useStartPayment: jest.fn(),
}))
jest.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ getToken: jest.fn().mockResolvedValue('session-token') }),
}))
jest.mock('@/hooks/useAuth', () => ({ useAuth: jest.fn() }))
// The real SDK loads PayPal's script: a button that runs the popup's callbacks.
jest.mock(
  '@paypal/react-paypal-js/sdk-v6',
  () => ({
    PayPalProvider: ({ children }: { children: React.ReactNode }) => (
      <>{children}</>
    ),
    PayPalOneTimePaymentButton: (props: {
      createOrder: () => Promise<{ orderId: string }>
      onApprove: () => Promise<void>
      onCancel: () => void
    }) => (
      <>
        <button
          type="button"
          onClick={async () => {
            try {
              await props.createOrder()
              await props.onApprove()
            } catch {
              // The SDK reports a rejected createOrder through onError.
            }
          }}
        >
          PayPal
        </button>
        <button
          type="button"
          onClick={async () => {
            try {
              await props.createOrder()
              props.onCancel()
            } catch {
              // as above
            }
          }}
        >
          PayPal then cancel
        </button>
      </>
    ),
  }),
  { virtual: true },
)
jest.mock('@/hooks/useShippingMethod', () => ({
  useActiveShippingMethods: jest.fn(),
}))
jest.mock('@/services/mapboxGeocode', () => ({
  ...jest.requireActual('@/services/mapboxGeocode'),
  findMapboxAddressSuggestions: jest
    .fn()
    .mockResolvedValue({ ok: true, suggestions: [] }),
}))

const mockUseRouter = jest.mocked(useRouter)
const mockUseCartStore = jest.mocked(useCartStore)
const mockUseCart = jest.mocked(useCart)
const mockUseAuth = jest.mocked(useAuth)
const refreshUser = jest.fn()
const mockUseShippingMethods = jest.mocked(useActiveShippingMethods)
const mockUseCreateOrder = jest.mocked(useCreateOrder)
const mutateAsync = jest.fn()
const startPaymentMutate = jest.fn()
const capturePaymentMutate = jest.fn()
const push = jest.fn()
const replace = jest.fn()
const checkout = {
  paymentId: 'p-1',
  checkoutId: 'cs_1',
  checkoutUrl: 'https://checkout.stripe.com/c/s',
  expiresAt: '2026-11-25T00:00:00.000Z',
}

let queryClient: QueryClient
let invalidateQueries: jest.SpyInstance
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
)
const renderCheckout = () => render(<CheckoutPageContent />, { wrapper })

const placedOrder: PlacedOrder = {
  id: 'order-1',
  orderNumber: 'NB-000123',
  userId: 'user-1',
  shippingMethodId: 'express-id',
  status: OrderStatus.PENDING,
  shippingStatus: ShippingStatus.PENDING,
  paymentStatus: OrderPaymentStatus.UNPAID,
  recipientName: 'Ada Lovelace',
  recipientPhone: '0912345678',
  addressLine: '12 Roast Street',
  ward: 'Kim Ma',
  district: 'Ba Dinh',
  city: 'Hanoi',
  postalCode: '100000',
  shippingMethodName: 'Roast Express',
  shippingFee: 12,
  tax: 2.4,
  subTotal: 24,
  totalAmount: 115,
  note: null,
  expiresAt: null,
  items: [],
  payments: [],
  createdAt: '2026-11-24T00:00:00.000Z',
  updatedAt: '2026-11-24T00:00:00.000Z',
}

const OUT_OF_STOCK_DESCRIPTION = 'Update your cart and try again.'

const lineError = (errCode: string, description: string) =>
  new ServiceError('Validation failed', [
    {
      errCode,
      field: 'items.0.productVariantId',
      message: 'Only 0 left for SKU-1',
      description,
    },
  ])

const fillForm = async (user: ReturnType<typeof userEvent.setup>) => {
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
  // Paste, not type: typing every key makes the slower tests time out
  // under coverage instrumentation.
  for (const [label, value] of fields) {
    await user.click(screen.getByLabelText(label))
    await user.paste(value)
  }
}

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

const savedAddress: UserAddress = {
  id: 'address-1',
  userId: 'user-1',
  addressLine: '12 Roast Street',
  ward: 'Ben Nghe',
  district: 'District 1',
  city: 'Ho Chi Minh',
  postalCode: '700000',
  isDefault: true,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
}

const otherAddress: UserAddress = {
  ...savedAddress,
  id: 'address-2',
  addressLine: '5 Side Lane',
  isDefault: false,
}

const deliverySpeed = () =>
  within(screen.getByRole('region', { name: 'Delivery Speed' }))

const totalText = () =>
  screen.getByText('Total').nextElementSibling?.textContent ?? ''

const pickCashOnDelivery = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('radio', { name: /cash on delivery/i }))

// The submit button: "Continue to payment" for a card payment, "Place Order" for cash on delivery.
const placeOrderButton = () =>
  screen.getByRole('button', { name: /^(place order|continue to payment)$/i })

describe('CheckoutPageContent', () => {
  beforeEach(() => {
    setItemSnapshots.mockClear()
    clearCart.mockClear()
    push.mockClear()
    replace.mockClear()
    mutateAsync.mockReset()
    startPaymentMutate.mockReset()
    startPaymentMutate.mockResolvedValue(checkout)
    jest.mocked(toast.success).mockClear()
    jest.mocked(toast.error).mockClear()
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    invalidateQueries = jest.spyOn(queryClient, 'invalidateQueries')
    mockUseCreateOrder.mockReturnValue({
      mutateAsync,
    } as unknown as ReturnType<typeof useCreateOrder>)
    mockUseRouter.mockReturnValue({
      push,
      replace,
    } as unknown as ReturnType<typeof useRouter>)
    jest.mocked(useStartPayment).mockReturnValue({
      mutateAsync: startPaymentMutate,
    } as unknown as ReturnType<typeof useStartPayment>)
    capturePaymentMutate.mockReset()
    jest.mocked(useCapturePayment).mockReturnValue({
      mutateAsync: capturePaymentMutate,
    } as unknown as ReturnType<typeof useCapturePayment>)
    mockUseCart.mockReturnValue(cartResult)
    mockUseCartStore.mockReturnValue({ clearCart, setItemSnapshots })
    refreshUser.mockReset()
    refreshUser.mockResolvedValue(undefined)
    mockUseAuth.mockReturnValue({
      user: null,
      refresh: refreshUser,
    } as unknown as ReturnType<typeof useAuth>)
    jest.mocked(findMapboxAddressSuggestions).mockClear()
  })

  describe('prefill', () => {
    const profile = (overrides: Partial<User> = {}) =>
      mockUseAuth.mockReturnValue({
        user: {
          id: 'user-1',
          email: 'jane@example.com',
          firstName: 'Jane',
          lastName: 'Doe',
          phoneNumber: '0912345678',
          name: 'Jane Doe',
          avatarUrl: null,
          addresses: [],
          ...overrides,
        },
        refresh: refreshUser,
      } as unknown as ReturnType<typeof useAuth>)

    const field = (name: string) =>
      screen.getByRole<HTMLInputElement>('textbox', { name })

    it('prefills the address from the default address and the phone from the profile (R4, R6)', () => {
      profile({ addresses: [otherAddress, savedAddress] })
      mockUseShippingMethods.mockReturnValue(
        shippingResult({ shippingMethods: [standard] }),
      )

      const { unmount } = renderCheckout()

      expect(field('First Name').value).toBe('Jane')
      expect(field('Last Name').value).toBe('Doe')
      expect(field('Phone Number').value).toBe('0912345678')
      expect(field('Delivery Address').value).toBe('12 Roast Street')
      expect(field('City').value).toBe('Ho Chi Minh')
      expect(field('District').value).toBe('District 1')
      expect(field('Ward').value).toBe('Ben Nghe')
      expect(field('Postal Code').value).toBe('700000')

      unmount()
      profile({ phoneNumber: null })
      renderCheckout()

      expect(field('Phone Number').value).toBe('')
    })

    it('keeps what the shopper typed when the default address loads later (R4)', async () => {
      const user = userEvent.setup()
      profile()
      mockUseShippingMethods.mockReturnValue(
        shippingResult({ shippingMethods: [standard] }),
      )

      const { rerender } = renderCheckout()
      await user.click(field('Delivery Address'))
      await user.paste('5 Typed Lane')
      profile({ addresses: [savedAddress] })
      rerender(<CheckoutPageContent />)

      await waitFor(() => expect(field('First Name').value).toBe('Jane'))
      expect(field('Delivery Address').value).toBe('5 Typed Lane')
      expect(field('City').value).toBe('')
      expect(field('District').value).toBe('')
      expect(field('Ward').value).toBe('')
      expect(field('Postal Code').value).toBe('')
    })

    it('fills the default address when the shopper typed only a name (R4)', async () => {
      const user = userEvent.setup()
      mockUseShippingMethods.mockReturnValue(
        shippingResult({ shippingMethods: [standard] }),
      )

      const { rerender } = renderCheckout()
      await user.click(field('First Name'))
      await user.paste('Ada')
      profile({ addresses: [savedAddress] })
      rerender(<CheckoutPageContent />)

      await waitFor(() =>
        expect(field('Delivery Address').value).toBe('12 Roast Street'),
      )
      expect(field('City').value).toBe('Ho Chi Minh')
      expect(field('District').value).toBe('District 1')
      expect(field('Ward').value).toBe('Ben Nghe')
      expect(field('Postal Code').value).toBe('700000')
      expect(field('First Name').value).toBe('Ada')
    })

    it('keeps district, ward and postal code while the shopper edits the address line', async () => {
      const user = userEvent.setup()
      profile({ addresses: [savedAddress] })
      mockUseShippingMethods.mockReturnValue(
        shippingResult({ shippingMethods: [standard] }),
      )

      renderCheckout()
      await user.type(field('Delivery Address'), 'A')

      expect(field('Delivery Address').value).toBe('12 Roast StreetA')
      expect(field('City').value).toBe('Ho Chi Minh')
      expect(field('District').value).toBe('District 1')
      expect(field('Ward').value).toBe('Ben Nghe')
      expect(field('Postal Code').value).toBe('700000')
    })

    it('keeps the typed house number when the shopper picks a street suggestion', async () => {
      const user = userEvent.setup()
      const placeName =
        'Nguyễn Huệ, 56100, Phường 5, Tuy Hòa, Đắk Lắk, Việt Nam'
      jest.mocked(findMapboxAddressSuggestions).mockResolvedValueOnce({
        ok: true,
        suggestions: [
          {
            id: 'address.1',
            placeName,
            primaryText: 'Nguyễn Huệ',
            secondaryText: '56100, Phường 5, Tuy Hòa, Đắk Lắk, Việt Nam',
            feature: {
              id: 'address.1',
              type: 'Feature',
              place_type: ['address'],
              text: 'Nguyễn Huệ',
              place_name: placeName,
              properties: { accuracy: 'street' },
              context: [
                { id: 'postcode.1', text: '56100' },
                { id: 'place.1', text: 'Tuy Hòa' },
              ],
            },
          },
        ],
      })
      mockUseShippingMethods.mockReturnValue(
        shippingResult({ shippingMethods: [standard] }),
      )

      renderCheckout()
      await user.type(field('Delivery Address'), '45 Nguyễn Huệ')
      await user.click(
        await screen.findByRole('button', { name: /^Nguyễn Huệ/ }),
      )

      expect(field('Delivery Address').value).toBe('45 Nguyễn Huệ')
      expect(field('City').value).toBe('Tuy Hòa')
      expect(field('Postal Code').value).toBe('56100')
    })

    it('a prefilled address does not look up suggestions', async () => {
      profile({ addresses: [savedAddress] })
      mockUseShippingMethods.mockReturnValue(
        shippingResult({ shippingMethods: [standard] }),
      )

      renderCheckout()
      await act(() => new Promise((resolve) => setTimeout(resolve, 400)))

      expect(field('Delivery Address').value).toBe('12 Roast Street')
      expect(findMapboxAddressSuggestions).not.toHaveBeenCalled()
    })

    it.each([
      ['has no saved address', []],
      ['has no default address', [{ ...savedAddress, isDefault: false }]],
    ])('leaves the address empty when the user %s', async (_, addresses) => {
      const user = userEvent.setup()
      profile({ addresses })
      mockUseShippingMethods.mockReturnValue(
        shippingResult({ shippingMethods: [standard] }),
      )

      renderCheckout()

      expect(field('Delivery Address').value).toBe('')
      await fillForm(user)
      expect(placeOrderButton()).toBeEnabled()
    })

    it.each([['COD'], ['STRIPE']])(
      'reads the user again after a placed order (%s)',
      async (method) => {
        const user = userEvent.setup()
        mutateAsync.mockResolvedValue(placedOrder)
        mockUseShippingMethods.mockReturnValue(
          shippingResult({ shippingMethods: [standard] }),
        )

        renderCheckout()
        await fillForm(user)
        if (method === 'COD') await pickCashOnDelivery(user)
        await user.click(placeOrderButton())

        await waitFor(() => expect(refreshUser).toHaveBeenCalledTimes(1))
      },
    )
  })

  it('AC1: offers the ACTIVE methods from the API with their fees', () => {
    mockUseShippingMethods.mockReturnValue(
      shippingResult({ shippingMethods: [standard, express] }),
    )

    renderCheckout()

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

    renderCheckout()

    expect(
      deliverySpeed().getByRole('radio', { name: 'Artisanal Standard' }),
    ).toBeInTheDocument()
    expect(
      deliverySpeed().queryByRole('radio', { name: 'Roast Express' }),
    ).not.toBeInTheDocument()
  })

  it('keeps checkout to one shrinkable column below lg so a long name cannot widen the page', () => {
    renderCheckout()

    expect(
      screen
        .getByRole('region', { name: 'Shipping Information' })
        .closest('form')?.parentElement,
    ).toHaveClass('grid-cols-1')
  })

  it('preselects the first method the API returns', () => {
    mockUseShippingMethods.mockReturnValue(
      shippingResult({ shippingMethods: [express, standard] }),
    )

    renderCheckout()

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

    renderCheckout()

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

    renderCheckout()
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

    const { rerender } = renderCheckout()
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

      renderCheckout()

      expect(placeOrderButton()).toBeDisabled()
    },
  )

  it('labels the button Continue to payment for a card payment and Place Order for cash on delivery', async () => {
    const user = userEvent.setup()
    mockUseShippingMethods.mockReturnValue(
      shippingResult({ shippingMethods: [standard] }),
    )

    renderCheckout()

    expect(
      screen.getByRole('button', { name: 'Continue to payment' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Place Order' }),
    ).not.toBeInTheDocument()

    await pickCashOnDelivery(user)

    expect(
      screen.getByRole('button', { name: 'Place Order' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Continue to payment' }),
    ).not.toBeInTheDocument()
  })

  it('keeps all digits of a pasted formatted phone number', async () => {
    const user = userEvent.setup()
    mockUseShippingMethods.mockReturnValue(
      shippingResult({ shippingMethods: [standard] }),
    )
    renderCheckout()

    const phone = screen.getByRole<HTMLInputElement>('textbox', {
      name: 'Phone Number',
    })
    await user.clear(phone)
    await user.click(phone)
    await user.paste('090 123 4567')

    expect(phone.value).toBe('0901234567')
  })

  it('keeps every digit of a number with a country code, so it fails the format', async () => {
    const user = userEvent.setup()
    mockUseShippingMethods.mockReturnValue(
      shippingResult({ shippingMethods: [standard] }),
    )
    renderCheckout()

    const phone = screen.getByRole<HTMLInputElement>('textbox', {
      name: 'Phone Number',
    })
    await user.clear(phone)
    await user.click(phone)
    await user.paste('+84 90 123 4567')
    await user.tab()

    expect(phone.value).toBe('84901234567')
    expect(
      screen.getByText(VALIDATION_MESSAGES.invalidFormat('Phone')),
    ).toBeInTheDocument()
  })

  it('validates a Shipping Information field when it loses focus', async () => {
    const user = userEvent.setup()
    mockUseShippingMethods.mockReturnValue(
      shippingResult({ shippingMethods: [standard] }),
    )
    renderCheckout()

    const city = screen.getByRole('textbox', { name: 'City' })
    await user.clear(city)
    expect(screen.queryByText(ERROR_MESSAGES.CITY_REQUIRED)).toBeNull()

    await user.tab()
    expect(screen.getByText(ERROR_MESSAGES.CITY_REQUIRED)).toBeInTheDocument()

    // Typing clears it again; a valid value stays clear on the next blur.
    await user.type(city, 'Hanoi')
    expect(screen.queryByText(ERROR_MESSAGES.CITY_REQUIRED)).toBeNull()
    await user.tab()
    expect(screen.queryByText(ERROR_MESSAGES.CITY_REQUIRED)).toBeNull()
  })

  it('shows the phone format error on blur', async () => {
    const user = userEvent.setup()
    mockUseShippingMethods.mockReturnValue(
      shippingResult({ shippingMethods: [standard] }),
    )
    renderCheckout()

    const phone = screen.getByRole('textbox', { name: 'Phone Number' })
    await user.clear(phone)
    await user.type(phone, '09123')
    await user.tab()

    expect(
      screen.getByText(VALIDATION_MESSAGES.invalidFormat('Phone')),
    ).toBeInTheDocument()
  })

  it('orders the steps Shipping Information, Delivery Speed, Payment Method', () => {
    mockUseShippingMethods.mockReturnValue(
      shippingResult({ shippingMethods: [standard] }),
    )
    renderCheckout()

    const steps = [
      'Shipping Information',
      'Delivery Speed',
      'Payment Method',
    ].map((name) => screen.getByRole('region', { name }))
    expect(
      steps[0].compareDocumentPosition(steps[1]) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(
      steps[1].compareDocumentPosition(steps[2]) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    steps.forEach((step, index) =>
      expect(step).toHaveTextContent(new RegExp(`^${index + 1}`)),
    )
  })

  it('keeps only digits in Phone Number', async () => {
    const user = userEvent.setup()
    mockUseShippingMethods.mockReturnValue(
      shippingResult({ shippingMethods: [standard] }),
    )
    renderCheckout()

    const phone = screen.getByRole<HTMLInputElement>('textbox', {
      name: 'Phone Number',
    })
    await user.clear(phone)
    await user.type(phone, '09a1-2 3b4+5')

    expect(phone.value).toBe('0912345')
  })

  it('enables Place Order once a method is selected', () => {
    mockUseShippingMethods.mockReturnValue(
      shippingResult({ shippingMethods: [standard] }),
    )

    renderCheckout()

    expect(placeOrderButton()).toBeEnabled()
  })

  it('Place order sends the payload built from the form and the selected method', async () => {
    const user = userEvent.setup()
    mutateAsync.mockResolvedValue(placedOrder)
    mockUseShippingMethods.mockReturnValue(
      shippingResult({ shippingMethods: [standard, express] }),
    )

    renderCheckout()
    await fillForm(user)
    await user.click(
      deliverySpeed().getByRole('radio', { name: 'Roast Express' }),
    )
    await user.click(placeOrderButton())

    expect(mutateAsync).toHaveBeenCalledWith({
      body: {
        shippingMethodId: express.id,
        paymentMethod: PaymentMethod.CARD,
        recipientName: 'Ada Lovelace',
        recipientPhone: '0912345678',
        addressLine: '12 Roast Street',
        ward: 'Kim Ma',
        district: 'Ba Dinh',
        city: 'Hanoi',
        postalCode: '100000',
      },
      getToken: expect.any(Function),
    })
  })

  it('Place order is disabled while sending', async () => {
    const user = userEvent.setup()
    // Never settles: the request is still in flight.
    mutateAsync.mockReturnValue(new Promise<never>(() => undefined))
    mockUseShippingMethods.mockReturnValue(
      shippingResult({ shippingMethods: [standard] }),
    )

    renderCheckout()
    await fillForm(user)
    await user.click(placeOrderButton())

    expect(placeOrderButton()).toBeDisabled()
    await user.click(placeOrderButton())
    expect(mutateAsync).toHaveBeenCalledTimes(1)
  })

  it('success stores the PlacedOrder, toasts its totalAmount and goes to ROUTES.ORDER_SUCCESS', async () => {
    const user = userEvent.setup()
    mutateAsync.mockResolvedValue(placedOrder)
    mockUseShippingMethods.mockReturnValue(
      shippingResult({ shippingMethods: [standard] }),
    )

    renderCheckout()
    await fillForm(user)
    await pickCashOnDelivery(user)
    await user.click(placeOrderButton())

    await waitFor(() => expect(push).toHaveBeenCalledWith(ROUTES.ORDER_SUCCESS))
    expect(setItemSnapshots).toHaveBeenCalledWith(placedOrder)
    expect(toast.success).toHaveBeenCalledWith(SUCCESS_MESSAGES.ORDER_PLACED, {
      description: SUCCESS_MESSAGES.ORDER_TOTAL('$115.00'),
    })
  })

  it('a COD order goes to ROUTES.ORDER_SUCCESS without starting a payment', async () => {
    const user = userEvent.setup()
    mutateAsync.mockResolvedValue(placedOrder)
    mockUseShippingMethods.mockReturnValue(
      shippingResult({ shippingMethods: [standard] }),
    )

    renderCheckout()
    await fillForm(user)
    await pickCashOnDelivery(user)
    await user.click(placeOrderButton())

    await waitFor(() => expect(push).toHaveBeenCalledWith(ROUTES.ORDER_SUCCESS))
    expect(startPaymentMutate).not.toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()
  })

  it('a STRIPE order starts its payment and replaces the location with the checkoutUrl', async () => {
    const user = userEvent.setup()
    mutateAsync.mockResolvedValue(placedOrder)
    mockUseShippingMethods.mockReturnValue(
      shippingResult({ shippingMethods: [standard] }),
    )

    renderCheckout()
    await fillForm(user)
    await user.click(placeOrderButton())

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(checkout.checkoutUrl),
    )
    expect(startPaymentMutate).toHaveBeenCalledWith(placedOrder.id)
    expect(push).not.toHaveBeenCalled()
    expect(placeOrderButton()).toBeDisabled()
  })

  it('a failed payment start toasts the mapped error and pushes orderSuccessPath with the errCode', async () => {
    const user = userEvent.setup()
    mutateAsync.mockResolvedValue(placedOrder)
    startPaymentMutate.mockRejectedValue(
      new ServiceError('x', [
        {
          errCode: 'paymentGatewayUnavailable',
          field: 'id',
          message: 'x',
          description: 'y',
        },
      ]),
    )
    mockUseShippingMethods.mockReturnValue(
      shippingResult({ shippingMethods: [standard] }),
    )

    renderCheckout()
    await fillForm(user)
    await user.click(placeOrderButton())

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith(
        orderSuccessPath(placedOrder.id, 'paymentGatewayUnavailable'),
      ),
    )
    expect(toast.error).toHaveBeenCalledWith(
      ERROR_MESSAGES.PAYMENT_GATEWAY_UNAVAILABLE,
    )
    expect(
      screen.queryByText(API_FALLBACK_ERRORS.ORDER_CREATE),
    ).not.toBeInTheDocument()
    expect(mutateAsync).toHaveBeenCalledTimes(1)
    expect(replace).not.toHaveBeenCalled()
  })

  it('a payment start that fails without an errCode pushes the generic code', async () => {
    const user = userEvent.setup()
    mutateAsync.mockResolvedValue(placedOrder)
    startPaymentMutate.mockRejectedValue(new Error('x'))
    mockUseShippingMethods.mockReturnValue(
      shippingResult({ shippingMethods: [standard] }),
    )

    renderCheckout()
    await fillForm(user)
    await user.click(placeOrderButton())

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith(
        orderSuccessPath(placedOrder.id, 'unknown'),
      ),
    )
    expect(toast.error).toHaveBeenCalledWith(API_FALLBACK_ERRORS.PAYMENT_START)
  })

  it('success invalidates the cart query and does not call clearCart', async () => {
    const user = userEvent.setup()
    mutateAsync.mockResolvedValue(placedOrder)
    mockUseShippingMethods.mockReturnValue(
      shippingResult({ shippingMethods: [standard] }),
    )

    renderCheckout()
    await fillForm(user)
    await user.click(placeOrderButton())

    await waitFor(() =>
      expect(invalidateQueries).toHaveBeenCalledWith({
        queryKey: cartQueryKeys.root,
      }),
    )
    expect(clearCart).not.toHaveBeenCalled()
  })

  it.each([
    [
      'outOfStock',
      'Update your cart and try again.',
      ERROR_MESSAGES.ORDER_OUT_OF_STOCK('Ethiopian Yirgacheffe'),
    ],
    [
      'itemUnavailable',
      'Remove it from the cart and try again.',
      ERROR_MESSAGES.ORDER_ITEM_UNAVAILABLE('Ethiopian Yirgacheffe'),
    ],
  ])(
    'outOfStock names the product, tags the line and refetches the cart (%s)',
    async (errCode, description, pageMessage) => {
      const user = userEvent.setup()
      mutateAsync.mockRejectedValue(lineError(errCode, description))
      mockUseShippingMethods.mockReturnValue(
        shippingResult({ shippingMethods: [standard] }),
      )

      renderCheckout()
      await fillForm(user)
      await user.click(placeOrderButton())

      expect(await screen.findByText(pageMessage)).toBeInTheDocument()
      expect(screen.getByText(description)).toBeInTheDocument()
      expect(invalidateQueries).toHaveBeenCalledWith({
        queryKey: cartQueryKeys.root,
      })
      expect(push).not.toHaveBeenCalled()
      expect(placeOrderButton()).toBeDisabled()
    },
  )

  it('cartEmpty shows the message and refetches the cart', async () => {
    const user = userEvent.setup()
    mutateAsync.mockRejectedValue(
      new ServiceError('Cart is empty', [
        {
          errCode: 'cartEmpty',
          field: 'cart',
          message: 'Cart is empty',
          description: 'Add an item before checking out.',
        },
      ]),
    )
    mockUseShippingMethods.mockReturnValue(
      shippingResult({ shippingMethods: [standard] }),
    )

    renderCheckout()
    await fillForm(user)
    await user.click(placeOrderButton())

    expect(
      await screen.findByText(ERROR_MESSAGES.ORDER_CART_EMPTY),
    ).toBeInTheDocument()
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: cartQueryKeys.root,
    })
    expect(push).not.toHaveBeenCalled()
  })

  it('shippingMethodUnavailable refetches the methods and clears the selection', async () => {
    const user = userEvent.setup()
    const refetch = jest.fn().mockResolvedValue(undefined)
    mutateAsync.mockRejectedValue(
      new ServiceError('Shipping method is not available', [
        {
          errCode: 'shippingMethodUnavailable',
          field: 'shippingMethodId',
          message: 'Shipping method is not available',
          description: 'Choose another shipping method.',
        },
      ]),
    )
    mockUseShippingMethods.mockReturnValue(
      shippingResult({ shippingMethods: [standard, express], refetch }),
    )

    renderCheckout()
    await fillForm(user)
    await user.click(placeOrderButton())

    expect(
      await screen.findByText(ERROR_MESSAGES.ORDER_SHIPPING_METHOD_UNAVAILABLE),
    ).toBeInTheDocument()
    expect(refetch).toHaveBeenCalled()
    for (const name of ['Artisanal Standard', 'Roast Express']) {
      expect(deliverySpeed().getByRole('radio', { name })).not.toBeChecked()
    }
    expect(placeOrderButton()).toBeDisabled()

    await user.click(
      deliverySpeed().getByRole('radio', { name: 'Roast Express' }),
    )
    expect(placeOrderButton()).toBeEnabled()
  })

  it('a network error shows the fallback and lets the shopper retry', async () => {
    const user = userEvent.setup()
    mutateAsync.mockRejectedValue(
      new ServiceError(API_FALLBACK_ERRORS.ORDER_CREATE),
    )
    mockUseShippingMethods.mockReturnValue(
      shippingResult({ shippingMethods: [standard] }),
    )

    renderCheckout()
    await fillForm(user)
    await user.click(placeOrderButton())

    expect(
      await screen.findByText(API_FALLBACK_ERRORS.ORDER_CREATE),
    ).toBeInTheDocument()
    expect(placeOrderButton()).toBeEnabled()
    expect(push).not.toHaveBeenCalled()
  })

  it('an error without a description shows the web fallback, not the developer message', async () => {
    const user = userEvent.setup()
    mutateAsync.mockRejectedValue(
      new ServiceError('Unauthorized', [
        { errCode: 'unauthenticated', field: '', message: 'Token expired' },
      ]),
    )
    mockUseShippingMethods.mockReturnValue(
      shippingResult({ shippingMethods: [standard] }),
    )

    renderCheckout()
    await fillForm(user)
    await user.click(placeOrderButton())

    expect(
      await screen.findByText(API_FALLBACK_ERRORS.ORDER_CREATE),
    ).toBeInTheDocument()
    expect(screen.queryByText('Unauthorized')).not.toBeInTheDocument()
    expect(screen.queryByText('Token expired')).not.toBeInTheDocument()
  })

  it('removing the flagged line clears the page message', async () => {
    const user = userEvent.setup()
    mutateAsync.mockRejectedValue(
      lineError('outOfStock', 'Update your cart and try again.'),
    )
    mockUseShippingMethods.mockReturnValue(
      shippingResult({ shippingMethods: [standard] }),
    )

    renderCheckout()
    await fillForm(user)
    await user.click(placeOrderButton())
    const pageMessage = ERROR_MESSAGES.ORDER_OUT_OF_STOCK(
      'Ethiopian Yirgacheffe',
    )
    expect(await screen.findByText(pageMessage)).toBeInTheDocument()

    await user.click(
      screen.getByRole('button', {
        name: 'Remove Ethiopian Yirgacheffe from order',
      }),
    )

    // The errors are pruned once the removal answers.
    await waitFor(() =>
      expect(screen.queryByText(pageMessage)).not.toBeInTheDocument(),
    )
  })

  it('a line error that matches no shown line still shows a message', async () => {
    const user = userEvent.setup()
    mutateAsync.mockRejectedValue(
      new ServiceError('Validation failed', [
        {
          errCode: 'outOfStock',
          field: 'items.5.productVariantId',
          message: 'Only 0 left',
          description: 'Update your cart and try again.',
        },
      ]),
    )
    mockUseShippingMethods.mockReturnValue(
      shippingResult({ shippingMethods: [standard] }),
    )

    renderCheckout()
    await fillForm(user)
    await user.click(placeOrderButton())

    expect(
      await screen.findByText(ERROR_MESSAGES.ORDER_ITEMS_CHANGED),
    ).toBeInTheDocument()
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: cartQueryKeys.root,
    })
  })

  it('an unmatched line error flags no line and leaves Place order enabled', async () => {
    const user = userEvent.setup()
    mutateAsync.mockRejectedValue(
      new ServiceError('Validation failed', [
        {
          errCode: 'outOfStock',
          field: 'items.1.productVariantId',
          message: 'Only 0 left',
          description: 'Update your cart and try again.',
        },
      ]),
    )
    mockUseShippingMethods.mockReturnValue(
      shippingResult({ shippingMethods: [standard, express] }),
    )

    const { rerender } = renderCheckout()
    await fillForm(user)
    await user.click(placeOrderButton())
    expect(
      await screen.findByText(ERROR_MESSAGES.ORDER_ITEMS_CHANGED),
    ).toBeInTheDocument()

    // The refetched cart now has a second line at index 1.
    const second = {
      ...cartResult.items[0],
      id: 'line-2',
      variantId: 'variant-2',
      productId: 'product-2',
      name: 'Kenya AA',
    }
    mockUseCart.mockReturnValue({
      ...cartResult,
      items: [...cartResult.items, second],
      itemCount: 2,
    })
    rerender(<CheckoutPageContent />)

    expect(screen.queryByText(OUT_OF_STOCK_DESCRIPTION)).not.toBeInTheDocument()
    expect(placeOrderButton()).toBeEnabled()

    // Picking a method does not hide the line notice.
    await user.click(
      deliverySpeed().getByRole('radio', { name: 'Roast Express' }),
    )
    expect(
      screen.getByText(ERROR_MESSAGES.ORDER_ITEMS_CHANGED),
    ).toBeInTheDocument()
  })

  it('a flagged line that is gone after the refetch still leaves a message', async () => {
    const user = userEvent.setup()
    mutateAsync.mockRejectedValue(
      lineError('outOfStock', OUT_OF_STOCK_DESCRIPTION),
    )
    mockUseShippingMethods.mockReturnValue(
      shippingResult({ shippingMethods: [standard] }),
    )

    const { rerender } = renderCheckout()
    await fillForm(user)
    await user.click(placeOrderButton())
    expect(
      await screen.findByText(
        ERROR_MESSAGES.ORDER_OUT_OF_STOCK('Ethiopian Yirgacheffe'),
      ),
    ).toBeInTheDocument()

    // The refetched cart holds the variant under a new line id.
    mockUseCart.mockReturnValue({
      ...cartResult,
      items: [{ ...cartResult.items[0], id: 'line-9' }],
    })
    rerender(<CheckoutPageContent />)

    expect(
      screen.getByText(ERROR_MESSAGES.ORDER_ITEMS_CHANGED),
    ).toBeInTheDocument()
  })

  it('an unmatched line error keeps its notice next to another error', async () => {
    const user = userEvent.setup()
    mutateAsync.mockRejectedValue(
      new ServiceError('Validation failed', [
        {
          errCode: 'outOfStock',
          field: 'cart',
          message: 'Only 0 left',
          description: 'Update your cart and try again.',
        },
        {
          errCode: 'shippingMethodUnavailable',
          field: 'shippingMethodId',
          message: 'Shipping method is not available',
          description: 'Choose another shipping method.',
        },
      ]),
    )
    mockUseShippingMethods.mockReturnValue(
      shippingResult({ shippingMethods: [standard] }),
    )

    renderCheckout()
    await fillForm(user)
    await user.click(placeOrderButton())

    expect(
      await screen.findByText(
        `${ERROR_MESSAGES.ORDER_ITEMS_CHANGED} ${ERROR_MESSAGES.ORDER_SHIPPING_METHOD_UNAVAILABLE}`,
      ),
    ).toBeInTheDocument()
  })

  it('shows a shipping method error next to a line error', async () => {
    const user = userEvent.setup()
    mutateAsync.mockRejectedValue(
      new ServiceError('Validation failed', [
        {
          errCode: 'outOfStock',
          field: 'items.0.productVariantId',
          message: 'Only 0 left',
          description: 'Update your cart and try again.',
        },
        {
          errCode: 'shippingMethodUnavailable',
          field: 'shippingMethodId',
          message: 'Shipping method is not available',
          description: 'Choose another shipping method.',
        },
      ]),
    )
    mockUseShippingMethods.mockReturnValue(
      shippingResult({ shippingMethods: [standard] }),
    )

    renderCheckout()
    await fillForm(user)
    await user.click(placeOrderButton())

    expect(
      await screen.findByText(
        `${ERROR_MESSAGES.ORDER_OUT_OF_STOCK('Ethiopian Yirgacheffe')} ${ERROR_MESSAGES.ORDER_SHIPPING_METHOD_UNAVAILABLE}`,
      ),
    ).toBeInTheDocument()
  })

  it('does not show the empty cart after a successful order', async () => {
    const user = userEvent.setup()
    mutateAsync.mockResolvedValue(placedOrder)
    mockUseShippingMethods.mockReturnValue(
      shippingResult({ shippingMethods: [standard] }),
    )

    const { rerender } = renderCheckout()
    await fillForm(user)
    await pickCashOnDelivery(user)
    await user.click(placeOrderButton())
    await waitFor(() => expect(push).toHaveBeenCalledWith(ROUTES.ORDER_SUCCESS))

    // The invalidated GET /cart answers before the route changes.
    mockUseCart.mockReturnValue({ ...cartResult, items: [], itemCount: 0 })
    rerender(<CheckoutPageContent />)

    expect(screen.queryByTestId('checkout-empty')).not.toBeInTheDocument()
    expect(screen.getByTestId('checkout-loading')).toBeInTheDocument()
  })

  it('an unmapped error never shows its description (the developer message)', async () => {
    const user = userEvent.setup()
    mutateAsync.mockRejectedValue(
      new ServiceError('Token expired', [
        {
          errCode: 'unauthenticated',
          field: '',
          message: 'Token expired',
          description: 'Token expired',
        },
      ]),
    )
    mockUseShippingMethods.mockReturnValue(
      shippingResult({ shippingMethods: [standard] }),
    )

    renderCheckout()
    await fillForm(user)
    await user.click(placeOrderButton())

    expect(
      await screen.findByText(API_FALLBACK_ERRORS.ORDER_CREATE),
    ).toBeInTheDocument()
    expect(screen.queryByText('Token expired')).not.toBeInTheDocument()
  })

  it('removing one of two flagged lines names only the line left', async () => {
    const user = userEvent.setup()
    const second = {
      ...cartResult.items[0],
      id: 'line-2',
      variantId: 'variant-2',
      productId: 'product-2',
      name: 'Kenya AA',
    }
    mockUseCart.mockReturnValue({
      ...cartResult,
      items: [...cartResult.items, second],
      itemCount: 2,
    })
    mutateAsync.mockRejectedValue(
      new ServiceError(
        'Validation failed',
        [0, 1].map((index) => ({
          errCode: 'outOfStock',
          field: `items.${index}.productVariantId`,
          message: 'Only 0 left',
          description: 'Update your cart and try again.',
        })),
      ),
    )
    mockUseShippingMethods.mockReturnValue(
      shippingResult({ shippingMethods: [standard] }),
    )

    renderCheckout()
    await fillForm(user)
    await user.click(placeOrderButton())
    expect(
      await screen.findByText(
        ERROR_MESSAGES.ORDER_OUT_OF_STOCK('Ethiopian Yirgacheffe, Kenya AA'),
      ),
    ).toBeInTheDocument()

    await user.click(
      screen.getByRole('button', {
        name: 'Remove Ethiopian Yirgacheffe from order',
      }),
    )

    expect(
      await screen.findByText(ERROR_MESSAGES.ORDER_OUT_OF_STOCK('Kenya AA')),
    ).toBeInTheDocument()
  })

  it('a failed removal keeps the line error and the page message', async () => {
    const user = userEvent.setup()
    mockUseCart.mockReturnValue({
      ...cartResult,
      removeItem: jest.fn(async () => ({
        ok: false as const,
        error: API_FALLBACK_ERRORS.CART_REMOVE,
      })),
    })
    mutateAsync.mockRejectedValue(
      lineError('outOfStock', 'Update your cart and try again.'),
    )
    mockUseShippingMethods.mockReturnValue(
      shippingResult({ shippingMethods: [standard] }),
    )

    renderCheckout()
    await fillForm(user)
    await user.click(placeOrderButton())
    const pageMessage = ERROR_MESSAGES.ORDER_OUT_OF_STOCK(
      'Ethiopian Yirgacheffe',
    )
    expect(await screen.findByText(pageMessage)).toBeInTheDocument()

    await user.click(
      screen.getByRole('button', {
        name: 'Remove Ethiopian Yirgacheffe from order',
      }),
    )

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(API_FALLBACK_ERRORS.CART_REMOVE),
    )
    expect(screen.getByText(pageMessage)).toBeInTheDocument()
    expect(
      screen.getByText('Update your cart and try again.'),
    ).toBeInTheDocument()
    expect(placeOrderButton()).toBeDisabled()
  })

  it("lists the server cart's lines in the order summary", () => {
    mockUseShippingMethods.mockReturnValue(
      shippingResult({ shippingMethods: [standard] }),
    )

    renderCheckout()

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

    renderCheckout()

    expect(placeOrderButton()).toBeDisabled()
  })

  it('disables Place Order while the cart loads', () => {
    mockUseShippingMethods.mockReturnValue(
      shippingResult({ shippingMethods: [standard] }),
    )
    mockUseCart.mockReturnValue({ ...cartResult, isLoading: true })

    renderCheckout()

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

    renderCheckout()

    expect(placeOrderButton()).toBeDisabled()
  })

  it('sends one removal at a time for a line', async () => {
    const user = userEvent.setup()
    mockUseShippingMethods.mockReturnValue(
      shippingResult({ shippingMethods: [standard] }),
    )
    const removeItem = jest.fn(() => new Promise<{ ok: true }>(() => undefined))
    mockUseCart.mockReturnValue({ ...cartResult, removeItem })

    renderCheckout()
    const remove = screen.getByRole('button', {
      name: 'Remove Ethiopian Yirgacheffe from order',
    })
    await user.click(remove)
    await user.click(remove)

    expect(removeItem).toHaveBeenCalledTimes(1)
  })

  describe('PayPal', () => {
    const originalEnv = process.env
    const paypalOrder: PlacedOrder = {
      ...placedOrder,
      items: [
        {
          id: 'item-1',
          productVariantId: 'variant-1',
          productName: 'Ethiopian Yirgacheffe',
          productImage: '/images/empty-image.webp',
          variantName: 'Light Roast',
          unitPrice: 24,
          discountAmount: 0,
          quantity: 1,
          lineTotal: 24,
        },
      ],
    }

    const pickPayPal = async (user: ReturnType<typeof userEvent.setup>) => {
      await user.click(screen.getByRole('radio', { name: /paypal/i }))
    }

    beforeEach(() => {
      process.env = { ...originalEnv, NEXT_PUBLIC_PAYPAL_CLIENT_ID: 'client' }
      mockUseShippingMethods.mockReturnValue(
        shippingResult({ shippingMethods: [express] }),
      )
      startPaymentMutate.mockResolvedValue({
        paymentId: 'payment-1',
        checkoutId: 'PP-ORDER-1',
        checkoutUrl: 'https://www.sandbox.paypal.com/checkoutnow',
        expiresAt: '2026-11-25T09:00:00.000Z',
      })
    })

    afterEach(() => {
      process.env = originalEnv
    })

    it('PayPal replaces Place order', async () => {
      const user = userEvent.setup()
      renderCheckout()

      await pickPayPal(user)

      expect(screen.getByRole('button', { name: 'PayPal' })).toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: /place order/i }),
      ).not.toBeInTheDocument()
    })

    it('an invalid form opens no PayPal order', async () => {
      const user = userEvent.setup()
      renderCheckout()
      await pickPayPal(user)

      await user.click(screen.getByRole('button', { name: 'PayPal' }))

      expect(mutateAsync).not.toHaveBeenCalled()
      expect(startPaymentMutate).not.toHaveBeenCalled()
      expect(screen.getAllByText(/required|enter/i).length).toBeGreaterThan(0)
    })

    it('after a cancel the placed order stays and PayPal is offered again', async () => {
      // Placing the order empties the server cart, as the API does.
      mutateAsync.mockImplementation(async () => {
        mockUseCart.mockReturnValue({ ...cartResult, items: [] })
        return paypalOrder
      })
      const user = userEvent.setup()
      renderCheckout()
      await fillForm(user)
      await pickPayPal(user)

      await user.click(
        screen.getByRole('button', { name: 'PayPal then cancel' }),
      )

      await waitFor(() =>
        expect(screen.getByRole('status')).toHaveTextContent(
          NOTICE_MESSAGES.PAYPAL_CANCELLED,
        ),
      )
      expect(startPaymentMutate).toHaveBeenCalledWith('order-1')
      expect(push).not.toHaveBeenCalled()
      expect(screen.getByText('Ethiopian Yirgacheffe')).toBeInTheDocument()
      expect(totalText()).toBe('$115.00')
      expect(screen.getByLabelText('First Name')).toBeDisabled()
      expect(
        screen.getByRole('radio', { name: /cash on delivery/i }),
      ).toBeDisabled()

      await user.click(
        screen.getByRole('button', { name: 'PayPal then cancel' }),
      )
      await waitFor(() => expect(startPaymentMutate).toHaveBeenCalledTimes(2))
      expect(mutateAsync).toHaveBeenCalledTimes(1)
    })

    it("a final decline removes PayPal and links to the order's details", async () => {
      mutateAsync.mockResolvedValue(paypalOrder)
      capturePaymentMutate.mockResolvedValue({
        paymentId: 'payment-1',
        paymentStatus: OrderPaymentStatus.FAILED,
        failureReason: 'PayPal denied the payment',
        retryable: false,
      })
      const user = userEvent.setup()
      renderCheckout()
      await fillForm(user)
      await pickPayPal(user)

      await user.click(screen.getByRole('button', { name: 'PayPal' }))

      await waitFor(() =>
        expect(screen.getByRole('alert')).toHaveTextContent(
          ERROR_MESSAGES.PAYPAL_NOT_RETRYABLE,
        ),
      )
      expect(screen.queryByRole('button', { name: 'PayPal' })).toBeNull()
      expect(screen.getByRole('link', { name: /view order/i })).toHaveAttribute(
        'href',
        profileOrderPath(paypalOrder.orderNumber),
      )
    })
  })
})
