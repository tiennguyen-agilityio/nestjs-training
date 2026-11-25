'use client'

import Image from 'next/image'
import { useRouter, useSearchParams } from 'next/navigation'
import type { ReactNode } from 'react'
import {
  ArrowRight,
  Check,
  CircleHelp,
  Download,
  MapPin,
  Share2,
} from 'lucide-react'

import Loading from '@/components/Loading'
import { Button } from '@/components/ui/button'
import { ROUTES } from '@/constants/routes'
import { useOrderDetail } from '@/hooks/useOrder'
import OrderSuccessPayment from '@/sections/OrderSuccessPayment'
import { useCartStore } from '@/store/useCartStore'
import type { OrderDetail, PlacedOrder, PlacedOrderItem } from '@/types/order'
import { formatPrice } from '@/utils/common'
import { isPlacedOrder } from '@/utils/order'
import { OrderPaymentStatus } from '@repo/constants'

const monthFormatter = new Intl.DateTimeFormat('en-US', { month: 'short' })
const dayFormatter = new Intl.DateTimeFormat('en-US', { day: '2-digit' })
const weekdayFormatter = new Intl.DateTimeFormat('en-US', { weekday: 'long' })

const isAwaitingPayment = (order: OrderDetail): boolean =>
  order.paymentStatus === OrderPaymentStatus.PENDING ||
  order.paymentStatus === OrderPaymentStatus.FAILED

const OrderSummaryUnavailable = () => {
  const router = useRouter()

  return (
    <div className="mx-auto max-w-3xl px-4 py-20 text-center md:px-6">
      <h1 className="text-4xl font-semibold text-on-surface">
        Order Summary Unavailable
      </h1>
      <p className="mt-4 text-on-surface-variant">
        We could not find your order summary. Continue shopping to place a new
        order.
      </p>
      <Button
        className="mt-8 w-auto px-8"
        onClick={() => router.push(ROUTES.HOME)}
      >
        Continue Shopping
      </Button>
    </div>
  )
}

interface OrderSuccessSummaryProps {
  order: PlacedOrder
  payment?: ReactNode
}

const OrderSuccessSummary = ({ order, payment }: OrderSuccessSummaryProps) => {
  const router = useRouter()
  const { clearItemSnapshots } = useCartStore()

  const {
    orderNumber,
    recipientName,
    addressLine,
    ward,
    district,
    city,
    postalCode,
    shippingMethodName,
    shippingFee,
    subTotal,
    totalAmount,
    createdAt,
    items,
    tax,
  } = order

  const addressLines = [addressLine, ward, district, city, postalCode].filter(
    Boolean,
  )
  const orderDate = new Date(createdAt)
  const monthLabel = monthFormatter.format(orderDate)
  const dayLabel = dayFormatter.format(orderDate)
  const weekdayLabel = weekdayFormatter.format(orderDate).toUpperCase()

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 md:px-6 md:py-12">
      <div className="mx-auto max-w-3xl text-center">
        <div className="mx-auto flex size-18 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md">
          <div className="flex size-8 items-center justify-center rounded-full border-2 border-primary-foreground">
            <Check className="size-5" aria-hidden />
          </div>
        </div>
        <h1 className="mt-6 text-5xl font-semibold text-on-surface md:text-6xl">
          Order Successful
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-on-surface-variant">
          Thank you for choosing CoffeeHub. Your sensory journey begins now.
        </p>
        <p className="mx-auto mt-3 inline-flex rounded-full bg-primary/10 px-4 py-1 text-xs font-semibold tracking-[0.12em] text-primary uppercase">
          Order ID: {orderNumber}
        </p>
      </div>
      {payment}

      <div className="mt-10 grid gap-5 lg:grid-cols-[1.35fr_1fr]">
        <section className="rounded-2xl bg-surface-container-low p-7">
          <p className="text-[11px] font-semibold tracking-[0.18em] text-primary uppercase">
            Your Selection
          </p>
          <div className="mt-2 flex items-center justify-between">
            <h2 className="text-3xl font-semibold text-on-surface">
              Review Order
            </h2>
          </div>
          <div className="mt-7 space-y-5">
            {items.map((item: PlacedOrderItem) => (
              <article
                key={item.id}
                className="flex items-center justify-between gap-4"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="relative size-16 overflow-hidden rounded-2xl bg-surface">
                    <Image
                      src={item.productImage}
                      alt={item.productName}
                      fill
                      className="object-cover"
                      sizes="64px"
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-md font-semibold text-on-surface">
                      {item.productName}
                    </p>
                    <p className="truncate text-sm text-on-surface-variant">
                      {item.variantName}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold text-on-surface">
                    {formatPrice(item.lineTotal)}
                  </p>
                  <p className="text-xs text-on-surface-variant">
                    Qty: {item.quantity}
                  </p>
                </div>
              </article>
            ))}
          </div>

          <div className="mt-8 space-y-2 border-t border-outline-variant/70 pt-5 text-sm">
            <div className="flex items-center justify-between text-on-surface-variant">
              <span>Subtotal</span>
              <span>{formatPrice(subTotal)}</span>
            </div>
            <div className="flex items-center justify-between text-on-surface-variant">
              <span>Tax</span>
              <span>{formatPrice(tax)}</span>
            </div>
            <div className="flex items-center justify-between text-on-surface-variant">
              <span>Shipping ({shippingMethodName ?? 'Shipping'})</span>
              <span>{formatPrice(shippingFee)}</span>
            </div>
            <div className="flex items-center justify-between text-lg font-semibold text-on-surface">
              <span>Total Amount</span>
              <span className="text-primary">{formatPrice(totalAmount)}</span>
            </div>
          </div>
        </section>

        <div className="space-y-4">
          <section className="rounded-2xl bg-surface-container-low p-6">
            <h3 className="text-xs font-semibold tracking-[0.16em] text-primary uppercase">
              Delivery Address
            </h3>
            <div className="mt-3 flex gap-2">
              <MapPin
                className="mt-1 size-4 shrink-0 text-primary"
                aria-hidden
              />
              <div>
                <p className="font-semibold text-on-surface">{recipientName}</p>
                {addressLines.map((line) => (
                  <p key={line} className="text-sm text-on-surface-variant">
                    {line}
                  </p>
                ))}
              </div>
            </div>
          </section>

          <section className="rounded-2xl bg-surface-container-low p-6">
            <h3 className="text-xs font-semibold tracking-[0.16em] text-primary uppercase">
              Est. Delivery
            </h3>
            <div className="mt-2 flex items-start justify-between align-center gap-4 ml-4">
              <div className="text-on-surface text-center">
                <p className="text-4xl font-semibold leading-none">
                  {monthLabel}
                </p>
                <p className="mt-1 text-4xl font-semibold leading-none">
                  {dayLabel}
                </p>
                <p className="mt-1 text-[10px] font-semibold tracking-[0.16em] text-on-surface-variant uppercase">
                  {weekdayLabel}
                </p>
              </div>
              <p className="ml-6 text-sm text-on-surface-variant min-h-full border-l-2 pl-8">
                Your beans are being prepared for roasting to ensure maximum
                freshness upon arrival.
              </p>
            </div>
          </section>

          <Button
            className=" w-full rounded-full text-base"
            onClick={() => {
              clearItemSnapshots()
              router.push(ROUTES.HOME)
            }}
          >
            Continue Shopping
            <ArrowRight className="size-4" aria-hidden />
          </Button>
        </div>
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-sm text-on-surface-variant">
        <button
          disabled
          type="button"
          className="inline-flex items-center gap-2 transition-colors hover:text-on-surface"
        >
          <Download className="size-4" aria-hidden />
          Download Invoice
        </button>
        <button
          disabled
          type="button"
          className="inline-flex items-center gap-2 transition-colors hover:text-on-surface"
        >
          <Share2 className="size-4" aria-hidden />
          Share Experience
        </button>
        <button
          disabled
          type="button"
          className="inline-flex items-center gap-2 transition-colors hover:text-on-surface"
        >
          <CircleHelp className="size-4" aria-hidden />
          Contact Roaster
        </button>
      </div>
    </div>
  )
}

const OrderSuccessFromApi = ({
  orderId,
  hasSessionId,
  paymentError,
}: {
  orderId: string
  hasSessionId: boolean
  paymentError: string | null
}) => {
  const {
    order,
    isLoading,
    isError,
    isNotFound,
    errorMessage,
    refetch,
    isPollExhausted,
  } = useOrderDetail(orderId, {
    pollWhile: (current) => hasSessionId && isAwaitingPayment(current),
  })

  if (isLoading) return <Loading size="lg" label="Loading order" />

  if (isNotFound && !order) return <OrderSummaryUnavailable />

  if (isError && !order) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center md:px-6">
        <p className="text-on-surface-variant">{errorMessage}</p>
        <Button className="mt-6 w-auto px-8" onClick={() => void refetch()}>
          Try again
        </Button>
      </div>
    )
  }

  if (!order) return <OrderSummaryUnavailable />

  return (
    <OrderSuccessSummary
      order={order}
      payment={
        <OrderSuccessPayment
          order={order}
          hasSessionId={hasSessionId}
          paymentError={paymentError}
          isPollExhausted={isPollExhausted ?? false}
        />
      }
    />
  )
}

const OrderSuccessPageContent = () => {
  const searchParams = useSearchParams()
  const { itemSnapshots: snapshot } = useCartStore()
  const orderId = searchParams.get('orderId')

  if (orderId) {
    return (
      <OrderSuccessFromApi
        orderId={orderId}
        hasSessionId={
          Boolean(searchParams.get('session_id')) ||
          searchParams.get('payment') === 'pending'
        }
        paymentError={searchParams.get('paymentError')}
      />
    )
  }

  if (!isPlacedOrder(snapshot)) return <OrderSummaryUnavailable />

  return <OrderSuccessSummary order={snapshot} />
}

export default OrderSuccessPageContent
