import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  OrderPaymentStatus,
  OrderStatus,
  ShippingStatus,
} from '@repo/constants'

import { OrderDetailModal } from '@/sections/OrderDetailModal'
import { useOrderDetail } from '@/hooks/useOrder'
import { API_FALLBACK_ERRORS } from '@/constants/messages'
import { formatPrice } from '@/utils/common'
import { formatOrderListDate } from '@/utils/order'
import type { OrderDetail } from '@/types/order'

jest.mock('@/hooks/useOrder', () => ({ useOrderDetail: jest.fn() }))

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ src, alt }: { src: string; alt: string }) => (
    <img src={src} alt={alt} />
  ),
}))

const mockUseOrderDetail = jest.mocked(useOrderDetail)

const order: OrderDetail = {
  id: 'order-1',
  orderNumber: 'CH-261124-0001',
  userId: 'user-1',
  shippingMethodId: 'method-1',
  status: OrderStatus.PENDING,
  shippingStatus: ShippingStatus.PENDING,
  paymentStatus: OrderPaymentStatus.UNPAID,
  recipientName: 'Lan Nguyen',
  recipientPhone: '0901234567',
  addressLine: '12 Le Loi',
  ward: 'Ben Nghe',
  district: 'District 1',
  city: 'Ho Chi Minh City',
  postalCode: '700000',
  shippingMethodName: 'Roast Express',
  shippingFee: 12,
  tax: 3.8,
  subTotal: 50.5,
  totalAmount: 66.3,
  note: null,
  expiresAt: null,
  items: [
    {
      id: 'item-1',
      productVariantId: 'variant-1',
      productName: 'Kenya AA',
      productImage: 'https://example.com/kenya.jpg',
      variantName: '250g',
      unitPrice: 19,
      discountAmount: 0,
      quantity: 2,
      lineTotal: 38,
    },
    {
      id: 'item-2',
      productVariantId: 'variant-2',
      productName: 'Ethiopia Yirgacheffe',
      productImage: 'https://example.com/ethiopia.jpg',
      variantName: '1kg',
      unitPrice: 12.5,
      discountAmount: 0,
      quantity: 1,
      lineTotal: 12.5,
    },
  ],
  payments: [],
  createdAt: '2026-11-24T08:00:00.000Z',
  updatedAt: '2026-11-24T08:00:00.000Z',
}

const state = (overrides: Partial<ReturnType<typeof useOrderDetail>> = {}) => ({
  order: null,
  isLoading: false,
  isError: false,
  errorMessage: null,
  refetch: jest.fn().mockResolvedValue(undefined),
  ...overrides,
})

const renderModal = (onOpenChange = jest.fn()) =>
  render(
    <OrderDetailModal
      orderNumber="CH-261124-0001"
      open
      onOpenChange={onOpenChange}
    />,
  )

describe('OrderDetailModal', () => {
  it('shows items, address, shipping method, totals and payment status', () => {
    mockUseOrderDetail.mockReturnValue(state({ order }))

    renderModal()

    const dialog = screen.getByRole('alertdialog')
    expect(mockUseOrderDetail).toHaveBeenCalledWith('CH-261124-0001')
    expect(within(dialog).getByText(/CH-261124-0001/)).toBeInTheDocument()
    expect(
      within(dialog).getByText(formatOrderListDate(order.createdAt)),
    ).toBeInTheDocument()
    expect(within(dialog).getByText('Kenya AA')).toBeInTheDocument()
    expect(within(dialog).getByText(/250g/)).toBeInTheDocument()
    expect(within(dialog).getByText(/x2/)).toBeInTheDocument()
    expect(within(dialog).getByText(formatPrice(38))).toBeInTheDocument()
    expect(within(dialog).getByText('Ethiopia Yirgacheffe')).toBeInTheDocument()
    expect(within(dialog).getByText(/1kg x1/)).toBeInTheDocument()
    expect(within(dialog).getByText(formatPrice(12.5))).toBeInTheDocument()
    expect(
      within(dialog).getByText(
        '12 Le Loi, Ben Nghe, District 1, Ho Chi Minh City, 700000',
      ),
    ).toBeInTheDocument()
    expect(within(dialog).getByText(/Lan Nguyen/)).toBeInTheDocument()
    expect(within(dialog).getByText(/0901234567/)).toBeInTheDocument()
    expect(within(dialog).getByText('Roast Express')).toBeInTheDocument()
    for (const [label, amount] of [
      ['Subtotal', order.subTotal],
      ['Shipping fee', order.shippingFee],
      ['Tax', order.tax],
      ['Total', order.totalAmount],
    ] as const) {
      const row = within(dialog).getByText(label).parentElement ?? dialog
      expect(within(row).getByText(formatPrice(amount))).toBeInTheDocument()
    }
    expect(within(dialog).getByText('Unpaid')).toBeInTheDocument()
    expect(within(dialog).queryByText(/Shipping:/)).not.toBeInTheDocument()
    expect(within(dialog).queryByText(/Status:/)).not.toBeInTheDocument()
    expect(within(dialog).queryByText('COD')).not.toBeInTheDocument()
  })

  it('shows the payment status as a sentence-case badge like the order status badge', () => {
    mockUseOrderDetail.mockReturnValue(state({ order }))

    renderModal()

    const badge = within(screen.getByRole('alertdialog')).getByText('Unpaid')
    expect(badge).not.toHaveClass('uppercase')
    expect(badge).toHaveClass(
      'inline-flex',
      'rounded-full',
      'px-3',
      'py-1',
      'text-xs',
      'font-semibold',
    )
  })

  it('shows Loading while the order loads', () => {
    mockUseOrderDetail.mockReturnValue(state({ isLoading: true }))

    renderModal()

    expect(screen.getByRole('status')).toHaveTextContent('Loading order')
  })

  it('shows the fallback text for an error without a message', () => {
    mockUseOrderDetail.mockReturnValue(
      state({ isError: true, errorMessage: null }),
    )

    renderModal()

    expect(screen.getByRole('alert')).toHaveTextContent(
      API_FALLBACK_ERRORS.ORDER_LOAD,
    )
  })

  it('shows the error with Retry', async () => {
    const user = userEvent.setup()
    const refetch = jest.fn().mockResolvedValue(undefined)
    const onOpenChange = jest.fn()
    mockUseOrderDetail.mockReturnValue(
      state({
        isError: true,
        errorMessage: API_FALLBACK_ERRORS.ORDER_LOAD,
        refetch,
      }),
    )

    renderModal(onOpenChange)

    expect(screen.getByRole('alert')).toHaveTextContent(
      API_FALLBACK_ERRORS.ORDER_LOAD,
    )
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(refetch).toHaveBeenCalled()
    await user.click(screen.getAllByRole('button', { name: /close/i })[0])
    expect(onOpenChange.mock.calls[0][0]).toBe(false)
  })
})
