'use client'

import { BadgeDollarSign, CreditCard, Wallet } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { PAYMENT_METHOD, type PaymentMethod } from '@/types/checkout'
import { cn } from '@/utils/styles'

export interface CheckoutPaymentMethodProps {
  value: PaymentMethod
  onChange: (value: PaymentMethod) => void
  disabled?: boolean
}

const PAYMENT_OPTIONS: {
  value: PaymentMethod
  label: string
  icon: typeof CreditCard
}[] = [
  {
    value: PAYMENT_METHOD.STRIPE,
    label: 'Stripe',
    icon: CreditCard,
  },
  {
    value: PAYMENT_METHOD.PAYPAL,
    label: 'PayPal',
    icon: Wallet,
  },
  {
    value: PAYMENT_METHOD.COD,
    label: 'Cash on Delivery',
    icon: BadgeDollarSign,
  },
]

export const CheckoutPaymentMethod = ({
  value,
  onChange,
  disabled = false,
}: CheckoutPaymentMethodProps) => {
  return (
    <div
      className="grid gap-3 sm:grid-cols-3"
      role="radiogroup"
      aria-label="Payment method"
    >
      {PAYMENT_OPTIONS.map((option) => {
        const isActive = option.value === value
        const Icon = option.icon

        return (
          <Button
            key={option.value}
            type="button"
            variant="outline"
            onClick={() => onChange(option.value)}
            disabled={disabled}
            role="radio"
            aria-checked={isActive}
            className={cn(
              'h-auto min-h-19 flex-col rounded-3xl border px-4 py-4 text-sm',
              // The outline variant carries dark: colours of its own, so both
              // states set theirs too, or dark mode shows them identical.
              isActive
                ? 'border-primary bg-surface-container text-on-surface dark:border-primary dark:bg-surface-container-high dark:text-on-surface'
                : 'border-outline-variant bg-surface-container-low text-on-surface-variant dark:border-border dark:bg-surface-container dark:text-on-surface-variant',
            )}
          >
            <Icon className="size-5" aria-hidden />
            <span>{option.label}</span>
          </Button>
        )
      })}
    </div>
  )
}
