import { act, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { PaymentMethod } from '@repo/constants'
import type { PlaceOrderPayload } from '@repo/schemas'

import { ordersQueryKeys, useCreateOrder } from '@/hooks/useOrder'
import { createOrder } from '@/services/order'
import type { PlacedOrder } from '@/types/order'
import { ServiceError } from '@/utils/query'

jest.mock('@/services/order', () => ({
  createOrder: jest.fn(),
  deleteOrder: jest.fn(),
  fetchOrders: jest.fn(),
  updateOrderShippingStatus: jest.fn(),
  updateOrderStatus: jest.fn(),
}))

const mockCreateOrder = jest.mocked(createOrder)

const body: PlaceOrderPayload = {
  shippingMethodId: '0b0b5b8e-8b0e-4f43-9a55-3c2a1f1d0a01',
  paymentMethod: PaymentMethod.COD,
  recipientName: 'Ada Lovelace',
  recipientPhone: '0912345678',
  addressLine: '1 Analytical St',
  ward: 'Ward 1',
  district: 'Marylebone',
  city: 'London',
  postalCode: 'NW1',
}

const order = { id: 'order-1', orderNumber: 'NB-000123' } as PlacedOrder
const getToken = async () => 'session-token'

const outOfStock = {
  ok: false as const,
  status: 400,
  error: 'Validation failed',
  errorResponse: {
    statusCode: 400,
    message: 'Validation failed',
    errors: [
      {
        errCode: 'outOfStock',
        field: 'items.0.productVariantId',
        message: 'Only 1 left',
        description: 'Update your cart and try again.',
      },
    ],
  },
}

const setup = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const invalidate = jest.spyOn(client, 'invalidateQueries')
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  const view = renderHook(() => useCreateOrder(), { wrapper })
  return { ...view, invalidate }
}

const keyOfCall = (n: number) =>
  mockCreateOrder.mock.calls[n]?.[1].idempotencyKey

describe('useCreateOrder', () => {
  beforeEach(() => mockCreateOrder.mockReset())

  it('useCreateOrder reuses the key for the same body and invalidates the orders root', async () => {
    mockCreateOrder
      .mockResolvedValueOnce({ ok: false, error: 'Network error' })
      .mockResolvedValueOnce({ ok: true, order })
      .mockResolvedValueOnce({ ok: true, order })
    const { result, invalidate } = setup()

    await act(async () => {
      await result.current.mutateAsync({ body, getToken }).catch(() => null)
    })
    await act(async () => {
      await result.current.mutateAsync({ body, getToken })
    })
    expect(keyOfCall(0)).toEqual(expect.any(String))
    expect(keyOfCall(1)).toBe(keyOfCall(0))
    expect(mockCreateOrder.mock.calls[1]?.[1].getToken).toBe(getToken)
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ordersQueryKeys.root })
    expect(ordersQueryKeys.root).toEqual(['orders'])

    await act(async () => {
      await result.current.mutateAsync({ body, getToken })
    })
    expect(keyOfCall(2)).not.toBe(keyOfCall(1))
  })

  it('sends a new key when the body changes', async () => {
    mockCreateOrder.mockResolvedValue({ ok: false, error: 'Network error' })
    const { result } = setup()

    await act(async () => {
      await result.current.mutateAsync({ body, getToken }).catch(() => null)
    })
    await act(async () => {
      await result.current
        .mutateAsync({ body: { ...body, ward: 'Ward 2' }, getToken })
        .catch(() => null)
    })
    expect(keyOfCall(1)).not.toBe(keyOfCall(0))
  })

  it('throws a ServiceError carrying the API errors', async () => {
    mockCreateOrder.mockResolvedValue(outOfStock)
    const { result } = setup()

    let caught: unknown
    await act(async () => {
      caught = await result.current
        .mutateAsync({ body, getToken })
        .catch((error: unknown) => error)
    })

    expect(caught).toBeInstanceOf(ServiceError)
    expect((caught as ServiceError).errors[0]?.errCode).toBe('outOfStock')
  })
})
