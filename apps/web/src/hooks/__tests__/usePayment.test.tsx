import type { ReactNode } from 'react'
import { renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuth } from '@clerk/nextjs'
import { OrderPaymentStatus } from '@repo/constants'

import { CLERK_SESSION_TEMPLATE } from '@/constants/common'
import { ordersQueryKeys } from '@/hooks/useOrder'
import { useCapturePayment, useStartPayment } from '@/hooks/usePayment'
import { capturePayment, startPayment } from '@/services/payment'
import { ServiceError } from '@/utils/query'

jest.mock('@clerk/nextjs', () => ({ useAuth: jest.fn() }))
jest.mock('@/services/payment', () => ({
  capturePayment: jest.fn(),
  startPayment: jest.fn(),
}))

const mockStartPayment = jest.mocked(startPayment)
const mockCapturePayment = jest.mocked(capturePayment)
const clerkGetToken = jest.fn().mockResolvedValue('clerk-token')

const checkout = {
  paymentId: 'p-1',
  checkoutId: 'cs_1',
  checkoutUrl: 'https://checkout.stripe.com/c/s',
  expiresAt: '2026-11-25T00:00:00.000Z',
}

const setup = <T,>(hook: () => T) => {
  jest.mocked(useAuth).mockReturnValue({
    getToken: clerkGetToken,
  } as unknown as ReturnType<typeof useAuth>)
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const invalidate = jest.spyOn(client, 'invalidateQueries')
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  const view = renderHook(hook, { wrapper })
  return { ...view, invalidate }
}

describe('useStartPayment', () => {
  it('useStartPayment calls startPayment with the order id and the session token getter and invalidates the orders root', async () => {
    mockStartPayment.mockResolvedValue({ ok: true, checkout })
    const { result, invalidate } = setup(useStartPayment)

    await expect(result.current.mutateAsync('o-1')).resolves.toEqual(checkout)

    expect(mockStartPayment).toHaveBeenCalledWith('o-1', expect.any(Object))
    const options = mockStartPayment.mock.calls[0][1]
    await expect(options.getToken?.()).resolves.toBe('clerk-token')
    expect(clerkGetToken).toHaveBeenCalledWith({
      template: CLERK_SESSION_TEMPLATE,
    })
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ordersQueryKeys.root,
    })
  })

  it('useStartPayment throws a ServiceError carrying the API errors', async () => {
    mockStartPayment.mockResolvedValue({
      ok: false,
      error: 'x',
      status: 400,
      errorResponse: {
        statusCode: 400,
        message: 'x',
        errors: [
          {
            errCode: 'paymentNotPayable',
            field: 'id',
            message: 'x',
            description: 'y',
          },
        ],
      },
    })
    const { result } = setup(useStartPayment)

    const error = await result.current.mutateAsync('o-1').catch((e) => e)

    expect(error).toBeInstanceOf(ServiceError)
    expect((error as ServiceError).errors[0].errCode).toBe('paymentNotPayable')
  })
})

describe('useCapturePayment', () => {
  const capture = {
    paymentId: 'p-1',
    paymentStatus: OrderPaymentStatus.PAID,
    failureReason: null,
    retryable: false,
  }

  it('useCapturePayment calls capturePayment with the session token getter and invalidates the orders root', async () => {
    mockCapturePayment.mockResolvedValue({ ok: true, capture })
    const { result, invalidate } = setup(useCapturePayment)

    await expect(result.current.mutateAsync('o-1')).resolves.toEqual(capture)

    expect(mockCapturePayment).toHaveBeenCalledWith('o-1', expect.any(Object))
    const options = mockCapturePayment.mock.calls[0][1]
    await expect(options.getToken?.()).resolves.toBe('clerk-token')
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ordersQueryKeys.root,
    })
  })

  it('useCapturePayment throws a ServiceError with the error text', async () => {
    mockCapturePayment.mockResolvedValue({ ok: false, error: 'Capture failed' })
    const { result } = setup(useCapturePayment)

    const error = await result.current.mutateAsync('o-1').catch((e) => e)

    expect(error).toBeInstanceOf(ServiceError)
    expect((error as ServiceError).message).toBe('Capture failed')
  })
})
