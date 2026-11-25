import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  InventoryMovementType,
  ProductStatus,
  StockLevel,
} from '@repo/constants'

import InventoryHistoryPageContent from '@/sections/InventoryHistoryPageContent'
import { ERROR_MESSAGES } from '@/constants/messages'
import { dashboardOrderPath } from '@/constants/routes'
import { useInventoryItem, useVariantMovements } from '@/hooks/useInventory'
import type { InventoryItem, InventoryMovement } from '@/types/inventory'

jest.mock('next/navigation', () => ({
  useParams: () => ({ variantId: 'v-1' }),
  usePathname: () => '/dashboard/inventory/v-1',
}))
jest.mock('@/hooks/useInventory', () => ({
  useInventoryItem: jest.fn(),
  useVariantMovements: jest.fn(),
}))

const item = {
  id: 'v-1',
  sku: 'KEN-250',
  name: '250g',
  stockQuantity: 16,
  reservedQuantity: 2,
  availableQuantity: 14,
  stockLevel: StockLevel.OK,
  product: {
    id: 'p-1',
    name: 'Kenya AA',
    slug: 'kenya-aa',
    status: ProductStatus.ACTIVE,
    primaryImageUrl: null,
  },
} as InventoryItem

const admin = { id: 'u-1', firstName: 'Lan', lastName: 'Nguyen' }
const movements: InventoryMovement[] = [
  {
    id: 'm-3',
    type: InventoryMovementType.ADJUSTMENT,
    quantity: -2,
    reason: 'Torn bags',
    orderNumber: null,
    createdBy: admin,
    createdAt: '2026-11-25T10:00:00.000Z',
  },
  {
    id: 'm-2',
    type: InventoryMovementType.RESERVE,
    quantity: 2,
    reason: null,
    orderNumber: 'ORD-0001',
    createdBy: null,
    createdAt: '2026-11-25T09:00:00.000Z',
  },
  {
    id: 'm-1',
    type: InventoryMovementType.RESTOCK,
    quantity: 10,
    reason: null,
    orderNumber: null,
    createdBy: admin,
    createdAt: '2026-11-25T08:00:00.000Z',
  },
]

const itemResult = (overrides = {}) => ({
  item,
  isLoading: false,
  isFetching: false,
  isError: false,
  isNotFound: false,
  errorMessage: null,
  refetch: jest.fn(),
  ...overrides,
})

describe('InventoryHistoryPageContent', () => {
  beforeEach(() => {
    jest.mocked(useInventoryItem).mockReturnValue(itemResult())
    jest.mocked(useVariantMovements).mockReturnValue({
      movements,
      meta: { currentPage: 1, pageCount: 1, limit: 10, totalCount: 3 },
      isLoading: false,
      isFetching: false,
      isError: false,
      errorMessage: null,
      refetch: jest.fn(),
    })
  })

  it('InventoryHistoryPageContent lists type, quantity, reason, order and who', () => {
    render(<InventoryHistoryPageContent />)

    expect(useInventoryItem).toHaveBeenCalledWith('v-1')
    expect(
      screen.getByRole('heading', { name: /Kenya AA · 250g/ }),
    ).toBeInTheDocument()
    const [, adjustment, reserve, restock] = screen.getAllByRole('row')

    expect(within(restock).getByRole('cell', { name: 'Restock' })).toBeVisible()
    expect(
      within(restock).getByRole('cell', { name: '+10 stock' }),
    ).toBeInTheDocument()
    expect(
      within(restock).getByRole('cell', { name: 'Lan Nguyen' }),
    ).toBeInTheDocument()

    expect(
      within(reserve).getByRole('cell', { name: '+2 reserved' }),
    ).toBeInTheDocument()
    expect(
      within(reserve).getByRole('cell', { name: 'System' }),
    ).toBeInTheDocument()
    expect(
      within(reserve).getByRole('link', { name: 'ORD-0001' }),
    ).toHaveAttribute('href', dashboardOrderPath('ORD-0001'))

    expect(
      within(adjustment).getByRole('cell', { name: '−2 stock' }),
    ).toBeInTheDocument()
    expect(
      within(adjustment).getByRole('cell', { name: 'Torn bags' }),
    ).toBeInTheDocument()
  })

  it('filters by type', async () => {
    const user = userEvent.setup()
    render(<InventoryHistoryPageContent />)

    await user.click(screen.getByRole('button', { name: 'Adjustment' }))

    expect(useVariantMovements).toHaveBeenLastCalledWith('v-1', {
      page: 1,
      type: InventoryMovementType.ADJUSTMENT,
    })
    expect(screen.getByRole('button', { name: 'Adjustment' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('shows not found for a 404', () => {
    jest
      .mocked(useInventoryItem)
      .mockReturnValue(
        itemResult({ item: null, isError: true, isNotFound: true }),
      )

    render(<InventoryHistoryPageContent />)

    expect(
      screen.getByText(ERROR_MESSAGES.PRODUCT_VARIANT_NOT_FOUND),
    ).toBeInTheDocument()
    expect(screen.queryByRole('table')).toBeNull()
  })
})
