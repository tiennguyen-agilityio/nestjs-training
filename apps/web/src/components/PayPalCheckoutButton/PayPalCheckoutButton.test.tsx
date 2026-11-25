import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import PayPalCheckoutButton from '@/components/PayPalCheckoutButton'
import { ERROR_MESSAGES } from '@/constants/messages'

const providerProps = jest.fn()

jest.mock(
  '@paypal/react-paypal-js/sdk-v6',
  () => ({
    PayPalProvider: (props: { children: React.ReactNode }) => {
      providerProps(props)
      return <>{props.children}</>
    },
    PayPalOneTimePaymentButton: (props: {
      createOrder: () => Promise<unknown>
      onApprove: () => Promise<void>
      onCancel: () => void
      onError: (error: unknown) => void
      presentationMode: string
      disabled?: boolean
    }) => (
      <>
        <button type="button" onClick={props.onCancel}>
          Cancel PayPal
        </button>
        <button type="button" onClick={() => props.onError(new Error('x'))}>
          Fail PayPal
        </button>
        <button
          type="button"
          disabled={props.disabled}
          data-mode={props.presentationMode}
          onClick={async () => {
            await props.createOrder()
            await props.onApprove()
          }}
        >
          PayPal
        </button>
      </>
    ),
  }),
  { virtual: true },
)

const callbacks = () => ({
  createOrder: jest.fn().mockResolvedValue({ orderId: 'PP-1' }),
  onApprove: jest.fn().mockResolvedValue(undefined),
  onCancel: jest.fn(),
  onError: jest.fn(),
})

describe('PayPalCheckoutButton', () => {
  const originalEnv = process.env

  beforeEach(() => {
    providerProps.mockClear()
    process.env = { ...originalEnv, NEXT_PUBLIC_PAYPAL_CLIENT_ID: 'client-id' }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('renders the PayPal one-time button in a popup with the callbacks', async () => {
    const user = userEvent.setup()
    const props = callbacks()
    render(<PayPalCheckoutButton {...props} />)

    const button = screen.getByRole('button', { name: 'PayPal' })
    expect(button).toHaveAttribute('data-mode', 'popup')
    await user.click(button)

    expect(props.createOrder).toHaveBeenCalled()
    expect(props.onApprove).toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Cancel PayPal' }))
    await user.click(screen.getByRole('button', { name: 'Fail PayPal' }))
    expect(props.onCancel).toHaveBeenCalled()
    expect(props.onError).toHaveBeenCalledWith(expect.any(Error))
    expect(providerProps).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: 'client-id',
        environment: 'sandbox',
        components: ['paypal-payments'],
        pageType: 'checkout',
      }),
    )
  })

  it('uses the production environment only when configured', () => {
    process.env.NEXT_PUBLIC_PAYPAL_ENVIRONMENT = 'production'
    render(<PayPalCheckoutButton {...callbacks()} />)

    expect(providerProps).toHaveBeenCalledWith(
      expect.objectContaining({ environment: 'production' }),
    )
  })

  it('without a client id shows the unavailable message', () => {
    delete process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID
    render(<PayPalCheckoutButton {...callbacks()} />)

    expect(screen.getByRole('alert')).toHaveTextContent(
      ERROR_MESSAGES.PAYPAL_UNAVAILABLE,
    )
    expect(screen.queryByRole('button', { name: 'PayPal' })).toBeNull()
  })
})
