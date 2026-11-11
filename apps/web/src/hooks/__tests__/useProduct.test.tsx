import type { ReactNode } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuth } from '@clerk/nextjs'
import { ProductStatus, RoastLevel } from '@repo/constants'

import { CLERK_SESSION_TEMPLATE } from '@/constants/common'
import {
  productDetailQueryKey,
  productsListQueryKey,
  useCreateProduct,
  useDeleteProduct,
  useProductById,
  useProducts,
  useUpdateProduct,
} from '@/hooks/useProduct'
import {
  createProduct,
  fetchProductById,
  fetchProducts,
} from '@/services/product'
import { IDEMPOTENCY } from '@/constants/common'
import { ServiceError } from '@/utils/query'
import type { CreateProductPayload } from '@repo/schemas'
import type { ResponseMeta } from '@/types/api'
import type { Product } from '@/types/product'

jest.mock('@clerk/nextjs', () => ({ useAuth: jest.fn() }))

jest.mock('@/services/product', () => ({
  ...jest.requireActual('@/services/product'),
  createProduct: jest.fn(),
  deleteProduct: jest.fn().mockResolvedValue({ ok: true }),
  updateProduct: jest.fn().mockResolvedValue({ ok: true, product: {} }),
  fetchProducts: jest
    .fn()
    .mockResolvedValue({ ok: true, products: [], meta: undefined }),
  fetchProductById: jest.fn(),
}))

const mockUseAuth = jest.mocked(useAuth)
const mockFetchProducts = jest.mocked(fetchProducts)
const mockFetchProductById = jest.mocked(fetchProductById)

const mockClerk = (state: {
  isLoaded: boolean
  userId: string | null
  getToken?: jest.Mock
}) => {
  const getToken = state.getToken ?? jest.fn().mockResolvedValue(null)
  mockUseAuth.mockReturnValue({
    isLoaded: state.isLoaded,
    userId: state.userId,
    getToken,
  } as unknown as ReturnType<typeof useAuth>)
  return getToken
}

const newClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false } } })

const renderWithClient = <T,>(hook: () => T, client = newClient()) => {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return renderHook(hook, { wrapper })
}

interface ListCache {
  products: Product[]
  meta: ResponseMeta | null
}

const product = (id: string, name: string): Product => ({
  id,
  categoryId: 'cat-1',
  name,
  description: '',
  roastLevel: RoastLevel.MEDIUM,
  isOrganic: false,
  isFairTrade: false,
  status: ProductStatus.ACTIVE,
  tastingNotes: '',
  origin: '',
  processingMethod: '',
  variants: [],
  images: [],
  createdAt: null,
  updatedAt: null,
  deletedAt: null,
})

const prodA = product('p-a', 'Arabica')
const prodB = product('p-b', 'Blend')
const meta: ResponseMeta = {
  limit: 10,
  currentPage: 1,
  pageCount: 1,
  totalCount: 2,
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('query keys', () => {
  it('keys admin lists and details apart from shop ones', () => {
    const adminList = productsListQueryKey({ asAdmin: true }, 'user-1')
    const shopList = productsListQueryKey({}, 'user-1')

    expect(adminList[2]).toBe(true)
    expect(shopList[2]).toBe(false)
    expect(adminList.at(-1)).toBe('user-1')
    expect(shopList.at(-1)).toBeNull()
    expect(productsListQueryKey({ asAdmin: true }, 'user-2')).not.toEqual(
      adminList,
    )

    expect(
      productDetailQueryKey('p-a', { asAdmin: true, userId: 'user-1' }),
    ).not.toEqual(productDetailQueryKey('p-a'))
    expect(productDetailQueryKey('p-a', { userId: 'user-1' })).toEqual(
      productDetailQueryKey('p-a'),
    )
  })
})

describe('useProducts', () => {
  it('waits for Clerk before an admin list fetch', () => {
    mockClerk({ isLoaded: false, userId: null })

    renderWithClient(() => useProducts({ asAdmin: true }))

    expect(mockFetchProducts).not.toHaveBeenCalled()
  })

  it('fetches the admin list with the Clerk session token once loaded', async () => {
    const getToken = mockClerk({
      isLoaded: true,
      userId: 'user-1',
      getToken: jest.fn().mockResolvedValue('admin-token'),
    })

    renderWithClient(() => useProducts({ asAdmin: true }))

    await waitFor(() => expect(mockFetchProducts).toHaveBeenCalledTimes(1))
    const options = mockFetchProducts.mock.calls[0][0]
    expect(options?.asAdmin).toBe(true)
    await expect(options?.getToken?.()).resolves.toBe('admin-token')
    expect(getToken).toHaveBeenCalledWith({
      template: CLERK_SESSION_TEMPLATE,
    })
  })

  it('fetches shop lists without waiting for Clerk', async () => {
    mockClerk({ isLoaded: false, userId: null })

    renderWithClient(() => useProducts({ status: ProductStatus.ACTIVE }))

    await waitFor(() => expect(mockFetchProducts).toHaveBeenCalledTimes(1))
    expect(mockFetchProducts.mock.calls[0][0]?.getToken).toBeUndefined()
  })

  it('reports loading while Clerk is not loaded', () => {
    mockClerk({ isLoaded: false, userId: null })

    const list = renderWithClient(() => useProducts({ asAdmin: true }))
    const detail = renderWithClient(() =>
      useProductById('p-a', { asAdmin: true }),
    )

    expect(list.result.current).toMatchObject({
      isLoading: true,
      isError: false,
    })
    expect(detail.result.current).toMatchObject({
      isLoading: true,
      isError: false,
    })
  })
})

describe('useProductById', () => {
  it('reads an admin detail with the token once loaded', async () => {
    mockClerk({
      isLoaded: true,
      userId: 'user-1',
      getToken: jest.fn().mockResolvedValue('admin-token'),
    })
    mockFetchProductById.mockResolvedValue({ ok: true, product: prodA })

    renderWithClient(() => useProductById('p-a', { asAdmin: true }))

    await waitFor(() => expect(mockFetchProductById).toHaveBeenCalledTimes(1))
    const [id, options] = mockFetchProductById.mock.calls[0]
    expect(id).toBe('p-a')
    expect(options?.asAdmin).toBe(true)
    await expect(options?.getToken?.()).resolves.toBe('admin-token')
  })
})

describe('useDeleteProduct', () => {
  const adminListKey = productsListQueryKey({ asAdmin: true }, 'user-1')
  const shopListKey = productsListQueryKey({})
  const adminDetailKey = productDetailQueryKey('p-a', {
    asAdmin: true,
    userId: 'user-1',
  })

  const deleteA = async () => {
    mockClerk({ isLoaded: true, userId: 'user-1' })
    const client = newClient()
    client.setQueryData<ListCache>(adminListKey, {
      products: [prodA, prodB],
      meta,
    })
    client.setQueryData<ListCache>(shopListKey, {
      products: [prodA, prodB],
      meta,
    })
    client.setQueryData<Product>(adminDetailKey, prodA)
    const invalidate = jest.spyOn(client, 'invalidateQueries')

    const { result } = renderWithClient(() => useDeleteProduct(), client)
    await act(async () => {
      await result.current.mutateAsync('p-a')
    })
    return { client, invalidate }
  }

  it('marks the row deleted in admin lists', async () => {
    const { client } = await deleteA()

    const cache = client.getQueryData<ListCache>(adminListKey)
    expect(cache?.products.map((p) => p.id)).toEqual(['p-a', 'p-b'])
    expect(cache?.products[0].deletedAt).not.toBeNull()
    expect(cache?.products[0].status).toBe(ProductStatus.ARCHIVED)
    expect(cache?.products[1].deletedAt).toBeNull()
    expect(cache?.meta?.totalCount).toBe(2)
  })

  it('removes the row from shop lists', async () => {
    const { client } = await deleteA()

    const cache = client.getQueryData<ListCache>(shopListKey)
    expect(cache?.products.map((p) => p.id)).toEqual(['p-b'])
    expect(cache?.meta?.totalCount).toBe(1)
  })

  it('marks the cached detail deleted', async () => {
    const { client } = await deleteA()

    expect(client.getQueryData<Product>(adminDetailKey)?.deletedAt).not.toBe(
      null,
    )
  })

  it('invalidates the product queries', async () => {
    const { invalidate } = await deleteA()

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['products'] })
  })
})

describe('useUpdateProduct', () => {
  it('invalidates the admin detail', async () => {
    mockClerk({ isLoaded: true, userId: 'user-1' })
    const client = newClient()
    const adminDetailKey = productDetailQueryKey('p-a', {
      asAdmin: true,
      userId: 'user-1',
    })
    client.setQueryData<Product>(adminDetailKey, prodA)

    const { result } = renderWithClient(() => useUpdateProduct(), client)
    await act(async () => {
      await result.current.mutateAsync({ id: 'p-a', body: { name: 'New' } })
    })

    expect(client.getQueryState(adminDetailKey)?.isInvalidated).toBe(true)
  })
})

const createdProduct = product('prod-new', 'Espresso')
const espresso = { name: 'Espresso' } as CreateProductPayload
const latte = { name: 'Latte' } as CreateProductPayload

describe('useCreateProduct', () => {
  const mockCreate = jest.mocked(createProduct)
  const inFlight = {
    ok: false as const,
    error: 'In progress',
    status: 409,
    errorResponse: {
      statusCode: 409,
      message: 'Conflict',
      errors: [
        { errCode: 'duplicateResource', field: '', message: 'In progress' },
      ],
    },
  }

  beforeEach(() => {
    mockClerk({ isLoaded: true, userId: 'user-1' })
    mockCreate.mockReset()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  const keysSent = () =>
    mockCreate.mock.calls.map(([, options]) => options?.idempotencyKey)

  it('useCreateProduct reuses the Idempotency-Key when the same values are retried', async () => {
    mockCreate
      .mockResolvedValueOnce({ ok: false, error: 'Network error' })
      .mockResolvedValueOnce({ ok: true, product: createdProduct })
    const { result } = renderWithClient(() => useCreateProduct())

    await act(async () => {
      await result.current.mutateAsync(espresso).catch(() => undefined)
    })
    let created: unknown
    await act(async () => {
      created = await result.current.mutateAsync(espresso)
    })

    const [first, second] = keysSent()
    expect(first).toEqual(expect.any(String))
    expect(second).toBe(first)
    expect(created).toEqual(createdProduct)
  })

  it('useCreateProduct uses a new Idempotency-Key after a success', async () => {
    mockCreate.mockResolvedValue({ ok: true, product: createdProduct })
    const { result } = renderWithClient(() => useCreateProduct())

    await act(async () => {
      await result.current.mutateAsync(espresso)
    })
    await act(async () => {
      await result.current.mutateAsync(espresso)
    })

    const [first, second] = keysSent()
    expect(second).not.toBe(first)
  })

  it('useCreateProduct uses a new Idempotency-Key when the values change', async () => {
    mockCreate.mockResolvedValue({ ok: false, error: 'Network error' })
    const { result } = renderWithClient(() => useCreateProduct())

    await act(async () => {
      await result.current.mutateAsync(espresso).catch(() => undefined)
    })
    await act(async () => {
      await result.current.mutateAsync(latte).catch(() => undefined)
    })

    const [first, second] = keysSent()
    expect(second).not.toBe(first)
  })

  it('useCreateProduct retries an in-flight 409 with the same key and resolves with the record', async () => {
    jest.useFakeTimers()
    mockCreate
      .mockResolvedValueOnce(inFlight)
      .mockResolvedValueOnce({ ok: true, product: createdProduct })
    const { result } = renderWithClient(() => useCreateProduct())

    let created: unknown
    await act(async () => {
      const pending = result.current.mutateAsync(espresso)
      await jest.advanceTimersByTimeAsync(IDEMPOTENCY.IN_FLIGHT_RETRY_MS)
      created = await pending
    })

    const [first, second] = keysSent()
    expect(keysSent()).toHaveLength(2)
    expect(second).toBe(first)
    expect(created).toEqual(createdProduct)
  })

  it('useCreateProduct keeps a name-exists 409 as an error', async () => {
    mockCreate.mockResolvedValue({
      ok: false,
      error: 'Name exists',
      status: 409,
      errorResponse: {
        statusCode: 409,
        message: 'Conflict',
        errors: [
          {
            errCode: 'productNameExists',
            field: 'name',
            message: 'Name exists',
          },
        ],
      },
    })
    const { result } = renderWithClient(() => useCreateProduct())

    let error: unknown
    await act(async () => {
      error = await result.current
        .mutateAsync(espresso)
        .catch((e: unknown) => e)
    })

    expect(mockCreate).toHaveBeenCalledTimes(1)
    expect(error).toBeInstanceOf(ServiceError)
    expect((error as ServiceError).errors[0].errCode).toBe('productNameExists')
  })
})
