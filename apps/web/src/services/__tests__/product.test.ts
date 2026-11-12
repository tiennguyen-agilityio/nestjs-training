import { API_ROUTES } from '@/constants/routes'
import { createProduct } from '@/services/product'
import type { CreateProductPayload } from '@repo/schemas'

describe('product service create', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('createProduct sends the Idempotency-Key header', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ data: { id: 'prod-1', name: 'Espresso' } }),
    })
    globalThis.fetch = fetchMock as typeof fetch

    await createProduct({ name: 'Espresso' } as CreateProductPayload, {
      idempotencyKey: 'key-1',
    })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(API_ROUTES.PRODUCTS)
    expect(init).toMatchObject({ method: 'POST', credentials: 'include' })
    expect(new Headers(init.headers).get('Idempotency-Key')).toBe('key-1')
  })
})
