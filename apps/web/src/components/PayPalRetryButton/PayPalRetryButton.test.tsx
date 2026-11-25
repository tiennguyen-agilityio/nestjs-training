import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { OrderPaymentStatus } from '@repo/constants'

import PayPalRetryButton from '@/components/PayPalRetryButton'
import {
  API_FALLBACK_ERRORS,
  ERROR_MESSAGES,
  NOTICE_MESSAGES,
  SUCCESS_MESSAGES,
} from '@/constants/messages'
import { orderSuccessPath } from '@/constants/routes'
import { useCapturePayment, useStartPayment } from '@/hooks/usePayment'
import { PAYMENT_ERR_CODES } from '@/utils/order'
import { ServiceError } from '@/utils/query'

interface SessionOptions {
  presentationMode: string
  createOrder: () => Promise<{ orderId: string }>
  onApprove: () => Promise<void>
  onCancel: () => void
  onError: (error: unknown) => void
}

const handleClick = jest.fn()
let sessionOptions: SessionOptions
let sessionError: Error | null = null
/** One entry per click: settles that click's session, like the SDK's start(). */
let clicks: { resolve: () => void; reject: (error: Error) => void }[] = []
const finishClick = () => clicks.at(-1)?.resolve()
const failClick = (error: Error) => clicks.at(-1)?.reject(error)

jest.mock(
  '@paypal/react-paypal-js/sdk-v6',
  () => ({
    PayPalProvider: ({ children }: { children: React.ReactNode }) => (
      <>{children}</>
    ),
    usePayPalOneTimePaymentSession: (options: SessionOptions) => {
      sessionOptions = options
      return {
        isPending: false,
        error: sessionError,
        handleClick,
        handleCancel: jest.fn(),
        handleDestroy: jest.fn(),
      }
    },
  }),
  { virtual: true },
)
jest.mock('next/navigation', () => ({ useRouter: jest.fn() }))
jest.mock('sonner', () => ({ toast: { success: jest.fn() } }))
jest.mock('@/hooks/usePayment', () => ({
  useStartPayment: jest.fn(),
  useCapturePayment: jest.fn(),
}))

const ORDER = { id: 'order-1' }
const push = jest.fn()
const startPayment = jest.fn()
const capturePayment = jest.fn()

const serviceError = (errCode: string) =>
  new ServiceError('refused', [
    { errCode, field: 'id', message: 'refused', description: 'refused' },
  ])

const captureAs = (
  paymentStatus: OrderPaymentStatus,
  failureReason: string | null = null,
) =>
  capturePayment.mockResolvedValue({
    paymentStatus,
    failureReason,
    retryable: false,
  })

const retryButton = () => screen.getByRole('button', { name: 'Retry payment' })

/** Clicks Retry payment: like the SDK, the click starts createOrder and settles when the session ends. */
const clickRetry = async () => {
  await userEvent.setup().click(retryButton())
}

/** Lets the click's then/catch/finally chain run. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

const approve = () => act(() => sessionOptions.onApprove())

const endSession = () =>
  act(async () => {
    finishClick()
    await flush()
  })

describe('PayPalRetryButton', () => {
  const originalEnv = process.env

  beforeEach(() => {
    jest.clearAllMocks()
    sessionError = null
    clicks = []
    process.env = { ...originalEnv, NEXT_PUBLIC_PAYPAL_CLIENT_ID: 'client-id' }
    jest.mocked(useRouter).mockReturnValue({ push } as never)
    jest
      .mocked(useStartPayment)
      .mockReturnValue({ mutateAsync: startPayment } as never)
    jest.mocked(useCapturePayment).mockReturnValue({
      mutateAsync: capturePayment,
      isPending: false,
    } as never)
    startPayment.mockResolvedValue({ checkoutId: 'PP-NEW' })
    handleClick.mockImplementation(
      () =>
        new Promise<void>((resolve, reject) => {
          clicks.push({ resolve, reject })
          sessionOptions.createOrder().catch(reject)
        }),
    )
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('PayPalRetryButton opens the PayPal popup from Retry payment and captures', async () => {
    captureAs(OrderPaymentStatus.PAID)
    render(<PayPalRetryButton order={ORDER} />)

    await clickRetry()

    expect(handleClick).toHaveBeenCalledTimes(1)
    expect(sessionOptions.presentationMode).toBe('popup')
    expect(startPayment).toHaveBeenCalledTimes(1)
    expect(startPayment).toHaveBeenCalledWith('order-1')
    await approve()
    await endSession()
    expect(capturePayment).toHaveBeenCalledWith('order-1')
    expect(toast.success).toHaveBeenCalledWith(
      SUCCESS_MESSAGES.PAYMENT_SUCCESSFUL,
    )
    expect(push).toHaveBeenCalledWith(orderSuccessPath('order-1'))
  })

  it('PayPalRetryButton disables Retry payment while the popup is open', async () => {
    render(<PayPalRetryButton order={ORDER} />)

    await clickRetry()
    expect(retryButton()).toBeDisabled()

    act(() => sessionOptions.onCancel())
    expect(retryButton()).toBeEnabled()

    await clickRetry()
    act(() => sessionOptions.onError(new Error('popup failed')))
    expect(retryButton()).toBeEnabled()
  })

  it('PayPalRetryButton stays disabled when the session settles before PayPal reports back', async () => {
    render(<PayPalRetryButton order={ORDER} />)

    await clickRetry()
    await endSession()
    expect(retryButton()).toBeDisabled()

    act(() => sessionOptions.onCancel())
    expect(retryButton()).toBeEnabled()
  })

  it('PayPalRetryButton re-enables Retry payment and shows PAYPAL_UNAVAILABLE when a click finds no session after an earlier one', async () => {
    const { rerender } = render(<PayPalRetryButton order={ORDER} />)
    await clickRetry()
    act(() => sessionOptions.onCancel())

    // The SDK returns without starting anything and sets its own error.
    handleClick.mockResolvedValueOnce(undefined)
    await clickRetry()
    sessionError = new Error('PayPal session not available')
    rerender(<PayPalRetryButton order={ORDER} />)

    expect(retryButton()).toBeEnabled()
    expect(screen.getByRole('alert')).toHaveTextContent(
      ERROR_MESSAGES.PAYPAL_UNAVAILABLE,
    )
    expect(
      screen.queryByText(NOTICE_MESSAGES.PAYPAL_CANCELLED),
    ).not.toBeInTheDocument()
  })

  it('PayPalRetryButton re-enables Retry payment when the popup cannot start', async () => {
    handleClick.mockImplementationOnce(async () => {
      await sessionOptions.createOrder()
      throw new Error('popup blocked')
    })
    render(<PayPalRetryButton order={ORDER} />)

    await clickRetry()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      API_FALLBACK_ERRORS.PAYMENT_START,
    )
    expect(startPayment).toHaveBeenCalledTimes(1)
    expect(retryButton()).toBeEnabled()
  })

  it('PayPalRetryButton shows the decline reason after a FAILED capture', async () => {
    captureAs(
      OrderPaymentStatus.FAILED,
      'The instrument presented was declined.',
    )
    render(<PayPalRetryButton order={ORDER} />)

    await clickRetry()
    await approve()
    await endSession()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The instrument presented was declined.',
    )
    expect(
      screen.queryByText(ERROR_MESSAGES.PAYPAL_NOT_RETRYABLE, { exact: false }),
    ).not.toBeInTheDocument()
    expect(retryButton()).toBeEnabled()
    expect(push).not.toHaveBeenCalled()
  })

  it('PayPalRetryButton sends a held capture to Order success confirming', async () => {
    captureAs(OrderPaymentStatus.PENDING)
    render(<PayPalRetryButton order={ORDER} />)

    await clickRetry()
    await approve()
    await endSession()

    expect(push).toHaveBeenCalledWith(
      orderSuccessPath('order-1', undefined, { confirming: true }),
    )
    expect(retryButton()).toBeDisabled()
  })

  it('PayPalRetryButton keeps Retry payment disabled after a PAID capture', async () => {
    captureAs(OrderPaymentStatus.PAID)
    render(<PayPalRetryButton order={ORDER} />)

    await clickRetry()
    await approve()
    await endSession()

    expect(retryButton()).toBeDisabled()
  })

  it('PayPalRetryButton shows the cancel notice, even when the session then rejects', async () => {
    render(<PayPalRetryButton order={ORDER} />)

    await clickRetry()
    act(() => sessionOptions.onCancel())
    await act(async () => {
      failClick(new Error('popup closed'))
      await flush()
    })

    expect(await screen.findByRole('status')).toHaveTextContent(
      NOTICE_MESSAGES.PAYPAL_CANCELLED,
    )
    expect(retryButton()).toBeEnabled()
  })

  it('PayPalRetryButton keeps Retry payment enabled after a start error that is not final', async () => {
    startPayment.mockRejectedValue(
      serviceError(PAYMENT_ERR_CODES.GATEWAY_UNAVAILABLE),
    )
    render(<PayPalRetryButton order={ORDER} />)

    await clickRetry()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      ERROR_MESSAGES.PAYMENT_GATEWAY_UNAVAILABLE,
    )
    expect(retryButton()).toBeEnabled()
  })

  it.each([
    [PAYMENT_ERR_CODES.NOT_PAYABLE, ERROR_MESSAGES.PAYMENT_NOT_PAYABLE],
    [PAYMENT_ERR_CODES.ORDER_EXPIRED, ERROR_MESSAGES.PAYMENT_ORDER_EXPIRED],
  ])(
    'PayPalRetryButton disables Retry payment after a final start refusal: %s',
    async (errCode, message) => {
      startPayment.mockRejectedValue(serviceError(errCode))
      render(<PayPalRetryButton order={ORDER} />)

      await clickRetry()
      act(() => sessionOptions.onError(new Error('createOrder failed')))

      expect(await screen.findByRole('alert')).toHaveTextContent(message)
      expect(retryButton()).toBeDisabled()
    },
  )

  it('PayPalRetryButton disables Retry payment when the capture finds the order expired', async () => {
    capturePayment.mockRejectedValue(
      serviceError(PAYMENT_ERR_CODES.ORDER_EXPIRED),
    )
    render(<PayPalRetryButton order={ORDER} />)

    await clickRetry()
    await approve()
    await endSession()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      ERROR_MESSAGES.PAYMENT_ORDER_EXPIRED,
    )
    expect(retryButton()).toBeDisabled()
  })

  it('PayPalRetryButton shows PAYPAL_UNAVAILABLE for a session error until the next click, and again for a newer one', async () => {
    sessionError = new Error('Failed to create payment session')
    handleClick.mockImplementationOnce(async () => {
      await sessionOptions.createOrder()
      throw new Error('popup blocked')
    })
    const { rerender } = render(<PayPalRetryButton order={ORDER} />)
    expect(screen.getByRole('alert')).toHaveTextContent(
      ERROR_MESSAGES.PAYPAL_UNAVAILABLE,
    )
    // It can be the SDK's own early-click error: another click may work.
    expect(retryButton()).toBeEnabled()

    await clickRetry()
    expect(
      (await screen.findAllByRole('alert')).map((alert) => alert.textContent),
    ).toEqual([API_FALLBACK_ERRORS.PAYMENT_START])

    sessionError = new Error('PayPal session not available')
    rerender(<PayPalRetryButton order={ORDER} />)
    expect(
      screen.getAllByRole('alert').map((alert) => alert.textContent),
    ).toEqual([
      ERROR_MESSAGES.PAYPAL_UNAVAILABLE,
      API_FALLBACK_ERRORS.PAYMENT_START,
    ])
  })

  it('PayPalRetryButton shows PAYPAL_UNAVAILABLE without a client id', () => {
    process.env = { ...originalEnv, NEXT_PUBLIC_PAYPAL_CLIENT_ID: '' }
    render(<PayPalRetryButton order={ORDER} />)

    expect(screen.getByRole('alert')).toHaveTextContent(
      ERROR_MESSAGES.PAYPAL_UNAVAILABLE,
    )
    expect(
      screen.queryByRole('button', { name: 'Retry payment' }),
    ).not.toBeInTheDocument()
  })

  it('PayPalRetryButton ignores an earlier click settling during the next attempt', async () => {
    render(<PayPalRetryButton order={ORDER} />)
    await clickRetry()
    act(() => sessionOptions.onCancel())
    const first = clicks[0]

    await clickRetry()
    await act(async () => {
      first.reject(new Error('popup closed'))
      await flush()
    })

    expect(retryButton()).toBeDisabled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('PayPalRetryButton unlocks Retry payment itself when createOrder fails', async () => {
    startPayment.mockRejectedValue(
      serviceError(PAYMENT_ERR_CODES.GATEWAY_UNAVAILABLE),
    )
    // The SDK neither rejects start() nor calls onError.
    handleClick.mockImplementationOnce(() => {
      sessionOptions.createOrder().catch(() => undefined)
      return new Promise<void>(() => undefined)
    })
    render(<PayPalRetryButton order={ORDER} />)

    await clickRetry()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      ERROR_MESSAGES.PAYMENT_GATEWAY_UNAVAILABLE,
    )
    expect(retryButton()).toBeEnabled()
  })

  it('PayPalRetryButton shows no start error when the session rejects during the capture', async () => {
    capturePayment.mockReturnValue(new Promise(() => undefined))
    render(<PayPalRetryButton order={ORDER} />)

    await clickRetry()
    // The capture never settles: onApprove runs, then the session rejects meanwhile.
    act(() => {
      void sessionOptions.onApprove()
    })
    await act(async () => {
      failClick(new Error('popup closed'))
      await flush()
    })

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
