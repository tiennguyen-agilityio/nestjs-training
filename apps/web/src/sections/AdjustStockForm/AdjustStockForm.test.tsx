import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StockLevel } from '@repo/constants'

import AdjustStockForm from '@/sections/AdjustStockForm'
import { useAdjustVariant, useInventoryItem } from '@/hooks/useInventory'
import type { InventoryItem } from '@/types/inventory'
import { ServiceError } from '@/utils/query'
import { API_FALLBACK_ERRORS, ERROR_MESSAGES } from '@/constants/messages'

jest.mock('@/hooks/useInventory', () => ({
  useAdjustVariant: jest.fn(),
  useInventoryItem: jest.fn(),
}))
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

const renderForm = () =>
  render(<AdjustStockForm open item={item} onOpenChange={jest.fn()} />)

describe('AdjustStockForm', () => {
  beforeEach(() => {
    mutate.mockReset()
    jest.mocked(useAdjustVariant).mockReturnValue({
      mutate,
      isPending: false,
    } as unknown as ReturnType<typeof useAdjustVariant>)
    jest.mocked(useInventoryItem).mockReturnValue({
      item,
      isLoading: false,
      isError: false,
      isFetching: false,
      isNotFound: false,
      errorMessage: null,
      refetch: jest.fn(),
    })
  })

  it('AdjustStockForm counts against the fresh stock, not the list row', async () => {
    const user = userEvent.setup()
    jest.mocked(useInventoryItem).mockReturnValue({
      item: { ...item, stockQuantity: 20 },
      isLoading: false,
      isFetching: false,
      isError: false,
      isNotFound: false,
      errorMessage: null,
      refetch: jest.fn(),
    })
    renderForm()

    await user.type(
      screen.getByRole('spinbutton', { name: 'Counted quantity' }),
      '8',
    )
    await user.type(screen.getByRole('textbox', { name: 'Reason' }), 'Count')
    await user.click(screen.getByRole('button', { name: 'Adjust' }))

    expect(mutate).toHaveBeenCalledWith(
      { variantId: 'v-1', body: { quantity: -12, reason: 'Count' } },
      expect.any(Object),
    )
  })

  it('AdjustStockForm keeps Adjust disabled while the stock reloads', async () => {
    const user = userEvent.setup()
    jest.mocked(useInventoryItem).mockReturnValue({
      item,
      isLoading: false,
      isFetching: true,
      isError: false,
      isNotFound: false,
      errorMessage: null,
      refetch: jest.fn(),
    })
    renderForm()

    await user.type(
      screen.getByRole('spinbutton', { name: 'Counted quantity' }),
      '7',
    )
    await user.type(screen.getByRole('textbox', { name: 'Reason' }), 'Count')

    expect(screen.getByRole('button', { name: 'Adjust' })).toBeDisabled()
  })

  it('AdjustStockForm sends the counted minus current stock with the reason', async () => {
    const user = userEvent.setup()
    renderForm()

    expect(useInventoryItem).toHaveBeenCalledWith('v-1')
    await user.type(
      screen.getByRole('spinbutton', { name: 'Counted quantity' }),
      '7',
    )
    await user.type(
      screen.getByRole('textbox', { name: 'Reason' }),
      'Damaged bags',
    )
    expect(screen.getByText('Change: −2')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Adjust' }))

    expect(mutate).toHaveBeenCalledWith(
      { variantId: 'v-1', body: { quantity: -2, reason: 'Damaged bags' } },
      expect.any(Object),
    )
  })

  it('AdjustStockForm disables Save when nothing changes', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.type(
      screen.getByRole('spinbutton', { name: 'Counted quantity' }),
      '9',
    )
    await user.type(screen.getByRole('textbox', { name: 'Reason' }), 'Count')

    expect(screen.getByRole('button', { name: 'Adjust' })).toBeDisabled()
  })

  it('AdjustStockForm shows the below-reserved error on the counted field', async () => {
    const user = userEvent.setup()
    mutate.mockImplementation((_input, { onError }) =>
      onError(
        new ServiceError('Conflict', [
          {
            errCode: 'stockBelowReserved',
            field: 'quantity',
            message: 'Stock cannot be below the 4 units held for orders',
            description: '',
          },
        ]),
      ),
    )
    renderForm()

    await user.type(
      screen.getByRole('spinbutton', { name: 'Counted quantity' }),
      '1',
    )
    await user.type(screen.getByRole('textbox', { name: 'Reason' }), 'Count')
    await user.click(screen.getByRole('button', { name: 'Adjust' }))

    expect(
      await screen.findByText(
        'Stock cannot be below the 4 units held for orders',
      ),
    ).toBeInTheDocument()
  })

  it('AdjustStockForm stays disabled and explains when the stock cannot be read', async () => {
    const user = userEvent.setup()
    jest.mocked(useInventoryItem).mockReturnValue({
      // React Query keeps the cached copy after a failed refetch.
      item,
      isLoading: false,
      isFetching: false,
      isError: true,
      isNotFound: false,
      errorMessage: API_FALLBACK_ERRORS.INVENTORY_ITEM_LOAD,
      refetch: jest.fn(),
    })
    renderForm()

    await user.type(
      screen.getByRole('spinbutton', { name: 'Counted quantity' }),
      '7',
    )
    await user.type(screen.getByRole('textbox', { name: 'Reason' }), 'Count')

    expect(screen.getByRole('button', { name: 'Adjust' })).toBeDisabled()
    expect(
      screen.getByText(API_FALLBACK_ERRORS.INVENTORY_ITEM_LOAD),
    ).toBeInTheDocument()
  })

  it('AdjustStockForm says when the variant no longer exists', () => {
    jest.mocked(useInventoryItem).mockReturnValue({
      item: null,
      isLoading: false,
      isFetching: false,
      isError: true,
      isNotFound: true,
      errorMessage: 'Product variant not found',
      refetch: jest.fn(),
    })
    renderForm()

    expect(
      screen.getByText(ERROR_MESSAGES.PRODUCT_VARIANT_NOT_FOUND),
    ).toBeInTheDocument()
  })

  it('AdjustStockForm reloads the stock after a refused adjust', async () => {
    const user = userEvent.setup()
    const refetch = jest.fn()
    jest.mocked(useInventoryItem).mockReturnValue({
      item,
      isLoading: false,
      isFetching: false,
      isError: false,
      isNotFound: false,
      errorMessage: null,
      refetch,
    })
    mutate.mockImplementation((_input, { onError }) =>
      onError(new ServiceError('Conflict', [])),
    )
    renderForm()

    await user.type(
      screen.getByRole('spinbutton', { name: 'Counted quantity' }),
      '1',
    )
    await user.type(screen.getByRole('textbox', { name: 'Reason' }), 'Count')
    await user.click(screen.getByRole('button', { name: 'Adjust' }))

    expect(refetch).toHaveBeenCalled()
  })
})
