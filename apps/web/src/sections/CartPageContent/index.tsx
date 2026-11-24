'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import AlertDialog from '@/components/AlertDialog'
import { CartLineItem } from '@/components/CartLineItem'
import { CartSummaryCard } from '@/components/CartSummaryCard'
import { Button } from '@/components/ui/button'
import { API_FALLBACK_ERRORS } from '@/constants/messages'
import { CART_CHECKOUT_BLOCKED_MESSAGE } from '@/constants/order'
import { ROUTES } from '@/constants/routes'
import { useCart, type CartActionResult } from '@/hooks/useCart'
import { useCartStore } from '@/store/useCartStore'
import type { CartItem } from '@/types/cart'
import { formatCurrency } from '@/utils/cart'
import { isCartItemBlocked } from '@/utils/inventory'

export default function CartPageContent() {
  const router = useRouter()
  const [pendingRemoveItem, setPendingRemoveItem] = useState<CartItem | null>(
    null,
  )
  const [actionError, setActionError] = useState<string | null>(null)
  const {
    items,
    totals,
    itemCount,
    isLoading,
    isError,
    errorMessage,
    changeQuantity,
    removeItem,
    refetch,
  } = useCart()
  const mergeNotice = useCartStore((state) => state.mergeNotice)
  const setMergeNotice = useCartStore((state) => state.setMergeNotice)

  // The merge notice is shown once, on this visit to the Cart page. The clear
  // waits a tick: Strict Mode's simulated unmount remounts at once and cancels it.
  const pendingNoticeClear = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (pendingNoticeClear.current) clearTimeout(pendingNoticeClear.current)
    return () => {
      pendingNoticeClear.current = setTimeout(() => setMergeNotice(null), 0)
    }
  }, [setMergeNotice])

  // One request at a time per line: a click while it runs would send a stale value.
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set())

  const runForLine = (
    itemId: string,
    action: () => Promise<CartActionResult>,
    fallbackError: string,
  ) => {
    if (pendingIds.has(itemId)) return
    setPendingIds((current) => new Set(current).add(itemId))
    void action()
      .then((result) => setActionError(result.ok ? null : result.error))
      .catch(() => setActionError(fallbackError))
      .finally(() =>
        setPendingIds((current) => {
          const next = new Set(current)
          next.delete(itemId)
          return next
        }),
      )
  }

  const handleChangeQuantity = (itemId: string, quantity: number) => {
    runForLine(
      itemId,
      () => changeQuantity(itemId, quantity),
      API_FALLBACK_ERRORS.CART_UPDATE,
    )
  }

  const hasItems = items.length > 0
  const hasOutOfStockItems = items.some(isCartItemBlocked)

  const handleCheckout = () => {
    if (hasOutOfStockItems) {
      return
    }
    router.push(ROUTES.CHECKOUT)
  }

  const handleContinueShopping = () => {
    router.push('/roasts')
  }

  if (isLoading) {
    return (
      <div
        className="mx-auto max-w-7xl px-4 py-8 md:px-6 md:py-12"
        data-testid="cart-loading"
      >
        <div className="mb-8 space-y-2">
          <div className="h-11 w-80 animate-pulse rounded-md bg-surface-container-high" />
          <div className="h-6 w-60 animate-pulse rounded-md bg-surface-container-high" />
        </div>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-4">
            <div className="h-40 animate-pulse rounded-3xl bg-surface-container-high" />
            <div className="h-40 animate-pulse rounded-3xl bg-surface-container-high" />
          </div>
          <div className="h-84 animate-pulse rounded-3xl bg-surface-container-high" />
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <div
        className="mx-auto max-w-4xl px-4 py-16 text-center md:px-6"
        data-testid="cart-error"
      >
        <h1 className="text-3xl font-semibold text-on-surface">
          Your Sensory Cart
        </h1>
        <p className="mt-4 text-on-surface-variant">
          {errorMessage ?? 'Unable to load your cart right now.'}
        </p>
        <Button className="mt-6 w-auto px-8" onClick={() => void refetch()}>
          Retry
        </Button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-6 md:py-12">
      <AlertDialog
        data-testid="modal-confirm-remove-cart-item"
        open={pendingRemoveItem !== null}
        onOpenChange={(open) => {
          if (!open) setPendingRemoveItem(null)
        }}
        title="Remove item?"
        description="Are you sure you want to remove this item from your cart?"
        textCancel="Cancel"
        textAction="Remove"
        onClickAction={() => {
          const itemId = pendingRemoveItem?.id
          if (!itemId) return
          runForLine(
            itemId,
            () => removeItem(itemId),
            API_FALLBACK_ERRORS.CART_REMOVE,
          )
          setPendingRemoveItem(null)
        }}
      >
        {pendingRemoveItem && (
          <div className="flex items-center gap-3 rounded-2xl bg-sidebar-accent/80 p-3">
            <div className="relative size-14 overflow-hidden rounded-full">
              <Image
                src={pendingRemoveItem.imageUrl}
                alt={pendingRemoveItem.name}
                fill
                className="object-cover"
              />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-on-surface">
                {pendingRemoveItem.name}
              </p>
              <p className="text-sm text-on-surface-variant">
                {formatCurrency(pendingRemoveItem.unitPrice)} •{' '}
                {pendingRemoveItem.quantity} unit
              </p>
            </div>
          </div>
        )}
      </AlertDialog>

      <section className="space-y-2" aria-label="Cart heading">
        <h1 className="text-4xl font-semibold text-on-surface md:text-5xl">
          Your Sensory Cart
        </h1>
        <p className="text-lg text-on-surface-variant">
          {hasItems
            ? `${itemCount} items selected for your next brewing experience.`
            : 'No items selected for your next brewing experience.'}
        </p>
      </section>

      {mergeNotice ? (
        <div
          className="mt-6 rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          data-testid="cart-merge-notice"
          role="alert"
        >
          {mergeNotice}
        </div>
      ) : null}

      {!hasItems ? (
        <section className="mt-10 rounded-3xl border border-outline-variant/70 bg-surface-container-low p-10 text-center">
          <p className="text-xl text-on-surface">Your cart is empty.</p>
          <p className="mt-2 text-on-surface-variant">
            Browse our roasts and gear to build your next sensory ritual.
          </p>
          <Button
            className="mt-6 w-auto px-8"
            onClick={() => router.push(ROUTES.HOME)}
          >
            Continue Shopping
          </Button>
        </section>
      ) : (
        <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
          {actionError ? (
            <div
              className="lg:col-span-2 rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
              data-testid="cart-action-error"
              role="alert"
            >
              {actionError}
            </div>
          ) : null}
          {hasOutOfStockItems ? (
            <div
              className="lg:col-span-2 rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
              data-testid="cart-out-of-stock-alert"
              role="alert"
            >
              {CART_CHECKOUT_BLOCKED_MESSAGE}
            </div>
          ) : null}
          <section className="space-y-4" aria-label="Cart line items">
            {items.map((item) => (
              <CartLineItem
                key={item.id}
                item={item}
                onChangeQuantity={handleChangeQuantity}
                disabled={pendingIds.has(item.id)}
                onRemove={() => setPendingRemoveItem(item)}
              />
            ))}
          </section>

          <CartSummaryCard
            totals={totals}
            onCheckout={handleCheckout}
            onContinueShopping={handleContinueShopping}
            isCheckoutDisabled={!hasItems || hasOutOfStockItems}
          />
        </div>
      )}
    </div>
  )
}
