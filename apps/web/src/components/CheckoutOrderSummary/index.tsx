'use client'

import Image from 'next/image'
import type { ReactNode } from 'react'
import { AlertTriangle, ShoppingBag, Trash2 } from 'lucide-react'

import SalePrice from '@/components/SalePrice'
import { Button } from '@/components/ui/button'
import { OUT_OF_STOCK_LABEL } from '@/constants/order'
import type { CartItem, CartTotals } from '@/types/cart'
import type { PayPalNotice } from '@/types/checkout'
import { formatCurrency } from '@/utils/cart'
import { isCartItemOutOfStock } from '@/utils/inventory'
import { cn } from '@/utils/styles'

export interface CheckoutOrderSummaryProps {
  items: CartItem[]
  totals: CartTotals
  onPlaceOrder: () => void
  onRemoveItem?: (lineId: string, productId: string) => void
  submissionErrorMessage?: string | null
  itemQuantityErrors?: Partial<Record<string, string>>
  hasBlockingItemErrors?: boolean
  isPlacingOrder?: boolean
  isPlaceOrderDisabled?: boolean
  /** Rendered instead of the Place Order button (PayPal's own button). */
  placeOrderAction?: ReactNode
  /** A note above the button: info as status, error as alert. */
  notice?: PayPalNotice | null
  className?: string
}

export const CheckoutOrderSummary = ({
  items,
  totals,
  onPlaceOrder,
  onRemoveItem,
  submissionErrorMessage,
  itemQuantityErrors,
  hasBlockingItemErrors = false,
  isPlacingOrder = false,
  isPlaceOrderDisabled = false,
  placeOrderAction,
  notice,
  className,
}: CheckoutOrderSummaryProps) => {
  const hasItemErrors = items.some((item) =>
    Boolean(itemQuantityErrors?.[item.id]),
  )

  return (
    <aside
      className={cn(
        'rounded-[2rem] border border-outline-variant/70 bg-surface-container-low p-6 shadow-sm md:p-8',
        className,
      )}
    >
      <h2 className="text-3xl font-semibold text-on-surface">Order Summary</h2>
      <div className="mt-6 space-y-4">
        {items.map((item) => {
          const lineOutOfStock = isCartItemOutOfStock(item)
          const lineErrorMessage = itemQuantityErrors?.[item.id] ?? null
          const hasLineError = Boolean(lineErrorMessage)
          const removeLooksUrgent = hasLineError || lineOutOfStock

          return (
            <article
              key={item.id}
              className={cn(
                'flex items-center gap-3 rounded-2xl border border-transparent p-3',
                'pb-4',
                !hasLineError && !lineOutOfStock && 'border-outline-variant/40',
                (hasLineError || lineOutOfStock) &&
                  'border border-destructive/40 bg-destructive/5',
              )}
            >
              <div className="relative size-16 shrink-0 overflow-hidden rounded-lg bg-surface-container">
                <Image
                  src={item.imageUrl}
                  alt={item.name}
                  fill
                  className="object-cover"
                  sizes="64px"
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-on-surface">
                  {item.name}
                </p>
                <p className="truncate text-sm text-on-surface-variant">
                  {item.meta}
                </p>
                <p className="mt-1 font-semibold text-primary">
                  <SalePrice
                    price={item.unitPrice}
                    listPrice={item.listPrice}
                  />
                </p>
                {lineOutOfStock && (
                  <p className="mt-1 text-xs font-medium text-destructive">
                    {OUT_OF_STOCK_LABEL}
                  </p>
                )}
                {hasLineError && (
                  <p className="mt-1 flex items-start gap-1 text-xs text-destructive">
                    <AlertTriangle
                      className="mt-0.5 size-3 shrink-0"
                      aria-hidden
                    />
                    {lineErrorMessage}
                  </p>
                )}
              </div>

              {Boolean(onRemoveItem) && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className={cn(
                    'shrink-0',
                    removeLooksUrgent
                      ? 'text-destructive hover:bg-destructive/10 hover:text-destructive'
                      : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface',
                  )}
                  aria-label={`Remove ${item.name} from order`}
                  onClick={() => onRemoveItem?.(item.id, item.productId)}
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              )}
            </article>
          )
        })}
      </div>

      <div className="my-6 h-px bg-outline-variant/60" />

      <dl className="space-y-2 text-on-surface-variant">
        <div className="flex items-center justify-between gap-2">
          <dt>Subtotal</dt>
          <dd>{formatCurrency(totals.subtotal)}</dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt>Shipping</dt>
          <dd>
            {totals.shipping === null
              ? 'Free'
              : formatCurrency(totals.shipping)}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt>Estimated Tax</dt>
          <dd>{formatCurrency(totals.tax)}</dd>
        </div>
      </dl>

      <div className="my-6 h-px bg-outline-variant/60" />

      <div className="flex items-center justify-between gap-2">
        <p className="text-xl font-semibold text-on-surface">Total</p>
        <p className="text-xl font-bold text-primary">
          {formatCurrency(totals.total)}
        </p>
      </div>

      {Boolean(submissionErrorMessage) && (
        <p
          className="mt-6 rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          {submissionErrorMessage}
        </p>
      )}

      {notice && (
        <p
          className={cn(
            'mt-6 rounded-2xl border px-4 py-3 text-sm',
            notice.tone === 'error'
              ? 'border-destructive/40 bg-destructive/10 text-destructive'
              : 'border-outline-variant bg-surface-container text-on-surface-variant',
          )}
          role={notice.tone === 'error' ? 'alert' : 'status'}
        >
          {notice.message}
        </p>
      )}

      {placeOrderAction ? (
        <div className="mt-4">{placeOrderAction}</div>
      ) : (
        <Button
          type="button"
          loading={isPlacingOrder}
          disabled={isPlaceOrderDisabled || hasBlockingItemErrors}
          title="Ordering is temporarily unavailable."
          className="mt-4 h-14 rounded-full text-base"
          onClick={onPlaceOrder}
        >
          Place Order
          <ShoppingBag className="size-4" aria-hidden />
        </Button>
      )}
      {hasItemErrors && (
        <p className="mt-3 text-center text-xs text-destructive">
          Remove highlighted items or update your cart, then try again.
        </p>
      )}

      <p className="mt-6 text-center text-xs text-on-surface-variant">
        By placing your order, you agree to CoffeeHub&apos;s Terms of Service
        and Privacy Policy.
      </p>
    </aside>
  )
}
