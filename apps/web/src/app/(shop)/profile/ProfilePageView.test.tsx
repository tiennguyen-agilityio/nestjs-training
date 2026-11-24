import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import {
  OrderPaymentStatus,
  OrderStatus,
  PaymentMethod,
  ShippingStatus,
} from '@repo/constants'

import { ProfilePageView } from '@/app/(shop)/profile/ProfilePageView'
import { useMyOrders } from '@/hooks/useOrder'
import { ROUTES } from '@/constants/routes'
import { API_FALLBACK_ERRORS } from '@/constants/messages'
import { formatPrice } from '@/utils/common'
import { formatOrderListDate } from '@/utils/order'
import type { OrderSummary } from '@/types/order'

const mockUseAuth = jest.fn()
const mockUseClerkUser = jest.fn()

jest.mock('@/hooks/useAuth', () => ({
  useAuth: (...args: unknown[]) => mockUseAuth(...args),
}))

jest.mock('@clerk/nextjs', () => ({
  useUser: (...args: unknown[]) => mockUseClerkUser(...args),
}))

jest.mock('@clerk/nextjs/errors', () => ({
  isClerkAPIResponseError: () => false,
}))

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}))

jest.mock('@/hooks/useOrder', () => ({ useMyOrders: jest.fn() }))

const mockOrderDetailModal = jest.fn()
jest.mock('@/sections/OrderDetailModal', () => ({
  OrderDetailModal: (props: { orderNumber: string | null; open: boolean }) => {
    mockOrderDetailModal(props)
    return props.open ? <div>Details of {props.orderNumber}</div> : null
  },
}))

jest.mock('@/components/Select', () => ({
  Select: ({
    ariaLabel,
    selected,
    onValueChange,
    options,
  }: {
    ariaLabel?: string
    selected?: string
    onValueChange?: (value: string) => void
    options: { value: string; label: string }[]
  }) => (
    <select
      aria-label={ariaLabel}
      value={selected ?? ''}
      onChange={(event) => onValueChange?.(event.target.value)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}))

const mockUseMyOrders = jest.mocked(useMyOrders)

const summary = (
  orderNumber: string,
  status: OrderStatus,
  totalAmount: number,
  createdAt: string,
): OrderSummary => ({
  id: `id-${orderNumber}`,
  orderNumber,
  userId: 'user-1',
  customer: { firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com' },
  status,
  shippingStatus: ShippingStatus.PENDING,
  paymentStatus: OrderPaymentStatus.UNPAID,
  paymentMethod: PaymentMethod.COD,
  itemCount: 1,
  totalAmount,
  createdAt,
})

const o2 = summary(
  'CH-261124-0002',
  OrderStatus.PENDING,
  53.8,
  '2026-11-24T09:00:00.000Z',
)
const o1 = summary(
  'CH-261120-0001',
  OrderStatus.COMPLETED,
  21.5,
  '2026-11-20T09:00:00.000Z',
)

const ordersState = (
  overrides: Partial<ReturnType<typeof useMyOrders>> = {},
): ReturnType<typeof useMyOrders> => ({
  orders: [o2, o1],
  meta: { limit: 10, currentPage: 1, pageCount: 1, totalCount: 2 },
  isLoading: false,
  isError: false,
  errorMessage: null,
  refetch: jest.fn().mockResolvedValue(undefined),
  ...overrides,
})

const lastOrdersCall = () => mockUseMyOrders.mock.calls.at(-1)?.[0]

describe('ProfilePageView', () => {
  beforeEach(() => {
    mockUseMyOrders.mockReturnValue(ordersState())
    mockUseAuth.mockReturnValue({
      user: {
        id: 'user-1',
        firstName: 'Jane',
        lastName: 'Doe',
        name: null,
        email: 'jane@example.com',
        avatarUrl: null,
      },
      error: null,
      isSignedIn: true,
      isAuthLoaded: true,
    })
    mockUseClerkUser.mockReturnValue({
      user: {
        firstName: 'Jane',
        lastName: 'Doe',
        fullName: 'Jane Doe',
        imageUrl: 'https://example.com/avatar.png',
        update: jest.fn(),
        setProfileImage: jest.fn(),
      },
      isLoaded: true,
    })
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('ProfilePageView lists the orders with number, date, total and status (AC3)', () => {
    render(<ProfilePageView />)

    expect(
      screen.getByRole('heading', { name: 'Order History' }),
    ).toBeInTheDocument()
    for (const [order, label] of [
      [o2, 'Pending'],
      [o1, 'Completed'],
    ] as const) {
      const row = screen
        .getByRole('button', { name: `View order #${order.orderNumber}` })
        .closest('tr') as HTMLElement
      expect(within(row).getByText(`#${order.orderNumber}`)).toBeInTheDocument()
      expect(
        within(row).getByText(formatOrderListDate(order.createdAt)),
      ).toBeInTheDocument()
      expect(within(row).getByText(label)).toBeInTheDocument()
      expect(
        within(row).getByText(formatPrice(order.totalAmount)),
      ).toBeInTheDocument()
    }
    expect(lastOrdersCall()).toEqual({ page: 1 })
  })

  it('changing the status filter goes back to page 1', async () => {
    const user = userEvent.setup()
    mockUseMyOrders.mockReturnValue(
      ordersState({
        meta: { limit: 10, currentPage: 1, pageCount: 2, totalCount: 12 },
      }),
    )
    render(<ProfilePageView />)

    await user.click(screen.getByRole('link', { name: '2' }))
    expect(lastOrdersCall()).toEqual({ page: 2 })

    const filter = screen.getByRole('combobox', {
      name: 'Filter by order status',
    })
    await user.selectOptions(filter, OrderStatus.PENDING)
    expect(lastOrdersCall()).toEqual({ page: 1, status: OrderStatus.PENDING })

    await user.selectOptions(filter, 'all')
    expect(lastOrdersCall()).toEqual({ page: 1 })
  })

  it('the pager asks useMyOrders for the next page', async () => {
    const user = userEvent.setup()
    mockUseMyOrders.mockReturnValue(
      ordersState({
        meta: { limit: 10, currentPage: 1, pageCount: 2, totalCount: 12 },
      }),
    )
    render(<ProfilePageView />)

    await user.click(screen.getByRole('link', { name: '2' }))

    expect(lastOrdersCall()).toEqual({ page: 2 })
  })

  it('no orders shows No orders yet with a link to the roasts', () => {
    mockUseMyOrders.mockReturnValue(
      ordersState({
        orders: [],
        meta: { limit: 10, currentPage: 1, pageCount: 0, totalCount: 0 },
      }),
    )
    render(<ProfilePageView />)

    expect(screen.getByText('No orders yet.')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Find your first bag' }),
    ).toHaveAttribute('href', ROUTES.ROASTS)
  })

  it('no match for a status filter shows No orders found', async () => {
    const user = userEvent.setup()
    mockUseMyOrders.mockReturnValue(
      ordersState({
        orders: [],
        meta: { limit: 10, currentPage: 1, pageCount: 0, totalCount: 0 },
      }),
    )
    render(<ProfilePageView />)

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Filter by order status' }),
      OrderStatus.PENDING,
    )

    expect(screen.getByText('No orders found.')).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: 'Find your first bag' }),
    ).not.toBeInTheDocument()
  })

  it('View Details opens the modal for that order', async () => {
    const user = userEvent.setup()
    render(<ProfilePageView />)

    await user.click(
      screen.getByRole('button', { name: `View order #${o2.orderNumber}` }),
    )

    expect(screen.getByText(`Details of ${o2.orderNumber}`)).toBeInTheDocument()
    expect(mockOrderDetailModal).toHaveBeenLastCalledWith(
      expect.objectContaining({ orderNumber: o2.orderNumber, open: true }),
    )
  })

  it('a list error without a message shows the fallback text', () => {
    mockUseMyOrders.mockReturnValue(
      ordersState({
        orders: [],
        meta: null,
        isError: true,
        errorMessage: null,
      }),
    )
    render(<ProfilePageView />)

    expect(screen.getByRole('alert')).toHaveTextContent(
      API_FALLBACK_ERRORS.ORDERS_LOAD,
    )
  })

  it('the list error shows Retry', async () => {
    const user = userEvent.setup()
    const refetch = jest.fn().mockResolvedValue(undefined)
    mockUseMyOrders.mockReturnValue(
      ordersState({
        orders: [],
        meta: null,
        isError: true,
        errorMessage: API_FALLBACK_ERRORS.ORDERS_LOAD,
        refetch,
      }),
    )
    render(<ProfilePageView />)

    expect(screen.getByRole('alert')).toHaveTextContent(
      API_FALLBACK_ERRORS.ORDERS_LOAD,
    )
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(refetch).toHaveBeenCalled()
  })

  it('enables the Edit Profile action once the user is signed in', () => {
    render(<ProfilePageView />)

    expect(screen.getByRole('button', { name: 'Edit Profile' })).toBeEnabled()
  })

  it('disables the Edit Profile action while signed out', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      error: null,
      isSignedIn: false,
      isAuthLoaded: true,
    })

    render(<ProfilePageView />)

    expect(screen.getByRole('button', { name: 'Edit Profile' })).toBeDisabled()
  })

  it('opens the edit profile dialog prefilled from the Clerk user', async () => {
    const user = userEvent.setup()
    render(<ProfilePageView />)

    await user.click(screen.getByRole('button', { name: 'Edit Profile' }))

    expect(screen.getByTestId('modal-edit-profile')).toBeInTheDocument()
    expect(screen.getByLabelText(/first name/i)).toHaveValue('Jane')
    expect(screen.getByLabelText(/last name/i)).toHaveValue('Doe')
  })
})
