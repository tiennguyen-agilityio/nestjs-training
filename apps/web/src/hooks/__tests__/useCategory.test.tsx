import type { ReactNode } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuth } from '@clerk/nextjs'

import { CLERK_SESSION_TEMPLATE } from '@/constants/common'
import {
  categoriesListQueryKey,
  useCategories,
  useCreateCategory,
  useDeleteCategory,
  useRestoreCategory,
} from '@/hooks/useCategory'
import {
  createCategory,
  fetchCategories,
  restoreCategory,
} from '@/services/category'
import { IDEMPOTENCY } from '@/constants/common'
import { ServiceError } from '@/utils/query'
import type { Category } from '@/types/category'
import type { ResponseMeta } from '@/types/api'

jest.mock('@clerk/nextjs', () => ({ useAuth: jest.fn() }))

jest.mock('@/services/category', () => ({
  ...jest.requireActual('@/services/category'),
  createCategory: jest.fn(),
  deleteCategory: jest.fn().mockResolvedValue({ ok: true }),
  restoreCategory: jest.fn(),
  fetchCategories: jest
    .fn()
    .mockResolvedValue({ ok: true, categories: [], meta: undefined }),
}))

const mockUseAuth = jest.mocked(useAuth)
const mockFetchCategories = jest.mocked(fetchCategories)
const mockRestoreCategory = jest.mocked(restoreCategory)

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

const renderWithClient = <T,>(hook: () => T) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return renderHook(hook, { wrapper })
}

interface ListCache {
  categories: Category[]
  meta: ResponseMeta | null
}

const category = (id: string, name: string): Category => ({
  id,
  name,
  slug: name.toLowerCase(),
  createdBy: null,
  updatedBy: null,
  deletedBy: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  deletedAt: null,
})

const catA = category('cat-a', 'Arabica')
const catB = category('cat-b', 'Blends')
const meta: ResponseMeta = {
  limit: 10,
  currentPage: 2,
  pageCount: 2,
  totalCount: 12,
}

describe('categoriesListQueryKey', () => {
  it('separates lists that include deleted rows', () => {
    const params = { page: 2, limit: 10, search: 'bean' }

    expect(
      categoriesListQueryKey({ ...params, includeDeleted: true }),
    ).not.toEqual(categoriesListQueryKey(params))
    expect(
      categoriesListQueryKey({ ...params, includeDeleted: false }),
    ).toEqual(categoriesListQueryKey(params))
  })
})

describe('useCategories', () => {
  beforeEach(() => {
    mockFetchCategories.mockClear()
  })

  it('waits for Clerk before fetching deleted rows', async () => {
    mockClerk({ isLoaded: false, userId: null })

    renderWithClient(() => useCategories({ includeDeleted: true }))
    await act(() => Promise.resolve())

    expect(mockFetchCategories).not.toHaveBeenCalled()
  })

  it('fetches deleted rows with the Clerk session token once loaded', async () => {
    const clerkGetToken = mockClerk({
      isLoaded: true,
      userId: 'user_1',
      getToken: jest.fn().mockResolvedValue('clerk-token'),
    })

    renderWithClient(() => useCategories({ includeDeleted: true }))

    await waitFor(() =>
      expect(mockFetchCategories).toHaveBeenCalledWith(
        expect.objectContaining({ includeDeleted: true }),
      ),
    )
    const [options] = mockFetchCategories.mock.calls[0]
    await expect(options?.getToken?.()).resolves.toBe('clerk-token')
    expect(clerkGetToken).toHaveBeenCalledWith({
      template: CLERK_SESSION_TEMPLATE,
    })
  })

  it('fetches public lists without waiting for Clerk', async () => {
    mockClerk({ isLoaded: false, userId: null })

    renderWithClient(() => useCategories({ page: 1 }))

    await waitFor(() => expect(mockFetchCategories).toHaveBeenCalled())
    const [options] = mockFetchCategories.mock.calls[0]
    expect(options?.getToken).toBeUndefined()
  })

  it('keys deleted-row lists by user', () => {
    expect(
      categoriesListQueryKey({ includeDeleted: true }, 'user_1'),
    ).not.toEqual(categoriesListQueryKey({ includeDeleted: true }, 'user_2'))
    expect(categoriesListQueryKey({ page: 1 }, 'user_1')).toEqual(
      categoriesListQueryKey({ page: 1 }, 'user_2'),
    )
  })
})

describe('useDeleteCategory', () => {
  const includeDeletedKey = categoriesListQueryKey({
    page: 2,
    limit: 10,
    search: 'bean',
    includeDeleted: true,
  })
  const liveKey = categoriesListQueryKey({ page: 1, limit: 10, search: '' })

  let client: QueryClient
  let invalidateSpy: jest.SpyInstance

  beforeEach(async () => {
    client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    client.setQueryData<ListCache>(includeDeletedKey, {
      categories: [catA, catB],
      meta,
    })
    client.setQueryData<ListCache>(liveKey, {
      categories: [catA, catB],
      meta,
    })
    invalidateSpy = jest
      .spyOn(client, 'invalidateQueries')
      .mockResolvedValue(undefined)

    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(() => useDeleteCategory(), { wrapper })
    await act(() => result.current.mutateAsync('cat-a'))
  })

  afterEach(() => {
    client.clear()
  })

  it('marks the row deleted in lists that include deleted rows', () => {
    const list = client.getQueryData<ListCache>(includeDeletedKey)

    expect(list?.categories).toHaveLength(2)
    expect(list?.categories[0]).toEqual({
      ...catA,
      deletedAt: expect.any(String),
    })
    expect(Number.isNaN(Date.parse(list?.categories[0].deletedAt ?? ''))).toBe(
      false,
    )
    expect(list?.categories[1]).toEqual(catB)
    expect(list?.meta?.totalCount).toBe(12)
  })

  it('removes the row from lists without deleted rows', () => {
    const list = client.getQueryData<ListCache>(liveKey)

    expect(list?.categories).toEqual([catB])
    expect(list?.meta?.totalCount).toBe(11)
  })

  it('still invalidates the category queries', () => {
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['categories'] })
  })
})

describe('useRestoreCategory', () => {
  const includeDeletedKey = categoriesListQueryKey({
    page: 2,
    limit: 10,
    search: 'bean',
    includeDeleted: true,
  })
  const liveKey = categoriesListQueryKey({ page: 1, limit: 10, search: '' })
  const deletedA = { ...catA, deletedAt: '2026-02-01T00:00:00.000Z' }

  let client: QueryClient
  let invalidateSpy: jest.SpyInstance

  const renderRestore = () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    return renderHook(() => useRestoreCategory(), { wrapper })
  }

  beforeEach(() => {
    client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    client.setQueryData<ListCache>(includeDeletedKey, {
      categories: [deletedA, catB],
      meta,
    })
    client.setQueryData<ListCache>(liveKey, {
      categories: [catA, catB],
      meta,
    })
    invalidateSpy = jest
      .spyOn(client, 'invalidateQueries')
      .mockResolvedValue(undefined)
    mockRestoreCategory.mockReset()
    mockRestoreCategory.mockResolvedValue({
      ok: true,
      category: { ...catA, deletedAt: null },
    })
  })

  afterEach(() => {
    client.clear()
  })

  it('clears deletedAt in lists that include deleted rows', async () => {
    const { result } = renderRestore()
    await act(() => result.current.mutateAsync('cat-a'))

    const list = client.getQueryData<ListCache>(includeDeletedKey)
    expect(list?.categories).toEqual([{ ...catA, deletedAt: null }, catB])
    expect(list?.meta).toEqual(meta)
  })

  it('leaves lists without deleted rows unchanged', async () => {
    const { result } = renderRestore()
    await act(() => result.current.mutateAsync('cat-a'))

    expect(client.getQueryData<ListCache>(liveKey)).toEqual({
      categories: [catA, catB],
      meta,
    })
  })

  it('invalidates the category queries', async () => {
    const { result } = renderRestore()
    await act(() => result.current.mutateAsync('cat-a'))

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['categories'] })
  })

  it('leaves the cache untouched when the restore fails', async () => {
    mockRestoreCategory.mockResolvedValue({
      ok: false,
      error: 'Only a deleted category can be restored.',
      status: 409,
    })
    const { result } = renderRestore()

    await act(async () => {
      await expect(result.current.mutateAsync('cat-a')).rejects.toThrow(
        'Only a deleted category can be restored.',
      )
    })

    const list = client.getQueryData<ListCache>(includeDeletedKey)
    expect(list?.categories[0].deletedAt).toBe('2026-02-01T00:00:00.000Z')
    expect(invalidateSpy).not.toHaveBeenCalled()
  })
})

const createdCategory = { id: 'cat-new', name: 'Espresso' } as Category

describe('useCreateCategory', () => {
  const mockCreate = jest.mocked(createCategory)
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

  it('useCreateCategory reuses the Idempotency-Key when the same values are retried', async () => {
    mockCreate
      .mockResolvedValueOnce({ ok: false, error: 'Network error' })
      .mockResolvedValueOnce({ ok: true, category: createdCategory })
    const { result } = renderWithClient(() => useCreateCategory())

    await act(async () => {
      await result.current
        .mutateAsync({ name: 'Espresso' })
        .catch(() => undefined)
    })
    let created: unknown
    await act(async () => {
      created = await result.current.mutateAsync({ name: 'Espresso' })
    })

    const [first, second] = keysSent()
    expect(first).toEqual(expect.any(String))
    expect(second).toBe(first)
    expect(created).toEqual(createdCategory)
  })

  it('useCreateCategory uses a new Idempotency-Key after a success', async () => {
    mockCreate.mockResolvedValue({ ok: true, category: createdCategory })
    const { result } = renderWithClient(() => useCreateCategory())

    await act(async () => {
      await result.current.mutateAsync({ name: 'Espresso' })
    })
    await act(async () => {
      await result.current.mutateAsync({ name: 'Espresso' })
    })

    const [first, second] = keysSent()
    expect(second).not.toBe(first)
  })

  it('useCreateCategory uses a new Idempotency-Key when the values change', async () => {
    mockCreate.mockResolvedValue({ ok: false, error: 'Network error' })
    const { result } = renderWithClient(() => useCreateCategory())

    await act(async () => {
      await result.current
        .mutateAsync({ name: 'Espresso' })
        .catch(() => undefined)
    })
    await act(async () => {
      await result.current.mutateAsync({ name: 'Latte' }).catch(() => undefined)
    })

    const [first, second] = keysSent()
    expect(second).not.toBe(first)
  })

  it('useCreateCategory retries an in-flight 409 with the same key and resolves with the record', async () => {
    jest.useFakeTimers()
    mockCreate
      .mockResolvedValueOnce(inFlight)
      .mockResolvedValueOnce({ ok: true, category: createdCategory })
    const { result } = renderWithClient(() => useCreateCategory())

    let created: unknown
    await act(async () => {
      const pending = result.current.mutateAsync({ name: 'Espresso' })
      await jest.advanceTimersByTimeAsync(IDEMPOTENCY.IN_FLIGHT_RETRY_MS)
      created = await pending
    })

    const [first, second] = keysSent()
    expect(keysSent()).toHaveLength(2)
    expect(second).toBe(first)
    expect(created).toEqual(createdCategory)
  })

  it('useCreateCategory keeps a name-exists 409 as an error', async () => {
    mockCreate.mockResolvedValue({
      ok: false,
      error: 'Name exists',
      status: 409,
      errorResponse: {
        statusCode: 409,
        message: 'Conflict',
        errors: [
          {
            errCode: 'categoryNameExists',
            field: 'name',
            message: 'Name exists',
          },
        ],
      },
    })
    const { result } = renderWithClient(() => useCreateCategory())

    let error: unknown
    await act(async () => {
      error = await result.current
        .mutateAsync({ name: 'Espresso' })
        .catch((e: unknown) => e)
    })

    expect(mockCreate).toHaveBeenCalledTimes(1)
    expect(error).toBeInstanceOf(ServiceError)
    expect((error as ServiceError).errors[0].errCode).toBe('categoryNameExists')
  })
})
