import type { ReactNode } from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuth } from '@clerk/nextjs'
import { toast } from 'sonner'
import { ProductStatus, VALIDATION_RULES } from '@repo/constants'

import { EMPTY_IMAGE } from '@/constants/images'
import {
  API_FALLBACK_ERRORS,
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
} from '@/constants/messages'
import { useCartMerge } from '@/hooks/useCartMerge'
import { mergeCart } from '@/services/cart'
import { useCartStore } from '@/store/useCartStore'
import type { CartItem, MergedServerCart } from '@/types/cart'

jest.mock('@clerk/nextjs', () => ({ useAuth: jest.fn() }))
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))
jest.mock('@/services/cart', () => ({
  addCartItem: jest.fn(),
  fetchCart: jest.fn(),
  mergeCart: jest.fn(),
  removeCartItem: jest.fn(),
  updateCartItem: jest.fn(),
}))

const mockUseAuth = jest.mocked(useAuth)
const mockMergeCart = jest.mocked(mergeCart)
const mockToast = jest.mocked(toast)

const line = (n: number, quantity = 2): CartItem => ({
  id: `v${n}`,
  variantId: `v${n}`,
  productId: `p${n}`,
  name: n === 1 ? 'Colombia Huila' : `Coffee ${n}`,
  meta: 'Medium',
  imageUrl: EMPTY_IMAGE,
  unitPrice: 14,
  quantity,
  maxQuantity: 10,
})

const merged = (
  adjusted: MergedServerCart['adjusted'] = [],
): MergedServerCart => ({
  id: 'cart-1',
  userId: 'user_1',
  items: [],
  totalQuantity: 0,
  subTotal: 0,
  createdAt: null,
  updatedAt: null,
  adjusted,
})

const serverItem = (
  variantId: string,
  availableQuantity: number,
): MergedServerCart['items'][number] => ({
  id: `line-${variantId}`,
  productVariantId: variantId,
  quantity: availableQuantity,
  product: {
    id: 'p1',
    name: 'Colombia Huila',
    slug: 'colombia-huila',
    status: ProductStatus.ACTIVE,
    primaryImageUrl: null,
  },
  variant: {
    sku: 'SKU',
    sizeName: '250g',
    price: 14,
    discountType: null,
    discountValue: 0,
    salePrice: 14,
    availableQuantity,
  },
  inStock: true,
  isAvailable: true,
  lineTotal: 14 * availableQuantity,
  createdAt: '2026-11-24T00:00:00.000Z',
  updatedAt: '2026-11-24T00:00:00.000Z',
})

const auth = (signedIn: boolean) =>
  mockUseAuth.mockReturnValue({
    isLoaded: true,
    isSignedIn: signedIn,
    userId: signedIn ? 'user_1' : null,
    getToken: jest.fn(async () => 'tok'),
  } as unknown as ReturnType<typeof useAuth>)

const setup = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return { queryClient, wrapper }
}

describe('useCartMerge', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    localStorage.clear()
    useCartStore.setState({
      items: [line(1)],
      hasHydrated: true,
      mergeKeys: null,
      mergeNotice: null,
      isMerging: false,
    })
  })

  it('sends nothing for an empty browser cart', async () => {
    auth(true)
    useCartStore.setState({ items: [] })
    const { wrapper } = setup()

    renderHook(() => useCartMerge(), { wrapper })

    await waitFor(() => expect(useCartStore.getState().isMerging).toBe(false))
    expect(mockMergeCart).not.toHaveBeenCalled()
  })

  it('waits for the store to hydrate and for sign-in', () => {
    const { wrapper } = setup()
    auth(true)
    useCartStore.setState({ hasHydrated: false })
    renderHook(() => useCartMerge(), { wrapper })

    auth(false)
    useCartStore.setState({ hasHydrated: true })
    renderHook(() => useCartMerge(), { wrapper })

    expect(mockMergeCart).not.toHaveBeenCalled()
  })

  it('merges the browser cart once after sign-in and clears it', async () => {
    auth(true)
    mockMergeCart.mockResolvedValue({ ok: true, cart: merged() })
    const { queryClient, wrapper } = setup()

    const { rerender } = renderHook(() => useCartMerge(), { wrapper })
    rerender()

    await waitFor(() => expect(useCartStore.getState().items).toEqual([]))
    expect(mockMergeCart).toHaveBeenCalledTimes(1)
    expect(mockMergeCart).toHaveBeenCalledWith(
      { items: [{ productVariantId: 'v1', quantity: 2 }] },
      expect.objectContaining({ idempotencyKey: expect.any(String) }),
    )
    expect(useCartStore.getState().mergeKeys).toBeNull()
    expect(queryClient.getQueryData(['cart', 'user_1'])).toMatchObject({
      id: 'cart-1',
    })
    expect(mockToast.success).toHaveBeenCalledWith(
      SUCCESS_MESSAGES.CART_MERGED(1),
    )
  })

  it('sets the merge notice from adjusted', async () => {
    auth(true)
    useCartStore.setState({ items: [line(1), line(2)] })
    mockMergeCart.mockResolvedValue({
      ok: true,
      cart: {
        ...merged([
          { productVariantId: 'v1', requestedQuantity: 2, quantity: 1 },
          { productVariantId: 'v2', requestedQuantity: 2, quantity: 0 },
        ]),
        items: [serverItem('v1', 3)],
      },
    })
    const { wrapper } = setup()

    renderHook(() => useCartMerge(), { wrapper })

    await waitFor(() =>
      expect(useCartStore.getState().mergeNotice).toBe(
        `${ERROR_MESSAGES.CART_MERGE_ADJUSTED}${ERROR_MESSAGES.CART_MERGE_LOWERED('Colombia Huila', 3)}, ${ERROR_MESSAGES.CART_MERGE_SKIPPED('Coffee 2')}.`,
      ),
    )
    expect(mockToast.success).toHaveBeenCalledWith(
      SUCCESS_MESSAGES.CART_MERGED(1),
    )
  })

  it('keeps the browser cart and key on an error', async () => {
    auth(true)
    mockMergeCart.mockResolvedValue({
      ok: false,
      error: API_FALLBACK_ERRORS.CART_MERGE,
    })
    const { wrapper } = setup()

    renderHook(() => useCartMerge(), { wrapper })

    await waitFor(() =>
      expect(mockToast.error).toHaveBeenCalledWith(
        API_FALLBACK_ERRORS.CART_MERGE,
      ),
    )
    await waitFor(() => expect(useCartStore.getState().isMerging).toBe(false))
    expect(useCartStore.getState().items).toHaveLength(1)
    expect(Object.keys(useCartStore.getState().mergeKeys ?? {})).toHaveLength(1)
  })

  it('sends the same key on a resend', async () => {
    auth(true)
    mockMergeCart
      .mockResolvedValueOnce({
        ok: false,
        error: API_FALLBACK_ERRORS.CART_MERGE,
      })
      .mockResolvedValue({ ok: true, cart: merged() })
    const { wrapper } = setup()

    const first = renderHook(() => useCartMerge(), { wrapper })
    await waitFor(() => expect(mockToast.error).toHaveBeenCalled())
    await waitFor(() => expect(useCartStore.getState().isMerging).toBe(false))
    first.unmount()

    renderHook(() => useCartMerge(), { wrapper })
    await waitFor(() => expect(useCartStore.getState().items).toEqual([]))

    const keys = mockMergeCart.mock.calls.map(
      ([, options]) => options.idempotencyKey,
    )
    expect(keys).toHaveLength(2)
    expect(keys[1]).toBe(keys[0])
  })

  it('splits more than MAX_ITEMS lines into several requests', async () => {
    auth(true)
    const max = VALIDATION_RULES.CART_MERGE.MAX_ITEMS
    useCartStore.setState({
      items: Array.from({ length: max + 1 }, (_, i) => line(i + 1, 1)),
    })
    mockMergeCart.mockResolvedValue({ ok: true, cart: merged() })
    const { wrapper } = setup()

    renderHook(() => useCartMerge(), { wrapper })

    await waitFor(() => expect(useCartStore.getState().items).toEqual([]))
    expect(mockMergeCart).toHaveBeenCalledTimes(2)
    const [firstCall, secondCall] = mockMergeCart.mock.calls
    expect(firstCall?.[0].items).toHaveLength(max)
    expect(secondCall?.[0].items).toHaveLength(1)
    expect(firstCall?.[1].idempotencyKey).not.toBe(
      secondCall?.[1].idempotencyKey,
    )
    expect(mockToast.success).toHaveBeenCalledWith(
      SUCCESS_MESSAGES.CART_MERGED(max + 1),
    )
  })

  it('keeps only the lines whose chunk failed', async () => {
    auth(true)
    const max = VALIDATION_RULES.CART_MERGE.MAX_ITEMS
    useCartStore.setState({
      items: Array.from({ length: max + 1 }, (_, i) => line(i + 1, 1)),
    })
    mockMergeCart
      .mockResolvedValueOnce({ ok: true, cart: merged() })
      .mockResolvedValueOnce({
        ok: false,
        error: API_FALLBACK_ERRORS.CART_MERGE,
      })
    const { wrapper } = setup()

    renderHook(() => useCartMerge(), { wrapper })

    await waitFor(() => expect(mockToast.error).toHaveBeenCalled())
    await waitFor(() => expect(useCartStore.getState().isMerging).toBe(false))
    expect(useCartStore.getState().items.map((item) => item.variantId)).toEqual(
      [`v${max + 1}`],
    )
  })

  it('reuses the key another tab saved for the same cart', async () => {
    auth(true)
    const chunk = { items: [{ productVariantId: 'v1', quantity: 2 }] }
    localStorage.setItem(
      'coffeehub-cart',
      JSON.stringify({
        state: {
          items: [line(1)],
          itemSnapshots: null,
          mergeKeys: { [JSON.stringify(chunk)]: 'tab-a-key' },
        },
        version: 0,
      }),
    )
    mockMergeCart.mockResolvedValue({ ok: true, cart: merged() })
    const { wrapper } = setup()

    renderHook(() => useCartMerge(), { wrapper })

    await waitFor(() => expect(mockMergeCart).toHaveBeenCalled())
    expect(mockMergeCart.mock.calls[0]?.[1].idempotencyKey).toBe('tab-a-key')
  })

  it('sends nothing when another tab already merged the cart', async () => {
    auth(true)
    localStorage.setItem(
      'coffeehub-cart',
      JSON.stringify({
        state: { items: [], itemSnapshots: null, mergeKeys: null },
        version: 0,
      }),
    )
    const { wrapper } = setup()

    renderHook(() => useCartMerge(), { wrapper })

    await waitFor(() => expect(useCartStore.getState().items).toEqual([]))
    await waitFor(() => expect(useCartStore.getState().isMerging).toBe(false))
    expect(mockMergeCart).not.toHaveBeenCalled()
  })

  it('still shows the merged chunks when a later chunk fails', async () => {
    auth(true)
    const max = VALIDATION_RULES.CART_MERGE.MAX_ITEMS
    useCartStore.setState({
      items: Array.from({ length: max + 1 }, (_, i) => line(i + 1, 1)),
    })
    const firstCart = {
      ...merged([
        { productVariantId: 'v1', requestedQuantity: 1, quantity: 0 },
      ]),
      id: 'cart-after-chunk-1',
      items: [serverItem('v1', 1)],
    }
    mockMergeCart
      .mockResolvedValueOnce({ ok: true, cart: firstCart })
      .mockResolvedValueOnce({
        ok: false,
        error: API_FALLBACK_ERRORS.CART_MERGE,
      })
    const { queryClient, wrapper } = setup()

    renderHook(() => useCartMerge(), { wrapper })

    await waitFor(() => expect(useCartStore.getState().isMerging).toBe(false))
    expect(queryClient.getQueryData(['cart', 'user_1'])).toMatchObject({
      id: 'cart-after-chunk-1',
    })
    expect(useCartStore.getState().mergeNotice).toBe(
      `${ERROR_MESSAGES.CART_MERGE_ADJUSTED}${ERROR_MESSAGES.CART_MERGE_LOWERED('Colombia Huila', 1)}.`,
    )
  })

  it('runs the merge under a cross-tab lock when the browser has one', async () => {
    auth(true)
    const request = jest.fn(
      async (_name: string, callback: () => Promise<void>) => callback(),
    )
    Object.defineProperty(navigator, 'locks', {
      value: { request },
      configurable: true,
    })
    mockMergeCart.mockResolvedValue({ ok: true, cart: merged() })
    const { wrapper } = setup()

    renderHook(() => useCartMerge(), { wrapper })

    await waitFor(() => expect(mockMergeCart).toHaveBeenCalled())
    expect(request).toHaveBeenCalledWith(
      'coffeehub-cart-merge',
      expect.any(Function),
    )
    Reflect.deleteProperty(navigator, 'locks')
  })

  it('shows an error and keeps the merged chunks when a request throws', async () => {
    auth(true)
    const max = VALIDATION_RULES.CART_MERGE.MAX_ITEMS
    useCartStore.setState({
      items: Array.from({ length: max + 1 }, (_, i) => line(i + 1, 1)),
    })
    mockMergeCart
      .mockResolvedValueOnce({
        ok: true,
        cart: { ...merged(), id: 'cart-after-chunk-1' },
      })
      .mockRejectedValueOnce(new Error('token failed'))
    const { queryClient, wrapper } = setup()

    renderHook(() => useCartMerge(), { wrapper })

    await waitFor(() =>
      expect(mockToast.error).toHaveBeenCalledWith(
        API_FALLBACK_ERRORS.CART_MERGE,
      ),
    )
    await waitFor(() => expect(useCartStore.getState().isMerging).toBe(false))
    expect(queryClient.getQueryData(['cart', 'user_1'])).toMatchObject({
      id: 'cart-after-chunk-1',
    })
    expect(useCartStore.getState().items).toHaveLength(1)
  })
})
