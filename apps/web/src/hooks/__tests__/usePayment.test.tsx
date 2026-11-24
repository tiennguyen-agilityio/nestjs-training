import type { ReactNode } from 'react'
import { renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuth } from '@clerk/nextjs'

import { CLERK_SESSION_TEMPLATE } from '@/constants/common'
import { ordersQueryKeys } from '@/hooks/useOrder'
import { useStartPayment } from '@/hooks/usePayment'
import { startPayment } from '@/services/payment'
import { ServiceError } from '@/utils/query'

jest.mock('@clerk/nextjs', () => ({ useAuth: jest.fn() }))
jest.mock('@/services/payment', () => ({ startPayment: jest.fn() }))

const mockStartPayment = jest.mocked(startPayment)
const clerkGetToken = jest.fn().mockResolvedValue('clerk-token')

const checkout = {
  paymentId: 'p-1',
  checkoutUrl: 'https://checkout.stripe.com/c/s',
  expiresAt: '2026-11-25T00:00:00.000Z',
}

const setup = () => {
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
  const view = renderHook(() => useStartPayment(), { wrapper })
  return { ...view, invalidate }
}

describe('useStartPayment', () => {
  it('useStartPayment calls startPayment with the order id and the session token getter and invalidates the orders root', async () => {
    mockStartPayment.mockResolvedValue({ ok: true, checkout })
    const { result, invalidate } = setup()

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
    const { result } = setup()

    const error = await result.current.mutateAsync('o-1').catch((e) => e)

    expect(error).toBeInstanceOf(ServiceError)
    expect((error as ServiceError).errors[0].errCode).toBe('paymentNotPayable')
  })
})
