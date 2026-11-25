'use client'

import {
  PayPalOneTimePaymentButton,
  PayPalProvider,
} from '@paypal/react-paypal-js/sdk-v6'

import { ERROR_MESSAGES } from '@/constants/messages'

export interface PayPalCheckoutButtonProps {
  disabled?: boolean
  createOrder: () => Promise<{ orderId: string }>
  onApprove: () => Promise<void>
  onCancel: () => void
  onError: (error: unknown) => void
}

/** PayPal's own button: the popup must open from the shopper's click on it. */
const PayPalCheckoutButton = ({
  disabled,
  createOrder,
  onApprove,
  onCancel,
  onError,
}: PayPalCheckoutButtonProps) => {
  const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID
  const environment =
    process.env.NEXT_PUBLIC_PAYPAL_ENVIRONMENT === 'production'
      ? 'production'
      : 'sandbox'

  if (!clientId) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {ERROR_MESSAGES.PAYPAL_UNAVAILABLE}
      </p>
    )
  }

  // Only the PayPal wallet button: no Pay Later, Venmo or guest card.
  return (
    <PayPalProvider
      clientId={clientId}
      environment={environment}
      components={['paypal-payments']}
      pageType="checkout"
    >
      <PayPalOneTimePaymentButton
        presentationMode="popup"
        disabled={disabled}
        createOrder={createOrder}
        onApprove={onApprove}
        onCancel={onCancel}
        onError={onError}
      />
    </PayPalProvider>
  )
}

export default PayPalCheckoutButton
