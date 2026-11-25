import { InventoryMovementType, StockLevel } from '@repo/constants'

import { API_ROUTES } from '@/constants/routes'
import {
  adjustVariant,
  fetchInventory,
  fetchInventoryItem,
  fetchVariantMovements,
  restockVariant,
} from '@/services/inventory'
import type { InventoryItem } from '@/types/inventory'

const item = {
  id: 'v-1',
  sku: 'KEN-250',
  stockQuantity: 9,
  reservedQuantity: 4,
  availableQuantity: 5,
  stockLevel: StockLevel.LOW,
} as InventoryItem
const meta = { limit: 10, currentPage: 1, pageCount: 1, totalCount: 1 }

const fetchResponse = (body: unknown, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => body,
  text: async () => (body === undefined ? '' : JSON.stringify(body)),
})

const requestInit = (fetchMock: jest.Mock) =>
  fetchMock.mock.calls[0]?.[1] as RequestInit

const getToken = async () => 'tok'

describe('inventory service', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('fetchInventory sends lowStock, activeOnly, search, sort with credentials', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(fetchResponse({ data: [item], meta }))
    globalThis.fetch = fetchMock

    const result = await fetchInventory({
      getToken,
      page: 2,
      limit: 10,
      search: ' ken ',
      lowStock: true,
      activeOnly: true,
    })

    const url = new URL(fetchMock.mock.calls[0]?.[0] as string)
    expect(`${url.origin}${url.pathname}`).toBe(API_ROUTES.INVENTORY)
    expect(Object.fromEntries(url.searchParams)).toEqual({
      page: '2',
      limit: '10',
      search: 'ken',
      lowStock: 'true',
      activeOnly: 'true',
    })
    expect(requestInit(fetchMock).credentials).toBe('include')
    const headers = requestInit(fetchMock).headers as Headers
    expect(headers.get('Authorization')).toBe('Bearer tok')
    expect(result).toEqual({ ok: true, items: [item], meta })
  })

  it('fetchInventoryItem reads one variant', async () => {
    const fetchMock = jest.fn().mockResolvedValue(fetchResponse({ data: item }))
    globalThis.fetch = fetchMock

    const result = await fetchInventoryItem('v-1', { getToken })

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${API_ROUTES.PRODUCT_VARIANTS}/v-1`,
    )
    expect(result).toEqual({ ok: true, item })
  })

  it('restockVariant posts with the Idempotency-Key', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(
        fetchResponse({ data: { variant: item, movement: {} } }, 201),
      )
    globalThis.fetch = fetchMock

    const result = await restockVariant(
      'v-1',
      { quantity: 10 },
      { getToken, idempotencyKey: 'key-1' },
    )

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${API_ROUTES.PRODUCT_VARIANTS}/v-1/restock`,
    )
    expect(requestInit(fetchMock).method).toBe('POST')
    expect(requestInit(fetchMock).body).toBe(JSON.stringify({ quantity: 10 }))
    const headers = requestInit(fetchMock).headers as Headers
    expect(headers.get('Idempotency-Key')).toBe('key-1')
    expect(result).toMatchObject({ ok: true, result: { variant: item } })
  })

  it('adjustVariant returns the 409 error response', async () => {
    const error = {
      statusCode: 409,
      message: 'Conflict',
      errors: [
        {
          errCode: 'stockBelowReserved',
          field: 'quantity',
          message: 'Stock cannot be below the 3 units held for orders',
          description: '',
        },
      ],
    }
    globalThis.fetch = jest.fn().mockResolvedValue(fetchResponse(error, 409))

    const result = await adjustVariant(
      'v-1',
      { quantity: -5, reason: 'Count' },
      { getToken, idempotencyKey: 'key-2' },
    )

    expect(result).toMatchObject({ ok: false, status: 409 })
    expect(!result.ok && result.errorResponse?.errors?.[0]?.errCode).toBe(
      'stockBelowReserved',
    )
  })

  it('fetchVariantMovements sends page and type', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(fetchResponse({ data: [], meta }))
    globalThis.fetch = fetchMock

    await fetchVariantMovements('v-1', {
      getToken,
      page: 1,
      limit: 20,
      type: InventoryMovementType.ADJUSTMENT,
    })

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${API_ROUTES.PRODUCT_VARIANTS}/v-1/movements?page=1&limit=20&type=ADJUSTMENT`,
    )
  })
})
