import { act, renderHook } from '@testing-library/react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { OrderPaymentStatus } from '@repo/constants'

import {
  API_FALLBACK_ERRORS,
  ERROR_MESSAGES,
  NOTICE_MESSAGES,
  SUCCESS_MESSAGES,
} from '@/constants/messages'
import { orderSuccessPath } from '@/constants/routes'
import { useCapturePayment, useStartPayment } from '@/hooks/usePayment'
import { usePayPalCheckout } from '@/hooks/usePayPalCheckout'
import type { PaymentCapture, PlacedOrder } from '@/types/order'
import { ServiceError } from '@/utils/query'

jest.mock('next/navigation', () => ({ useRouter: jest.fn() }))
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))
jest.mock('@/hooks/usePayment', () => ({
  useCapturePayment: jest.fn(),
  useStartPayment: jest.fn(),
}))

const order = { id: 'order-1', orderNumber: 'CH-1' } as PlacedOrder
const push = jest.fn()
const startPayment = jest.fn()
const capturePayment = jest.fn()

const captured = (overrides: Partial<PaymentCapture> = {}): PaymentCapture => ({
  paymentId: 'payment-1',
  paymentStatus: OrderPaymentStatus.PAID,
  failureReason: null,
  retryable: false,
  ...overrides,
})

const setup = (placeOrder = jest.fn().mockResolvedValue(order)) => {
  const view = renderHook(() => usePayPalCheckout({ placeOrder }))
  return { ...view, placeOrder }
}

describe('usePayPalCheckout', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.mocked(useRouter).mockReturnValue({ push } as never)
    jest.mocked(useStartPayment).mockReturnValue({
      mutateAsync: startPayment,
    } as never)
    jest.mocked(useCapturePayment).mockReturnValue({
      mutateAsync: capturePayment,
    } as never)
    startPayment.mockResolvedValue({
      paymentId: 'payment-1',
      checkoutId: 'PP-ORDER-1',
      checkoutUrl:
        'https://www.sandbox.paypal.com/checkoutnow?token=PP-ORDER-1',
      expiresAt: '2026-11-25T09:00:00.000Z',
    })
  })

  it('createOrder places the order only once', async () => {
    const { result, placeOrder } = setup()

    let first: { orderId: string } | undefined
    let second: { orderId: string } | undefined
    await act(async () => {
      first = await result.current.createPayPalOrder()
    })
    await act(async () => {
      second = await result.current.createPayPalOrder()
    })

    expect(placeOrder).toHaveBeenCalledTimes(1)
    expect(startPayment).toHaveBeenCalledTimes(2)
    expect(startPayment).toHaveBeenCalledWith('order-1')
    expect(first).toEqual({ orderId: 'PP-ORDER-1' })
    expect(second).toEqual({ orderId: 'PP-ORDER-1' })
    expect(result.current.placedOrder).toBe(order)
  })

  it('rejects when placeOrder returns null and starts no payment', async () => {
    const { result } = setup(jest.fn().mockResolvedValue(null))

    await act(async () => {
      await expect(result.current.createPayPalOrder()).rejects.toThrow()
    })

    expect(startPayment).not.toHaveBeenCalled()
    expect(result.current.placedOrder).toBeNull()
  })

  it('an order the form or the API refused shows no PayPal error', async () => {
    const { result } = setup(jest.fn().mockResolvedValue(null))

    await act(async () => {
      await expect(result.current.createPayPalOrder()).rejects.toThrow()
    })
    act(() => {
      result.current.onError(new Error('createOrder rejected'))
    })

    expect(result.current.notice).toBeNull()

    // A later PayPal error (script, popup) is shown again.
    act(() => {
      result.current.onError(new Error('popup failed'))
    })
    expect(result.current.notice).toEqual({
      tone: 'error',
      message: API_FALLBACK_ERRORS.PAYMENT_START,
    })
  })

  it('approve with a PAID capture routes to Order success', async () => {
    capturePayment.mockResolvedValue(captured())
    const { result } = setup()
    await act(async () => {
      await result.current.createPayPalOrder()
    })

    await act(async () => {
      await result.current.onApprove()
    })

    expect(capturePayment).toHaveBeenCalledWith('order-1')
    expect(toast.success).toHaveBeenCalledWith(
      SUCCESS_MESSAGES.PAYMENT_SUCCESSFUL,
    )
    expect(push).toHaveBeenCalledWith(orderSuccessPath('order-1'))
  })

  it('approve with a PENDING capture routes to Order success, confirming', async () => {
    capturePayment.mockResolvedValue(
      captured({ paymentStatus: OrderPaymentStatus.PENDING }),
    )
    const { result } = setup()
    await act(async () => {
      await result.current.createPayPalOrder()
    })

    await act(async () => {
      await result.current.onApprove()
    })

    expect(push).toHaveBeenCalledWith(
      orderSuccessPath('order-1', undefined, { confirming: true }),
    )
  })

  it('approve with a retryable FAILED capture keeps the order and shows the reason', async () => {
    capturePayment.mockResolvedValue(
      captured({
        paymentStatus: OrderPaymentStatus.FAILED,
        failureReason: 'The instrument presented was declined.',
        retryable: true,
      }),
    )
    const { result } = setup()
    await act(async () => {
      await result.current.createPayPalOrder()
    })

    await act(async () => {
      await result.current.onApprove()
    })

    expect(push).not.toHaveBeenCalled()
    expect(result.current.placedOrder).toBe(order)
    expect(result.current.notice).toEqual({
      tone: 'error',
      message: 'The instrument presented was declined.',
    })
    expect(result.current.canRetry).toBe(true)
  })

  it('approve with a final FAILED capture sets PAYPAL_NOT_RETRYABLE and canRetry false', async () => {
    capturePayment.mockResolvedValue(
      captured({
        paymentStatus: OrderPaymentStatus.FAILED,
        failureReason: 'PayPal denied the payment',
        retryable: false,
      }),
    )
    const { result } = setup()
    await act(async () => {
      await result.current.createPayPalOrder()
    })

    await act(async () => {
      await result.current.onApprove()
    })

    expect(result.current.notice).toEqual({
      tone: 'error',
      message: `PayPal denied the payment ${ERROR_MESSAGES.PAYPAL_NOT_RETRYABLE}`,
    })
    expect(result.current.canRetry).toBe(false)
  })

  it('cancel keeps the placed order and sets the cancel note', async () => {
    const { result } = setup()
    await act(async () => {
      await result.current.createPayPalOrder()
    })

    act(() => {
      result.current.onCancel()
    })

    expect(result.current.placedOrder).toBe(order)
    expect(result.current.notice).toEqual({
      tone: 'info',
      message: NOTICE_MESSAGES.PAYPAL_CANCELLED,
    })
    expect(result.current.canRetry).toBe(true)
  })

  it('a failed start shows the mapped errCode message', async () => {
    startPayment.mockRejectedValue(
      new ServiceError('x', [
        {
          errCode: 'paymentGatewayUnavailable',
          field: '',
          message: 'x',
          description: 'y',
        },
      ]),
    )
    const { result } = setup()

    await act(async () => {
      await expect(result.current.createPayPalOrder()).rejects.toThrow()
    })

    expect(result.current.notice).toEqual({
      tone: 'error',
      message: ERROR_MESSAGES.PAYMENT_GATEWAY_UNAVAILABLE,
    })
  })

  it('onError or a failed start shows the fallback error', async () => {
    startPayment.mockRejectedValue(new Error('x'))
    const { result } = setup()

    await act(async () => {
      await expect(result.current.createPayPalOrder()).rejects.toThrow()
    })
    expect(result.current.notice).toEqual({
      tone: 'error',
      message: API_FALLBACK_ERRORS.PAYMENT_START,
    })

    act(() => {
      result.current.onCancel()
    })
    act(() => {
      result.current.onError(new Error('popup closed'))
    })
    expect(result.current.notice).toEqual({
      tone: 'error',
      message: API_FALLBACK_ERRORS.PAYMENT_START,
    })
  })

  it('a failed capture call shows its error and keeps the order', async () => {
    capturePayment.mockRejectedValue(
      new ServiceError(API_FALLBACK_ERRORS.PAYMENT_CAPTURE),
    )
    const { result } = setup()
    await act(async () => {
      await result.current.createPayPalOrder()
    })

    await act(async () => {
      await result.current.onApprove()
    })

    expect(push).not.toHaveBeenCalled()
    expect(result.current.notice).toEqual({
      tone: 'error',
      message: API_FALLBACK_ERRORS.PAYMENT_CAPTURE,
    })
    expect(result.current.canRetry).toBe(true)
  })

  it('a capture refused as expired shows the mapped message and stops retries', async () => {
    capturePayment.mockRejectedValue(
      new ServiceError('Order expired', [
        {
          errCode: 'paymentOrderExpired',
          field: 'id',
          message: 'Order expired',
          description: 'x',
        },
      ]),
    )
    const { result } = setup()
    await act(async () => {
      await result.current.createPayPalOrder()
    })

    await act(async () => {
      await result.current.onApprove()
    })

    expect(result.current.notice).toEqual({
      tone: 'error',
      message: ERROR_MESSAGES.PAYMENT_ORDER_EXPIRED,
    })
    expect(result.current.canRetry).toBe(false)
  })

  const refusal = (errCode: string) =>
    new ServiceError('refused', [
      { errCode, field: 'id', message: 'refused', description: 'x' },
    ])

  it('a capture refused as not payable keeps PayPal retryable', async () => {
    capturePayment.mockRejectedValue(refusal('paymentNotPayable'))
    const { result } = setup()
    await act(async () => {
      await result.current.createPayPalOrder()
    })

    await act(async () => {
      await result.current.onApprove()
    })

    expect(result.current.notice).toEqual({
      tone: 'error',
      message: ERROR_MESSAGES.PAYMENT_NOT_PAYABLE,
    })
    expect(result.current.canRetry).toBe(true)
  })

  it('a capture refused by the gateway shows the mapped message and stays retryable', async () => {
    capturePayment.mockRejectedValue(refusal('paymentGatewayRejected'))
    const { result } = setup()
    await act(async () => {
      await result.current.createPayPalOrder()
    })

    await act(async () => {
      await result.current.onApprove()
    })

    expect(result.current.notice).toEqual({
      tone: 'error',
      message: ERROR_MESSAGES.PAYMENT_GATEWAY_REJECTED,
    })
    expect(result.current.canRetry).toBe(true)
  })

  it.each(['paymentOrderExpired', 'paymentNotPayable'])(
    'a start refused with %s stops retries',
    async (errCode) => {
      startPayment.mockRejectedValue(refusal(errCode))
      const { result } = setup()

      await act(async () => {
        await expect(result.current.createPayPalOrder()).rejects.toThrow()
      })

      expect(result.current.canRetry).toBe(false)
    },
  )
})
