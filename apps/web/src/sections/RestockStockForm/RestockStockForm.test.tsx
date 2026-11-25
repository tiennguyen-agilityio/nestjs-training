import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StockLevel } from '@repo/constants'

import RestockStockForm from '@/sections/RestockStockForm'
import { useRestockVariant } from '@/hooks/useInventory'
import type { InventoryItem } from '@/types/inventory'

jest.mock('@/hooks/useInventory', () => ({ useRestockVariant: jest.fn() }))
jest.mock('sonner', () => ({ toast: { success: jest.fn() } }))

const mutate = jest.fn()
const item = {
  id: 'v-1',
  name: '250g',
  sku: 'KEN-250',
  stockQuantity: 9,
  reservedQuantity: 4,
  availableQuantity: 5,
  stockLevel: StockLevel.LOW,
  product: { id: 'p-1', name: 'Kenya AA' },
} as InventoryItem

describe('RestockStockForm', () => {
  beforeEach(() => {
    jest.mocked(useRestockVariant).mockReturnValue({
      mutate,
      isPending: false,
    } as unknown as ReturnType<typeof useRestockVariant>)
  })

  it('RestockStockForm sends the quantity', async () => {
    const user = userEvent.setup()
    render(<RestockStockForm open item={item} onOpenChange={jest.fn()} />)

    await user.type(
      screen.getByRole('spinbutton', { name: 'Quantity to add' }),
      '10',
    )
    await user.click(screen.getByRole('button', { name: 'Restock' }))

    expect(mutate).toHaveBeenCalledWith(
      { variantId: 'v-1', body: { quantity: 10 } },
      expect.any(Object),
    )
  })
})
