import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useParams } from 'next/navigation'
import {
  OrderPaymentStatus,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PaymentType,
  ShippingStatus,
} from '@repo/constants'

import OrderDetailPageContent from '@/sections/OrderDetailPageContent'
import { useOrderDetail } from '@/hooks/useOrder'
import { API_FALLBACK_ERRORS, ERROR_MESSAGES } from '@/constants/messages'
import { ROUTES } from '@/constants/routes'
import { formatPrice } from '@/utils/common'
import { formatOrderDateTime } from '@/utils/order'
import type { OrderDetail, OrderPayment } from '@/types/order'

jest.mock('next/navigation', () => ({ useParams: jest.fn() }))

jest.mock('@/hooks/useOrder', () => ({ useOrderDetail: jest.fn() }))

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ src, alt }: { src: string; alt: string }) => (
    <img src={src} alt={alt} />
  ),
}))

const mockUseParams = jest.mocked(useParams)
const mockUseOrderDetail = jest.mocked(useOrderDetail)

const charge: OrderPayment = {
  id: 'pay-1',
  orderId: 'order-1',
  type: PaymentType.CHARGE,
  method: PaymentMethod.COD,
  status: PaymentStatus.PENDING,
  amount: 24.8,
  currency: 'USD',
  transactionId: null,
  completedAt: null,
  failureReason: null,
  createdAt: '2026-11-17T09:00:00.000Z',
  updatedAt: '2026-11-17T09:00:00.000Z',
}

const order: OrderDetail = {
  id: 'order-1',
  orderNumber: 'CH-261117-0001',
  userId: 'user-1',
  shippingMethodId: 'method-1',
  status: OrderStatus.PENDING,
  shippingStatus: ShippingStatus.PENDING,
  paymentStatus: OrderPaymentStatus.UNPAID,
  recipientName: 'Tien Nguyen',
  recipientPhone: '0901234567',
  addressLine: '12 Nguyen Hue',
  ward: 'Ben Nghe',
  district: 'District 1',
  city: 'Ho Chi Minh City',
  postalCode: '700000',
  shippingMethodName: 'Express',
  shippingFee: 5,
  tax: 1.8,
  subTotal: 18,
  totalAmount: 24.8,
  note: 'Ring twice',
  expiresAt: null,
  items: [
    {
      id: 'item-1',
      productVariantId: 'variant-1',
      productName: 'Buon Ma Thuot Robusta',
      productImage: 'https://example.com/robusta.jpg',
      variantName: '500g',
      unitPrice: 11,
      discountAmount: 2,
      quantity: 2,
      lineTotal: 18,
    },
  ],
  payments: [charge],
  createdAt: '2026-11-17T09:00:00.000Z',
  updatedAt: '2026-11-17T09:00:00.000Z',
}

const state = (
  overrides: Partial<ReturnType<typeof useOrderDetail>> = {},
): ReturnType<typeof useOrderDetail> => ({
  order,
  isLoading: false,
  isError: false,
  isNotFound: false,
  errorMessage: null,
  refetch: jest.fn().mockResolvedValue(undefined),
  ...overrides,
})

const section = (name: string) => screen.getByRole('region', { name })

describe('OrderDetailPageContent', () => {
  beforeEach(() => {
    mockUseParams.mockReturnValue({ orderNumber: order.orderNumber })
    mockUseOrderDetail.mockReturnValue(state())
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('shows the header with a Profile link, the order number and the placed time', () => {
    render(<OrderDetailPageContent />)

    expect(mockUseOrderDetail).toHaveBeenCalledWith(order.orderNumber)
    expect(screen.getByRole('link', { name: 'Profile' })).toHaveAttribute(
      'href',
      ROUTES.USER_PROFILE,
    )
    expect(
      screen.getByRole('heading', { level: 1, name: /CH-261117-0001/ }),
    ).toHaveTextContent('Order CH-261117-0001')
    expect(
      screen.getByText(`Placed ${formatOrderDateTime(order.createdAt)}`),
    ).toBeInTheDocument()
  })

  it('shows each item with its sale price, the struck unit price when discounted, the quantity and the line total', () => {
    render(<OrderDetailPageContent />)

    const items = section('Items')
    expect(within(items).getByText('Buon Ma Thuot Robusta')).toBeInTheDocument()
    expect(within(items).getByText(/500g · \$9\.00/)).toBeInTheDocument()
    expect(within(items).getByText(formatPrice(11)).tagName).toBe('S')
    expect(within(items).getByText(/× 2/)).toBeInTheDocument()
    expect(
      within(items).getByText(
        'Names and prices copied when the order was placed',
      ),
    ).toBeInTheDocument()
  })

  it('shows Subtotal, Shipping · <method>, VAT (10%) and Total amount', () => {
    render(<OrderDetailPageContent />)

    const items = section('Items')
    for (const [label, amount] of [
      ['Subtotal', order.subTotal],
      ['Shipping · Express', order.shippingFee],
      ['VAT (10%)', order.tax],
      ['Total amount', order.totalAmount],
    ] as const) {
      const row = within(items).getByText(label).parentElement ?? items
      expect(within(row).getByText(formatPrice(amount))).toBeInTheDocument()
    }
  })

  it('shows the order and shipping progress, and Cancelled for a cancelled order', () => {
    const { rerender } = render(<OrderDetailPageContent />)

    const progress = section('Progress')
    expect(within(progress).getAllByText('Pending')).toHaveLength(2)
    expect(within(progress).getByText('Confirmed')).toBeInTheDocument()
    expect(within(progress).getByText('Completed')).toBeInTheDocument()
    // the row label and the step
    expect(within(progress).getAllByText('Shipping')).toHaveLength(2)
    expect(within(progress).getByText('Delivered')).toBeInTheDocument()
    expect(within(progress).getAllByText('Pending')[0]).toHaveAttribute(
      'aria-current',
      'step',
    )

    mockUseOrderDetail.mockReturnValue(
      state({ order: { ...order, status: OrderStatus.CANCELLED } }),
    )
    rerender(<OrderDetailPageContent />)

    const cancelled = section('Progress')
    expect(within(cancelled).getByText('Cancelled')).toBeInTheDocument()
    expect(within(cancelled).queryByText('Confirmed')).not.toBeInTheDocument()
    expect(within(cancelled).getByText('—')).toBeInTheDocument()
  })

  it('shows the payment method, status badge, amount, transaction, paid at and the transactions table', () => {
    render(<OrderDetailPageContent />)

    const payment = section('Payment')
    expect(
      within(payment).getByText('Method', { selector: 'dt' }).nextSibling,
    ).toHaveTextContent('Cash on delivery')
    expect(
      within(payment).getByText('Status', { selector: 'dt' }).nextSibling,
    ).toHaveTextContent('Unpaid')
    expect(
      within(payment).getByText('Amount', { selector: 'dt' }).nextSibling,
    ).toHaveTextContent(formatPrice(order.totalAmount))
    expect(
      within(payment).getByText('Transaction', { selector: 'dt' }).nextSibling,
    ).toHaveTextContent('—')
    expect(
      within(payment).getByText('Paid at', { selector: 'dt' }).nextSibling,
    ).toHaveTextContent('—')
    const table = within(payment).getByRole('table')
    const [, row] = within(table).getAllByRole('row')
    expect(row).toHaveTextContent('Charge · Cash on delivery')
    expect(row).toHaveTextContent(formatOrderDateTime(charge.createdAt))
    expect(row).toHaveTextContent('Pending')
    expect(row).toHaveTextContent(formatPrice(charge.amount))
  })

  it('shows the recipient, phone, address and note', () => {
    render(<OrderDetailPageContent />)

    const shipTo = section('Ship to')
    expect(
      within(shipTo).getByText('Tien Nguyen · 0901234567'),
    ).toBeInTheDocument()
    expect(
      within(shipTo).getByText(
        '12 Nguyen Hue, Ben Nghe, District 1, Ho Chi Minh City, 700000',
      ),
    ).toBeInTheDocument()
    expect(within(shipTo).getByText(/Ring twice/)).toBeInTheDocument()
  })

  it('shows a disabled Cancel order button for a PENDING order and the matching text for other statuses', () => {
    const { rerender } = render(<OrderDetailPageContent />)

    const cancel = section('Cancel order')
    expect(
      within(cancel).getByText(
        'You can cancel while the order is still pending. Its items go back into stock.',
      ),
    ).toBeInTheDocument()
    expect(
      within(cancel).getByRole('button', { name: 'Cancel order' }),
    ).toBeDisabled()

    mockUseOrderDetail.mockReturnValue(
      state({ order: { ...order, status: OrderStatus.CONFIRMED } }),
    )
    rerender(<OrderDetailPageContent />)
    expect(
      within(section('Cancel order')).getByText(
        'Cannot be cancelled: the order is confirmed.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancel order' })).toBeNull()

    mockUseOrderDetail.mockReturnValue(
      state({ order: { ...order, status: OrderStatus.CANCELLED } }),
    )
    rerender(<OrderDetailPageContent />)
    expect(
      within(section('Cancel order')).getByText(
        'This order has been cancelled.',
      ),
    ).toBeInTheDocument()
  })

  it('shows Order not found with a link to Profile for a 404', () => {
    mockUseOrderDetail.mockReturnValue(
      state({ order: null, isError: true, isNotFound: true }),
    )

    render(<OrderDetailPageContent />)

    expect(screen.getByText(ERROR_MESSAGES.ORDER_NOT_FOUND)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Profile' })).toHaveAttribute(
      'href',
      ROUTES.USER_PROFILE,
    )
    expect(screen.queryByRole('region', { name: 'Items' })).toBeNull()
  })

  it('shows other errors with Retry', async () => {
    const user = userEvent.setup()
    const refetch = jest.fn().mockResolvedValue(undefined)
    mockUseOrderDetail.mockReturnValue(
      state({
        order: null,
        isError: true,
        errorMessage: null,
        refetch,
      }),
    )

    render(<OrderDetailPageContent />)

    expect(screen.getByRole('alert')).toHaveTextContent(
      API_FALLBACK_ERRORS.ORDER_LOAD,
    )
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(refetch).toHaveBeenCalled()
  })

  it('shows Loading while the order loads', () => {
    mockUseOrderDetail.mockReturnValue(state({ order: null, isLoading: true }))

    render(<OrderDetailPageContent />)

    expect(screen.getByRole('status')).toHaveTextContent('Loading order')
  })
})
