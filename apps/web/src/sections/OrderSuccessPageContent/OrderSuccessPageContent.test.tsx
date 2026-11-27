import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type React from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@clerk/nextjs'
import {
  OrderPaymentStatus,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PaymentType,
  ShippingStatus,
} from '@repo/constants'

import { API_FALLBACK_ERRORS, NOTICE_MESSAGES } from '@/constants/messages'
import { useOrderDetail, type UseOrderDetailResult } from '@/hooks/useOrder'
import { useCapturePayment, useStartPayment } from '@/hooks/usePayment'
import { orderSuccessPath } from '@/constants/routes'
import { ServiceError } from '@/utils/query'
import OrderSuccessPageContent from '@/sections/OrderSuccessPageContent'
import { useCartStore } from '@/store/useCartStore'
import type { OrderDetail, PlacedOrder } from '@/types/order'

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  useSearchParams: jest.fn(),
}))
jest.mock('@/hooks/useOrder', () => ({ useOrderDetail: jest.fn() }))
jest.mock('@clerk/nextjs', () => ({ useAuth: jest.fn() }))
jest.mock('@/hooks/usePayment', () => ({
  useStartPayment: jest.fn(),
  useCapturePayment: jest.fn(),
}))
jest.mock('next/image', () => ({
  __esModule: true,
  default: ({
    alt,
    src,
  }: React.ImgHTMLAttributes<HTMLImageElement> & { src: string }) => (
    <img alt={alt ?? ''} src={src} />
  ),
}))
jest.mock('@/store/useCartStore', () => ({ useCartStore: jest.fn() }))

const mockUseCartStore = jest.mocked(useCartStore)

const order: PlacedOrder = {
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
  tax: 6.84,
  subTotal: 68.4,
  totalAmount: 87.24,
  note: null,
  expiresAt: null,
  items: [
    {
      id: 'item-1',
      productVariantId: 'variant-1',
      productName: 'Las Hermanas',
      productImage: 'https://img.example/las-hermanas.webp',
      variantName: '200g',
      unitPrice: 24,
      discountAmount: 1.2,
      quantity: 3,
      lineTotal: 68.4,
    },
  ],
  payments: [],
  createdAt: '2026-11-24T10:00:00.000Z',
  updatedAt: '2026-11-24T10:00:00.000Z',
}

const withSnapshot = (itemSnapshots: unknown) =>
  mockUseCartStore.mockReturnValue({
    itemSnapshots,
    clearItemSnapshots: jest.fn(),
  })

const mockUseOrderDetail = jest.mocked(useOrderDetail)

const detailState = (
  overrides: Partial<UseOrderDetailResult> = {},
): UseOrderDetailResult => ({
  order: null,
  isLoading: false,
  isError: false,
  isNotFound: false,
  errorMessage: null,
  refetch: jest.fn(),
  isPollExhausted: false,
  ...overrides,
})

const withParams = (query: string) =>
  jest
    .mocked(useSearchParams)
    .mockReturnValue(
      new URLSearchParams(query) as unknown as ReturnType<
        typeof useSearchParams
      >,
    )

const cardOrder = (paymentStatus: OrderPaymentStatus): OrderDetail => ({
  ...order,
  customer: {
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.com',
  },
  paymentStatus,
  payments: [
    {
      id: 'pay-1',
      orderId: 'order-1',
      type: PaymentType.CHARGE,
      method: PaymentMethod.CARD,
      status: PaymentStatus.PENDING,
      amount: 87.24,
      currency: 'usd',
      transactionId: null,
      completedAt: null,
      failureReason: null,
      createdAt: '2026-11-24T10:00:00.000Z',
      updatedAt: '2026-11-24T10:00:00.000Z',
    },
  ],
})

const paypalOrder = (paymentStatus: OrderPaymentStatus): OrderDetail => {
  const base = cardOrder(paymentStatus)
  return {
    ...base,
    payments: base.payments.map((payment) => ({
      ...payment,
      method: PaymentMethod.PAYPAL,
    })),
  }
}

const pollWhileOf = () => mockUseOrderDetail.mock.calls.at(-1)?.[1]?.pollWhile

const paymentRegion = () => screen.getByRole('region', { name: 'Payment' })

const captureMutateAsync = jest.fn()
const replace = jest.fn()

describe('OrderSuccessPageContent', () => {
  beforeEach(() => {
    replace.mockReset()
    jest.mocked(useAuth).mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
    } as unknown as ReturnType<typeof useAuth>)
    jest.mocked(useRouter).mockReturnValue({
      push: jest.fn(),
      replace,
    } as unknown as ReturnType<typeof useRouter>)
    jest.mocked(useStartPayment).mockReturnValue({
      mutateAsync: jest.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof useStartPayment>)
    captureMutateAsync.mockReset()
    captureMutateAsync.mockResolvedValue({})
    jest.mocked(useCapturePayment).mockReturnValue({
      mutateAsync: captureMutateAsync,
    } as unknown as ReturnType<typeof useCapturePayment>)
    mockUseOrderDetail.mockReset()
    mockUseOrderDetail.mockReturnValue(detailState())
    withParams('')
    withSnapshot(null)
  })

  it('renders the order number, items and totals from the PlacedOrder', () => {
    withSnapshot(order)

    render(<OrderSuccessPageContent />)

    expect(screen.getByText('Order ID: NB-000123')).toBeInTheDocument()
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument()
    expect(screen.getByText('12 Roast Street')).toBeInTheDocument()
    expect(screen.getByText('Kim Ma')).toBeInTheDocument()
    expect(screen.getByText('Ba Dinh')).toBeInTheDocument()
    expect(screen.getByText('Hanoi')).toBeInTheDocument()
    expect(screen.getByText('Shipping (Roast Express)')).toBeInTheDocument()
    expect(screen.getByText('Las Hermanas')).toBeInTheDocument()
    expect(screen.getByText('200g')).toBeInTheDocument()
    expect(screen.getByText('Qty: 3')).toBeInTheDocument()
    expect(screen.getAllByText('$68.40')).toHaveLength(2)
    expect(screen.getByText('$6.84')).toBeInTheDocument()
    expect(screen.getByText('$12.00')).toBeInTheDocument()
    expect(screen.getByText('$87.24')).toBeInTheDocument()
  })

  it('shows Order Summary Unavailable for an old-shape snapshot', () => {
    withSnapshot({
      orderNumber: '#NB-216979',
      addressSnapshot: { firstName: 'Ada', lastName: 'Lovelace' },
      items: [{ id: 'line-1', productName: 'Las Hermanas', subTotal: 684 }],
      totalAmount: 894.99,
    })

    render(<OrderSuccessPageContent />)

    expect(
      screen.getByRole('heading', { name: 'Order Summary Unavailable' }),
    ).toBeInTheDocument()
  })

  it('shows Order Summary Unavailable with no snapshot', () => {
    withSnapshot(null)

    render(<OrderSuccessPageContent />)

    expect(
      screen.getByRole('heading', { name: 'Order Summary Unavailable' }),
    ).toBeInTheDocument()
  })

  it('with orderId it reads the order from the API and shows its payment status', () => {
    withParams('orderId=o-1')
    mockUseOrderDetail.mockReturnValue(
      detailState({ order: cardOrder(OrderPaymentStatus.PENDING) }),
    )

    render(<OrderSuccessPageContent />)

    expect(mockUseOrderDetail).toHaveBeenCalledWith('o-1', expect.any(Object))
    expect(screen.getByText('Order ID: NB-000123')).toBeInTheDocument()
    expect(screen.getByText('Las Hermanas')).toBeInTheDocument()
    expect(within(paymentRegion()).getByText('Unpaid')).toBeInTheDocument()
    expect(
      within(paymentRegion()).getByRole('button', { name: 'Complete payment' }),
    ).toBeInTheDocument()
  })

  it('shows Paid once a poll returns PAID', () => {
    withParams('orderId=o-1&session_id=cs_1')
    mockUseOrderDetail.mockReturnValue(
      detailState({ order: cardOrder(OrderPaymentStatus.PENDING) }),
    )
    const { rerender } = render(<OrderSuccessPageContent />)

    expect(
      within(paymentRegion()).getByText(
        NOTICE_MESSAGES.ORDER_PAYMENT.CONFIRMING,
      ),
    ).toBeInTheDocument()
    const pollWhile = pollWhileOf()
    expect(pollWhile?.(cardOrder(OrderPaymentStatus.PENDING))).toBe(true)
    expect(pollWhile?.(cardOrder(OrderPaymentStatus.FAILED))).toBe(true)
    expect(pollWhile?.(cardOrder(OrderPaymentStatus.PAID))).toBe(false)

    mockUseOrderDetail.mockReturnValue(
      detailState({ order: cardOrder(OrderPaymentStatus.PAID) }),
    )
    rerender(<OrderSuccessPageContent />)

    expect(within(paymentRegion()).getByText('Paid')).toBeInTheDocument()
    expect(
      within(paymentRegion()).getByText(NOTICE_MESSAGES.ORDER_PAYMENT.PAID),
    ).toBeInTheDocument()
  })

  it('payment=pending (a PayPal capture held for review) polls like a Stripe return', () => {
    withParams('orderId=o-1&payment=pending')
    mockUseOrderDetail.mockReturnValue(
      detailState({ order: cardOrder(OrderPaymentStatus.PENDING) }),
    )

    render(<OrderSuccessPageContent />)

    expect(
      within(paymentRegion()).getByText(
        NOTICE_MESSAGES.ORDER_PAYMENT.CONFIRMING,
      ),
    ).toBeInTheDocument()
    expect(pollWhileOf()?.(cardOrder(OrderPaymentStatus.PENDING))).toBe(true)
  })

  it('a return from PayPal (token) captures the order once and polls meanwhile', async () => {
    withParams('orderId=o-1&token=PAYPAL-ORDER-1&PayerID=PAYER-1')
    captureMutateAsync.mockResolvedValue({
      paymentStatus: OrderPaymentStatus.PAID,
    })
    mockUseOrderDetail.mockReturnValue(
      detailState({ order: cardOrder(OrderPaymentStatus.PENDING) }),
    )

    const { rerender } = render(<OrderSuccessPageContent />)
    rerender(<OrderSuccessPageContent />)

    expect(pollWhileOf()?.(cardOrder(OrderPaymentStatus.PENDING))).toBe(true)
    await waitFor(() => expect(captureMutateAsync).toHaveBeenCalledWith('o-1'))
    expect(captureMutateAsync).toHaveBeenCalledTimes(1)
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(orderSuccessPath('o-1')),
    )
  })

  it('a return from PayPal waits for the session before it captures', async () => {
    withParams('orderId=o-1&token=PAYPAL-ORDER-1&PayerID=PAYER-1')
    captureMutateAsync.mockResolvedValue({
      paymentStatus: OrderPaymentStatus.PAID,
    })
    jest.mocked(useAuth).mockReturnValue({
      isLoaded: false,
      isSignedIn: undefined,
    } as unknown as ReturnType<typeof useAuth>)

    const { rerender } = render(<OrderSuccessPageContent />)
    expect(captureMutateAsync).not.toHaveBeenCalled()

    jest.mocked(useAuth).mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
    } as unknown as ReturnType<typeof useAuth>)
    rerender(<OrderSuccessPageContent />)

    await waitFor(() => expect(captureMutateAsync).toHaveBeenCalledWith('o-1'))
    expect(captureMutateAsync).toHaveBeenCalledTimes(1)
  })

  it('a PayPal capture held for review goes on confirming', async () => {
    withParams('orderId=o-1&token=PAYPAL-ORDER-1&PayerID=PAYER-1')
    captureMutateAsync.mockResolvedValue({
      paymentStatus: OrderPaymentStatus.PENDING,
    })

    render(<OrderSuccessPageContent />)

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(
        orderSuccessPath('o-1', undefined, { confirming: true }),
      ),
    )
  })

  it('a refused or failed PayPal capture shows its error, not a confirming page', async () => {
    withParams('orderId=o-1&token=PAYPAL-ORDER-1&PayerID=PAYER-1')
    captureMutateAsync.mockRejectedValue(
      new ServiceError('x', [
        {
          errCode: 'paymentGatewayUnavailable',
          field: 'id',
          message: 'x',
          description: 'y',
        },
      ]),
    )

    render(<OrderSuccessPageContent />)

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(
        orderSuccessPath('o-1', 'paymentGatewayUnavailable'),
      ),
    )
  })

  it('a PayPal cancel captures nothing and shows Unpaid, Payment not completed and Complete payment', () => {
    withParams('orderId=o-1&payment=cancelled&token=PAYPAL-ORDER-1')
    mockUseOrderDetail.mockReturnValue(
      detailState({ order: paypalOrder(OrderPaymentStatus.PENDING) }),
    )

    render(<OrderSuccessPageContent />)

    expect(captureMutateAsync).not.toHaveBeenCalled()
    expect(
      within(paymentRegion()).getByText(
        NOTICE_MESSAGES.ORDER_PAYMENT.NOT_COMPLETED,
      ),
    ).toBeInTheDocument()
    expect(
      within(paymentRegion()).getByRole('button', { name: 'Complete payment' }),
    ).toBeEnabled()
    expect(pollWhileOf()?.(paypalOrder(OrderPaymentStatus.PENDING))).toBe(false)
  })

  it('a page without a PayPal token captures nothing', () => {
    withParams('orderId=o-1')
    mockUseOrderDetail.mockReturnValue(
      detailState({ order: cardOrder(OrderPaymentStatus.PENDING) }),
    )

    render(<OrderSuccessPageContent />)

    expect(captureMutateAsync).not.toHaveBeenCalled()
  })

  it('without session_id an unfinished payment shows Payment not completed and Complete payment', () => {
    withParams('orderId=o-1')
    mockUseOrderDetail.mockReturnValue(
      detailState({ order: cardOrder(OrderPaymentStatus.PENDING) }),
    )

    render(<OrderSuccessPageContent />)

    expect(
      within(paymentRegion()).getByText(
        NOTICE_MESSAGES.ORDER_PAYMENT.NOT_COMPLETED,
      ),
    ).toBeInTheDocument()
    expect(
      within(paymentRegion()).getByRole('button', { name: 'Complete payment' }),
    ).toBeInTheDocument()
    expect(pollWhileOf()?.(cardOrder(OrderPaymentStatus.PENDING))).toBe(false)
  })

  it('a 404 for orderId shows Order Summary Unavailable', () => {
    withParams('orderId=o-404')
    mockUseOrderDetail.mockReturnValue(
      detailState({
        isNotFound: true,
        isError: true,
        errorMessage: API_FALLBACK_ERRORS.ORDER_LOAD,
      }),
    )

    render(<OrderSuccessPageContent />)

    expect(
      screen.getByRole('heading', { name: 'Order Summary Unavailable' }),
    ).toBeInTheDocument()
  })

  it('a 404 during a poll keeps the order on screen', () => {
    withParams('orderId=o-1&session_id=cs_1')
    mockUseOrderDetail.mockReturnValue(
      detailState({
        order: cardOrder(OrderPaymentStatus.PENDING),
        isNotFound: true,
        isError: true,
        errorMessage: API_FALLBACK_ERRORS.ORDER_LOAD,
      }),
    )

    render(<OrderSuccessPageContent />)

    expect(screen.getByText('Order ID: NB-000123')).toBeInTheDocument()
    expect(paymentRegion()).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Order Summary Unavailable' }),
    ).not.toBeInTheDocument()
  })

  it('a failed poll keeps the order on screen', () => {
    withParams('orderId=o-1&session_id=cs_1')
    mockUseOrderDetail.mockReturnValue(
      detailState({
        order: cardOrder(OrderPaymentStatus.PENDING),
        isError: true,
        errorMessage: API_FALLBACK_ERRORS.ORDER_LOAD,
      }),
    )

    render(<OrderSuccessPageContent />)

    expect(screen.getByText('Order ID: NB-000123')).toBeInTheDocument()
    expect(paymentRegion()).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Try again' }),
    ).not.toBeInTheDocument()
  })

  it('a load error shows its message and Try again refetches', async () => {
    const user = userEvent.setup()
    const refetch = jest.fn()
    withParams('orderId=o-1')
    mockUseOrderDetail.mockReturnValue(
      detailState({
        isError: true,
        errorMessage: API_FALLBACK_ERRORS.ORDER_LOAD,
        refetch,
      }),
    )

    render(<OrderSuccessPageContent />)

    expect(screen.getByText(API_FALLBACK_ERRORS.ORDER_LOAD)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(refetch).toHaveBeenCalled()
  })

  it('shows Order Confirmed for a PAID order', () => {
    withParams('orderId=o-1')
    mockUseOrderDetail.mockReturnValue(
      detailState({ order: cardOrder(OrderPaymentStatus.PAID) }),
    )

    render(<OrderSuccessPageContent />)

    expect(
      screen.getByRole('heading', { level: 1, name: 'Order Confirmed' }),
    ).toBeInTheDocument()
  })

  it('shows Order Placed with Complete your payment for an unpaid card order', () => {
    withParams('orderId=o-1')
    mockUseOrderDetail.mockReturnValue(
      detailState({ order: cardOrder(OrderPaymentStatus.UNPAID) }),
    )

    render(<OrderSuccessPageContent />)

    expect(
      screen.getByRole('heading', { level: 1, name: 'Order Placed' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(NOTICE_MESSAGES.ORDER_SUCCESS.ACTION_NEEDED),
    ).toBeInTheDocument()
  })

  it('shows Order Placed for a COD order', () => {
    withParams('orderId=o-1')
    const codOrder = cardOrder(OrderPaymentStatus.UNPAID)
    codOrder.payments = [{ ...codOrder.payments[0], method: PaymentMethod.COD }]
    mockUseOrderDetail.mockReturnValue(detailState({ order: codOrder }))

    render(<OrderSuccessPageContent />)

    expect(
      screen.getByRole('heading', { level: 1, name: 'Order Placed' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByText(NOTICE_MESSAGES.ORDER_SUCCESS.ACTION_NEEDED),
    ).not.toBeInTheDocument()
  })

  it('renders the Payment card before Delivery Address', () => {
    withParams('orderId=o-1')
    mockUseOrderDetail.mockReturnValue(
      detailState({ order: cardOrder(OrderPaymentStatus.PAID) }),
    )

    render(<OrderSuccessPageContent />)

    const address = screen.getByRole('heading', { name: 'Delivery Address' })
    expect(
      paymentRegion().compareDocumentPosition(address) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('shows every address line when district and city are the same, with unique keys', () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation()
    try {
      withParams('orderId=o-1')
      mockUseOrderDetail.mockReturnValue(
        detailState({
          order: {
            ...cardOrder(OrderPaymentStatus.PAID),
            district: 'Thành phố Hồ Chí Minh',
            city: 'Thành phố Hồ Chí Minh',
          },
        }),
      )

      render(<OrderSuccessPageContent />)

      expect(screen.getAllByText('Thành phố Hồ Chí Minh')).toHaveLength(2)
      const duplicateKeyWarnings = consoleError.mock.calls.filter((args) =>
        args.some(
          (arg) => typeof arg === 'string' && arg.includes('the same key'),
        ),
      )
      expect(duplicateKeyWarnings).toEqual([])
    } finally {
      consoleError.mockRestore()
    }
  })

  it('snapshot keeps the heading without a Payment card', () => {
    withSnapshot(order)

    render(<OrderSuccessPageContent />)

    expect(
      screen.getByRole('heading', { level: 1, name: 'Order Placed' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('region', { name: 'Payment' }),
    ).not.toBeInTheDocument()
  })

  it('an unpaid card order past expiresAt no longer asks for payment', () => {
    withParams('orderId=o-1')
    mockUseOrderDetail.mockReturnValue(
      detailState({
        order: {
          ...cardOrder(OrderPaymentStatus.UNPAID),
          expiresAt: new Date(Date.now() - 60_000).toISOString(),
        },
      }),
    )

    render(<OrderSuccessPageContent />)

    expect(
      screen.getByText(NOTICE_MESSAGES.ORDER_SUCCESS.CLOSED),
    ).toBeInTheDocument()
    expect(
      screen.queryByText(NOTICE_MESSAGES.ORDER_SUCCESS.ACTION_NEEDED),
    ).not.toBeInTheDocument()
  })

  it('a cancelled unpaid card order no longer asks for payment', () => {
    withParams('orderId=o-1')
    mockUseOrderDetail.mockReturnValue(
      detailState({
        order: {
          ...cardOrder(OrderPaymentStatus.UNPAID),
          status: OrderStatus.CANCELLED,
        },
      }),
    )

    render(<OrderSuccessPageContent />)

    expect(
      screen.getByText(NOTICE_MESSAGES.ORDER_SUCCESS.CLOSED),
    ).toBeInTheDocument()
  })

  it('a card order snapshot never asks for payment without a Payment card', () => {
    withSnapshot(cardOrder(OrderPaymentStatus.UNPAID))

    render(<OrderSuccessPageContent />)

    expect(
      screen.getByRole('heading', { level: 1, name: 'Order Placed' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByText(NOTICE_MESSAGES.ORDER_SUCCESS.ACTION_NEEDED),
    ).not.toBeInTheDocument()
    expect(
      screen.getByText(NOTICE_MESSAGES.ORDER_SUCCESS.THANK_YOU),
    ).toBeInTheDocument()
  })
})
