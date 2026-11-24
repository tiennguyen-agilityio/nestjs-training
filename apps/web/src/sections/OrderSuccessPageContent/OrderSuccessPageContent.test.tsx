import { render, screen } from '@testing-library/react'
import type React from 'react'
import { useRouter } from 'next/navigation'
import {
  OrderPaymentStatus,
  OrderStatus,
  ShippingStatus,
} from '@repo/constants'

import OrderSuccessPageContent from '@/sections/OrderSuccessPageContent'
import { useCartStore } from '@/store/useCartStore'
import type { PlacedOrder } from '@/types/order'

jest.mock('next/navigation', () => ({ useRouter: jest.fn() }))
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

describe('OrderSuccessPageContent', () => {
  beforeEach(() => {
    jest.mocked(useRouter).mockReturnValue({
      push: jest.fn(),
    } as unknown as ReturnType<typeof useRouter>)
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
})
