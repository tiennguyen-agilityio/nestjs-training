import { API_FALLBACK_ERRORS } from '@/constants/messages'
import { API_ROUTES } from '@/constants/routes'
import { startPayment } from '@/services/payment'

const checkout = {
  paymentId: 'p-1',
  checkoutUrl: 'https://checkout.stripe.com/c/s',
  expiresAt: '2026-11-25T00:00:00.000Z',
}

const mockResponse = (status: number, json: unknown) =>
  jest.fn().mockResolvedValue({
    ok: status < 400,
    status,
    json: async () => json,
  })

describe('startPayment', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it("startPayment posts to the order's payments URL with credentials and the token", async () => {
    const fetchMock = mockResponse(200, {
      statusCode: 200,
      message: 'OK',
      data: checkout,
    })
    globalThis.fetch = fetchMock as typeof fetch

    const result = await startPayment('o-1', {
      getToken: async () => 'tok',
    })

    expect(fetchMock).toHaveBeenCalledWith(
      `${API_ROUTES.ORDERS}/o-1/payments`,
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    )
    const init: RequestInit = fetchMock.mock.calls[0][1]
    expect((init.headers as Headers).get('Authorization')).toBe('Bearer tok')
    expect(result).toEqual({ ok: true, checkout })
  })

  it('startPayment returns the API errors on a 400', async () => {
    const errorResponse = {
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
    }
    globalThis.fetch = mockResponse(400, errorResponse) as typeof fetch

    const result = await startPayment('o-1', {
      getToken: async () => 'tok',
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(400)
      expect(result.errorResponse?.errors?.[0]?.errCode).toBe(
        'paymentNotPayable',
      )
    }
  })

  it('startPayment returns PAYMENT_START on a network failure', async () => {
    globalThis.fetch = jest
      .fn()
      .mockRejectedValue(new TypeError('Failed to fetch')) as typeof fetch

    const result = await startPayment('o-1', {
      getToken: async () => 'tok',
    })

    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        error: API_FALLBACK_ERRORS.PAYMENT_START,
      }),
    )
    if (!result.ok) expect(result.status).toBeUndefined()
  })
})
