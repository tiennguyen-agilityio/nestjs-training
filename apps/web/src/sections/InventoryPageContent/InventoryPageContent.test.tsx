import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ProductStatus, StockLevel } from '@repo/constants'

import InventoryPageContent from '@/sections/InventoryPageContent'
import { TooltipProvider } from '@/components/ui/tooltip'
import { dashboardInventoryHistoryPath } from '@/constants/routes'
import { useInventory } from '@/hooks/useInventory'
import type { InventoryItem } from '@/types/inventory'

const mockUpdate = jest.fn()
let mockUrlState: Record<string, unknown>

jest.mock('@/hooks/useInventory', () => ({
  useInventory: jest.fn(),
  useInventoryItem: jest.fn(() => ({ item: null, isLoading: true })),
  useRestockVariant: jest.fn(() => ({ mutate: jest.fn(), isPending: false })),
  useAdjustVariant: jest.fn(() => ({ mutate: jest.fn(), isPending: false })),
}))
jest.mock('@/hooks/useUrlState', () => ({
  useUrlState: () => ({ state: mockUrlState, update: mockUpdate }),
}))
jest.mock('sonner', () => ({ toast: { success: jest.fn() } }))

const item: InventoryItem = {
  id: 'v-1',
  sku: 'KEN-250',
  name: '250g',
  size: 250,
  unit: 'G',
  price: 12,
  discountType: 'PERCENT',
  discountValue: 0,
  stockQuantity: 9,
  reservedQuantity: 4,
  availableQuantity: 5,
  stockLevel: StockLevel.LOW,
  product: {
    id: 'p-1',
    name: 'Kenya AA',
    slug: 'kenya-aa',
    status: ProductStatus.DRAFT,
    primaryImageUrl: null,
  },
} as InventoryItem

describe('InventoryPageContent', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUrlState = { page: 1, search: '', limit: 10, lowStock: null }
    jest.mocked(useInventory).mockReturnValue({
      items: [item],
      meta: { currentPage: 1, pageCount: 1, limit: 10, totalCount: 1 },
      isLoading: false,
      isFetching: false,
      isError: false,
      errorMessage: null,
      refetch: jest.fn(),
    })
  })

  it('InventoryPageContent lists product, variant, stock, reserved, available and level', () => {
    render(<InventoryPageContent />)

    for (const label of [
      'Product',
      'Variant',
      'Stock',
      'Reserved',
      'Available',
      'Level',
    ]) {
      expect(
        screen.getByRole('columnheader', { name: label }),
      ).toBeInTheDocument()
    }
    const row = within(screen.getAllByRole('row')[1])
    const productCell = row.getByRole('cell', { name: /Kenya AA/ })
    expect(productCell).toHaveTextContent('Draft')
    // The product image: its initial until the image loads.
    expect(productCell.querySelector('[data-slot="avatar"]')).toHaveTextContent(
      'K',
    )
    expect(row.getByRole('cell', { name: /250g/ })).toHaveTextContent('KEN-250')
    expect(row.getByRole('cell', { name: '9' })).toBeInTheDocument()
    expect(row.getByRole('cell', { name: '4' })).toBeInTheDocument()
    expect(row.getByRole('cell', { name: '5' })).toBeInTheDocument()
    expect(row.getByRole('cell', { name: 'Low' })).toBeInTheDocument()
  })

  it('stacks each row as a labelled card on mobile', () => {
    render(<InventoryPageContent />)

    expect(screen.getByRole('table')).toHaveClass('max-md:block')
    const cells = within(screen.getAllByRole('row')[1]).getAllByRole('cell')
    expect(cells.map((cell) => cell.getAttribute('data-label'))).toEqual([
      null,
      'Variant',
      'Stock',
      'Reserved',
      'Available',
      'Level',
      'Actions',
    ])
  })

  it('InventoryPageContent writes lowStock to the URL', async () => {
    const user = userEvent.setup()
    render(<InventoryPageContent />)

    await user.click(screen.getByRole('button', { name: 'Low stock only' }))

    expect(mockUpdate).toHaveBeenCalledWith({ lowStock: 'true', page: 1 })
    expect(useInventory).toHaveBeenLastCalledWith(
      expect.objectContaining({ lowStock: false }),
    )
  })

  it('opens Restock and Adjust dialogs and links History', async () => {
    const user = userEvent.setup()
    render(<InventoryPageContent />)

    expect(
      screen.getByRole('link', { name: 'History of KEN-250' }),
    ).toHaveAttribute('href', dashboardInventoryHistoryPath('v-1'))
    await user.click(screen.getByRole('button', { name: 'Restock KEN-250' }))
    expect(
      await screen.findByRole('alertdialog', { name: /Restock/ }),
    ).toBeInTheDocument()
  })

  it.each([
    ['button', 'Restock KEN-250', 'Restock'],
    ['button', 'Adjust KEN-250', 'Adjust stock'],
    ['link', 'History of KEN-250', 'View history'],
  ] as const)(
    'shows a tooltip on hovering the %s "%s"',
    async (role, name, tooltip) => {
      const user = userEvent.setup()
      render(
        <TooltipProvider delay={0}>
          <InventoryPageContent />
        </TooltipProvider>,
      )

      await user.hover(screen.getByRole(role, { name }))

      expect(await screen.findByText(tooltip)).toBeInTheDocument()
    },
  )
})
