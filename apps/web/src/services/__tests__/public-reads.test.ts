import { setDefaultTokenGetter } from '@/services/api'
import { fetchCategories, fetchCategoryById } from '@/services/category'
import { fetchProductById, fetchProducts } from '@/services/product'
import { fetchShippingMethods } from '@/services/shippingMethod'
import { fetchUsers } from '@/services/user'

const authorizationOf = (fetchMock: jest.Mock): string | null => {
  const [, init] = fetchMock.mock.calls[0]
  return (init.headers as Headers).get('Authorization')
}

describe('public reads never carry the session token', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    setDefaultTokenGetter(async () => 'session-token')
  })

  afterEach(() => {
    setDefaultTokenGetter(null)
    globalThis.fetch = originalFetch
  })

  const mockJson = (body: unknown) => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => body,
      text: async () => JSON.stringify(body),
    })
    globalThis.fetch = fetchMock as typeof fetch
    return fetchMock
  }

  it.each([
    ['fetchProducts', () => fetchProducts(), { data: [] }],
    [
      'fetchProductById',
      () => fetchProductById('p-1'),
      { data: { id: 'p-1', name: 'Roast' } },
    ],
    ['fetchCategories', () => fetchCategories(), { data: [] }],
    [
      'fetchCategoryById',
      () => fetchCategoryById('c-1'),
      { data: { id: 'c-1' } },
    ],
    ['fetchShippingMethods', () => fetchShippingMethods(), { data: [] }],
  ])('%s sends no Authorization header', async (_name, call, body) => {
    const fetchMock = mockJson(body)

    await call()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(authorizationOf(fetchMock)).toBeNull()
  })

  it('fetchCategories with includeDeleted sends the session token', async () => {
    const fetchMock = mockJson({ data: [] })

    await fetchCategories({ includeDeleted: true })

    expect(authorizationOf(fetchMock)).toBe('Bearer session-token')
  })

  it('fetchCategories with includeDeleted false sends no Authorization header', async () => {
    const fetchMock = mockJson({ data: [] })

    await fetchCategories({ includeDeleted: false })

    expect(authorizationOf(fetchMock)).toBeNull()
  })

  it('fetchProducts with asAdmin sends the session token', async () => {
    const fetchMock = mockJson({ data: [] })

    await fetchProducts({
      asAdmin: true,
      getToken: async () => 'admin-token',
    })

    expect(authorizationOf(fetchMock)).toBe('Bearer admin-token')
  })

  it('fetchProductById with asAdmin sends the session token', async () => {
    const fetchMock = mockJson({ data: { id: 'p-1', name: 'Roast' } })

    await fetchProductById('p-1', {
      asAdmin: true,
      getToken: async () => 'admin-token',
    })

    expect(authorizationOf(fetchMock)).toBe('Bearer admin-token')
  })

  it('still authenticates reads the API protects', async () => {
    const fetchMock = mockJson({ data: [] })

    await fetchUsers()

    expect(authorizationOf(fetchMock)).toBe('Bearer session-token')
  })
})
