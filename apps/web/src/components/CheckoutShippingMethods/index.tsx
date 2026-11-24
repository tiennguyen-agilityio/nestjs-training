import { Button } from '@/components/ui/button'
import { API_FALLBACK_ERRORS, NOTICE_MESSAGES } from '@/constants/messages'
import type { ShippingMethod } from '@/types/shippingMethod'
import { formatPrice } from '@/utils/common'

export interface CheckoutShippingMethodsProps {
  methods: ShippingMethod[]
  selectedId: string
  onSelect: (id: string) => void
  isLoading: boolean
  isError: boolean
  errorMessage: string | null
  onRetry: () => void
  disabled?: boolean
}

const noticeClassName =
  'space-y-4 rounded-3xl bg-surface-container-low p-6 text-center'

export default function CheckoutShippingMethods({
  methods,
  selectedId,
  onSelect,
  isLoading,
  isError,
  errorMessage,
  onRetry,
  disabled = false,
}: CheckoutShippingMethodsProps) {
  const renderBody = () => {
    if (isLoading) {
      return (
        <div
          className="space-y-3"
          role="status"
          aria-label="Loading delivery options"
          data-testid="shipping-methods-loading"
        >
          {Array.from({ length: 2 }, (_, index) => (
            <div
              key={`shipping-method-loading-${index}`}
              className="h-20 animate-pulse rounded-3xl bg-surface-container-high"
            />
          ))}
        </div>
      )
    }

    // A failed refetch keeps the list the shopper already sees.
    if (methods.length === 0 && isError) {
      return (
        <div className={noticeClassName}>
          <p className="text-on-surface-variant">
            {errorMessage ?? API_FALLBACK_ERRORS.SHIPPING_METHODS_LOAD}
          </p>
          <Button type="button" variant="outline" onClick={onRetry}>
            Retry
          </Button>
        </div>
      )
    }

    if (methods.length === 0) {
      return (
        <div className={noticeClassName}>
          <p className="text-on-surface-variant">
            {NOTICE_MESSAGES.SHIPPING_METHODS_EMPTY.MESSAGE}
          </p>
        </div>
      )
    }

    return (
      <div className="space-y-3">
        {methods.map(({ id, name, description, price }) => (
          <label
            key={id}
            className="flex cursor-pointer items-center justify-between rounded-3xl border border-outline-variant/70 bg-surface-container-low px-4 py-4"
            htmlFor={id}
          >
            <div className="flex items-center gap-3">
              <input
                id={id}
                type="radio"
                name="delivery-speed"
                value={id}
                aria-label={name}
                checked={selectedId === id}
                onChange={() => onSelect(id)}
                disabled={disabled}
                className="size-4 accent-primary"
              />
              <div>
                <p className="font-semibold text-on-surface">{name}</p>
                <p className="text-sm text-on-surface-variant">{description}</p>
              </div>
            </div>
            <p className="font-semibold text-on-surface">
              {price === 0 ? 'Free' : formatPrice(price)}
            </p>
          </label>
        ))}
      </div>
    )
  }

  return (
    <section aria-label="Delivery Speed">
      <div className="flex items-center justify-start gap-2">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ring text-sm font-semibold text-primary-foreground">
          3
        </div>
        <h2 className="text-2xl font-medium text-on-surface">Delivery Speed</h2>
      </div>
      <div className="mt-5">{renderBody()}</div>
    </section>
  )
}
