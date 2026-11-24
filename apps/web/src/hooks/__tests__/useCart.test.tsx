import type { ReactNode } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuth } from '@clerk/nextjs'
import { ProductStatus } from '@repo/constants'

import { CLERK_SESSION_TEMPLATE } from '@/constants/common'
import { EMPTY_IMAGE } from '@/constants/images'
import { API_FALLBACK_ERRORS } from '@/constants/messages'
import { cartQueryKeys, useCart } from '@/hooks/useCart'
import {
  addCartItem,
  fetchCart,
  removeCartItem,
  updateCartItem,
} from '@/services/cart'
import { useCartStore } from '@/store/useCartStore'
import type { CartAddItemInput, ServerCart } from '@/types/cart'

jest.mock('@clerk/nextjs', () => ({ useAuth: jest.fn() }))

jest.mock('@/services/cart', () => ({
  addCartItem: jest.fn(),
  fetchCart: jest.fn(),
  mergeCart: jest.fn(),
  removeCartItem: jest.fn(),
  updateCartItem: jest.fn(),
}))

const mockUseAuth = jest.mocked(useAuth)
const mockFetchCart = jest.mocked(fetchCart)
const mockAddCartItem = jest.mocked(addCartItem)
const mockUpdateCartItem = jest.mocked(updateCartItem)
const mockRemoveCartItem = jest.mocked(removeCartItem)
const getToken = jest.fn(async () => 'tok')

const emptyCart: ServerCart = {
  id: null,
  userId: 'user_1',
  items: [],
  totalQuantity: 0,
  subTotal: 0,
  createdAt: null,
  updatedAt: null,
}

const cartWith = (quantity: number): ServerCart => ({
  ...emptyCart,
  id: 'cart-1',
  items: [
    {
      id: 'line-1',
      productVariantId: 'v1',
      quantity,
      product: {
        id: 'p1',
        name: 'Colombia Huila',
        slug: 'colombia-huila',
        status: ProductStatus.ACTIVE,
        primaryImageUrl: null,
      },
      variant: {
        sku: 'COL-250G',
        sizeName: '250g',
        price: 14,
        discountType: null,
        discountValue: 0,
        salePrice: 14,
        availableQuantity: 5,
      },
      inStock: true,
      isAvailable: true,
      lineTotal: 14 * quantity,
      createdAt: '2026-11-24T00:00:00.000Z',
      updatedAt: '2026-11-24T00:00:00.000Z',
    },
  ],
  totalQuantity: quantity,
  subTotal: 14 * quantity,
})

const input: CartAddItemInput = {
  variantId: 'v1',
  productId: 'p1',
  name: 'Colombia Huila',
  meta: 'Medium',
  imageUrl: EMPTY_IMAGE,
  unitPrice: 14,
  quantity: 2,
  maxQuantity: 5,
}

const signedIn = () =>
  mockUseAuth.mockReturnValue({
    isLoaded: true,
    isSignedIn: true,
    userId: 'user_1',
    getToken,
  } as unknown as ReturnType<typeof useAuth>)

const signedOut = () =>
  mockUseAuth.mockReturnValue({
    isLoaded: true,
    isSignedIn: false,
    userId: null,
    getToken,
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

describe('useCart', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    useCartStore.setState({
      items: [],
      hasHydrated: true,
      isLoading: false,
      isError: false,
      errorMessage: null,
      isMerging: false,
    })
  })

  it('guest: reads and changes the browser store', async () => {
    signedOut()
    const { wrapper } = setup()
    const { result } = renderHook(() => useCart(), { wrapper })

    await act(async () => {
      expect(await result.current.addItem(input)).toEqual({ ok: true })
    })

    expect(result.current.isServerCart).toBe(false)
    expect(result.current.items).toHaveLength(1)
    expect(result.current.itemCount).toBe(2)
    expect(mockFetchCart).not.toHaveBeenCalled()
    expect(mockAddCartItem).not.toHaveBeenCalled()
  })

  it('signed in: reads the server cart and maps its lines', async () => {
    signedIn()
    mockFetchCart.mockResolvedValue({ ok: true, cart: cartWith(2) })
    const { queryClient, wrapper } = setup()
    const { result } = renderHook(() => useCart(), { wrapper })

    await waitFor(() => expect(result.current.items).toHaveLength(1))

    expect(cartQueryKeys.detail('user_1')).toEqual(['cart', 'user_1'])
    expect(queryClient.getQueryData(['cart', 'user_1'])).toEqual(cartWith(2))
    expect(result.current.isServerCart).toBe(true)
    expect(result.current.items[0]).toMatchObject({
      id: 'line-1',
      variantId: 'v1',
      unitPrice: 14,
      quantity: 2,
    })
    const options = mockFetchCart.mock.calls[0]?.[0]
    await options?.getToken?.()
    expect(getToken).toHaveBeenCalledWith({ template: CLERK_SESSION_TEMPLATE })
  })

  it('signed in: addItem posts with an Idempotency-Key and updates the cart', async () => {
    signedIn()
    mockFetchCart
      .mockResolvedValueOnce({ ok: true, cart: emptyCart })
      .mockResolvedValue({ ok: true, cart: cartWith(2) })
    mockAddCartItem.mockResolvedValue({ ok: true, cart: cartWith(2) })
    const { queryClient, wrapper } = setup()
    const { result } = renderHook(() => useCart(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      expect(await result.current.addItem(input)).toEqual({ ok: true })
    })

    expect(mockAddCartItem).toHaveBeenCalledWith(
      { productVariantId: 'v1', quantity: 2 },
      expect.objectContaining({ idempotencyKey: expect.any(String) }),
    )
    expect(queryClient.getQueryData(['cart', 'user_1'])).toEqual(cartWith(2))
    await waitFor(() => expect(result.current.itemCount).toBe(2))
  })

  it('signed in: returns the API error on a failed add', async () => {
    signedIn()
    mockFetchCart.mockResolvedValue({ ok: true, cart: emptyCart })
    mockAddCartItem.mockResolvedValue({
      ok: false,
      error: 'Only 3 left for this variant',
      status: 409,
    })
    const { wrapper } = setup()
    const { result } = renderHook(() => useCart(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    let outcome: unknown
    await act(async () => {
      outcome = await result.current.addItem(input)
    })

    expect(outcome).toEqual({
      ok: false,
      error: 'Only 3 left for this variant',
    })
  })

  it('signed in: changeQuantity patches the line', async () => {
    signedIn()
    // The write invalidates ['cart'], so the next read returns the new cart.
    mockFetchCart
      .mockResolvedValueOnce({ ok: true, cart: cartWith(2) })
      .mockResolvedValue({ ok: true, cart: cartWith(3) })
    mockUpdateCartItem.mockResolvedValue({ ok: true, cart: cartWith(3) })
    const { queryClient, wrapper } = setup()
    const { result } = renderHook(() => useCart(), { wrapper })
    await waitFor(() => expect(result.current.items).toHaveLength(1))

    await act(async () => {
      await result.current.changeQuantity('line-1', 3)
    })

    expect(mockUpdateCartItem).toHaveBeenCalledWith(
      'line-1',
      { quantity: 3 },
      expect.objectContaining({ getToken: expect.any(Function) }),
    )
    expect(queryClient.getQueryData(['cart', 'user_1'])).toEqual(cartWith(3))
  })

  it('signed in: removeItem refetches the cart', async () => {
    signedIn()
    mockFetchCart
      .mockResolvedValueOnce({ ok: true, cart: cartWith(2) })
      .mockResolvedValue({ ok: true, cart: emptyCart })
    mockRemoveCartItem.mockResolvedValue({ ok: true })
    const { wrapper } = setup()
    const { result } = renderHook(() => useCart(), { wrapper })
    await waitFor(() => expect(result.current.items).toHaveLength(1))

    await act(async () => {
      await result.current.removeItem('line-1')
    })

    expect(mockRemoveCartItem).toHaveBeenCalledWith(
      'line-1',
      expect.objectContaining({ getToken: expect.any(Function) }),
    )
    await waitFor(() => expect(result.current.items).toHaveLength(0))
    expect(mockFetchCart).toHaveBeenCalledTimes(2)
  })

  it('signed in: shows the load error message', async () => {
    signedIn()
    mockFetchCart.mockResolvedValue({
      ok: false,
      error: API_FALLBACK_ERRORS.CART_LOAD,
    })
    const { wrapper } = setup()
    const { result } = renderHook(() => useCart(), { wrapper })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.errorMessage).toBe(API_FALLBACK_ERRORS.CART_LOAD)
  })

  it('signed out: removes the cached server cart', async () => {
    signedIn()
    mockFetchCart.mockResolvedValue({ ok: true, cart: cartWith(2) })
    const { queryClient, wrapper } = setup()
    const { result, rerender } = renderHook(() => useCart(), { wrapper })
    await waitFor(() => expect(result.current.items).toHaveLength(1))

    signedOut()
    rerender()

    await waitFor(() =>
      expect(queryClient.getQueryData(['cart', 'user_1'])).toBeUndefined(),
    )
    expect(result.current.isServerCart).toBe(false)
  })

  it('signed in: cancels an older cart read before writing the new cart', async () => {
    signedIn()
    mockFetchCart.mockResolvedValue({ ok: true, cart: cartWith(2) })
    mockUpdateCartItem.mockResolvedValue({ ok: true, cart: cartWith(3) })
    const { queryClient, wrapper } = setup()
    const cancel = jest.spyOn(queryClient, 'cancelQueries')
    const write = jest.spyOn(queryClient, 'setQueryData')
    const { result } = renderHook(() => useCart(), { wrapper })
    await waitFor(() => expect(result.current.items).toHaveLength(1))

    await act(async () => {
      await result.current.changeQuantity('line-1', 3)
    })

    expect(cancel).toHaveBeenCalledWith({ queryKey: ['cart'] })
    expect(cancel.mock.invocationCallOrder[0]).toBeLessThan(
      write.mock.invocationCallOrder[0] ?? 0,
    )
  })
})
