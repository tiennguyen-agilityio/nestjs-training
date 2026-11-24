'use client'

import { useId, useState, type ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowRight } from 'lucide-react'
import { OrderStatus, PaymentType, ShippingStatus } from '@repo/constants'

// Types
import type { OrderDetail, OrderPayment } from '@/types/order'

// Constants
import { EMPTY_IMAGE } from '@/constants/images'
import {
  API_FALLBACK_ERRORS,
  DIALOG_MESSAGES,
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
} from '@/constants/messages'
import { PAYMENT_METHOD_LABELS } from '@/constants/order'
import { ROUTES, dashboardOrderPath } from '@/constants/routes'

// Hooks
import { useCancelOrder, useOrderDetail } from '@/hooks/useOrder'

// Utils
import { cn } from '@/utils/styles'
import { formatPrice } from '@/utils/common'
import {
  formatOrderDateTime,
  getCancelOrderErrorMessage,
  getOrderStatusPresentation,
  getPaymentStatusPresentation,
  getShippingStatusPresentation,
} from '@/utils/order'

// Components
import { Button } from '@/components/ui/button'
import Loading from '@/components/Loading'
import ConfirmActionDialog from '@/components/ConfirmActionDialog'
import PageHeader from '@/components/PageHeader'

export interface OrderDetailPageContentProps {
  className?: string
  /** `dashboard`: the admin's page (breadcrumbs, Customer panel, no Cancel panel). */
  variant?: 'profile' | 'dashboard'
}

const PILL_CLASS = 'inline-flex rounded-full px-3 py-1 text-xs font-semibold'

const ORDER_STEPS = [
  OrderStatus.PENDING,
  OrderStatus.CONFIRMED,
  OrderStatus.COMPLETED,
] as const

const shippingStepsOf = (status: ShippingStatus): ShippingStatus[] => [
  ShippingStatus.PENDING,
  ShippingStatus.SHIPPING,
  status === ShippingStatus.RETURNED
    ? ShippingStatus.RETURNED
    : ShippingStatus.DELIVERED,
]

/** The newest CHARGE (by createdAt): the payment the panel describes. */
const newestChargeOf = (payments: OrderPayment[]): OrderPayment | undefined =>
  payments
    .filter(({ type }: { type: PaymentType }) => type === PaymentType.CHARGE)
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )[0]

function Panel({
  title,
  aside,
  children,
}: {
  title: string
  aside?: ReactNode
  children: ReactNode
}) {
  const headingId = useId()
  return (
    <section
      aria-labelledby={headingId}
      className="flex min-w-0 flex-col gap-4 rounded-xl bg-surface-container-low p-6"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={headingId} className="font-semibold text-on-surface">
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  )
}

function Steps<T extends string>({
  label,
  steps,
  current,
  labelOf,
}: {
  label: string
  steps: readonly T[]
  current: T
  labelOf: (step: T) => string
}) {
  const currentIndex = steps.indexOf(current)
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="w-20 text-on-surface-variant">{label}</span>
      {steps.map((step, index) => (
        <span key={step} className="flex items-center gap-2">
          {index > 0 && (
            <ArrowRight
              className="size-3 text-on-surface-variant"
              aria-hidden
            />
          )}
          <span
            aria-current={index === currentIndex ? 'step' : undefined}
            className={cn(
              'rounded-full px-3 py-1 font-semibold',
              index === currentIndex
                ? 'bg-primary text-on-primary'
                : index < currentIndex
                  ? 'bg-secondary-container text-on-secondary-container'
                  : 'bg-surface-container text-on-surface-variant',
            )}
          >
            {labelOf(step)}
          </span>
        </span>
      ))}
    </div>
  )
}

function ItemsPanel({ order }: { order: OrderDetail }) {
  return (
    <Panel
      title="Items"
      aside={
        <span className="text-xs text-on-surface-variant">
          Names and prices copied when the order was placed
        </span>
      }
    >
      <ul className="flex flex-col gap-4">
        {order.items.map((item) => {
          const salePrice = item.unitPrice - item.discountAmount
          return (
            <li key={item.id} className="flex items-center gap-4">
              <Image
                src={item.productImage || EMPTY_IMAGE}
                alt={item.productName}
                width={56}
                height={56}
                className="size-14 shrink-0 rounded-lg object-cover"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-on-surface">
                  {item.productName}
                </p>
                <p className="text-sm text-on-surface-variant">
                  {item.variantName} · {formatPrice(salePrice)}
                  {item.discountAmount > 0 && (
                    <>
                      {' '}
                      <s>{formatPrice(item.unitPrice)}</s>
                    </>
                  )}{' '}
                  × {item.quantity}
                </p>
              </div>
              <p className="font-semibold text-on-surface">
                {formatPrice(item.lineTotal)}
              </p>
            </li>
          )
        })}
      </ul>
      <div className="flex flex-col gap-2 border-t border-outline-variant/40 pt-4 text-sm">
        {(
          [
            ['Subtotal', order.subTotal],
            [`Shipping · ${order.shippingMethodName}`, order.shippingFee],
            ['VAT (10%)', order.tax],
          ] as const
        ).map(([label, amount]) => (
          <div key={label} className="flex justify-between gap-4">
            <span className="text-on-surface-variant">{label}</span>
            <span>{formatPrice(amount)}</span>
          </div>
        ))}
        <div className="mt-2 flex justify-between gap-4 border-t border-outline-variant/40 pt-3 text-base font-bold">
          <span>Total amount</span>
          <span className="text-primary">{formatPrice(order.totalAmount)}</span>
        </div>
      </div>
    </Panel>
  )
}

function ProgressPanel({ order }: { order: OrderDetail }) {
  const isCancelled = order.status === OrderStatus.CANCELLED
  return (
    <Panel title="Progress">
      {isCancelled ? (
        <div className="flex flex-col gap-3 text-sm">
          <div className="flex items-center gap-2">
            <span className="w-20 text-on-surface-variant">Order</span>
            <span
              aria-current="step"
              className={cn(
                PILL_CLASS,
                getOrderStatusPresentation(order.status).badgeClassName,
              )}
            >
              Cancelled
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-20 text-on-surface-variant">Shipping</span>
            <span>—</span>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <Steps
            label="Order"
            steps={ORDER_STEPS}
            current={order.status}
            labelOf={(step) => getOrderStatusPresentation(step).label}
          />
          <Steps
            label="Shipping"
            steps={shippingStepsOf(order.shippingStatus)}
            current={order.shippingStatus}
            labelOf={(step) => getShippingStatusPresentation(step).label}
          />
        </div>
      )}
    </Panel>
  )
}

function PaymentPanel({ order }: { order: OrderDetail }) {
  const charge = newestChargeOf(order.payments)
  const status = getPaymentStatusPresentation(order.paymentStatus)
  const rows: [string, ReactNode][] = [
    ['Method', charge ? PAYMENT_METHOD_LABELS[charge.method] : '—'],
    [
      'Status',
      <span key="status" className={cn(PILL_CLASS, status.badgeClassName)}>
        {status.label}
      </span>,
    ],
    ['Amount', formatPrice(order.totalAmount)],
    ['Transaction', charge?.transactionId ?? '—'],
    [
      'Paid at',
      charge?.completedAt ? formatOrderDateTime(charge.completedAt) : '—',
    ],
  ]

  return (
    <Panel title="Payment">
      <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-on-surface-variant">{label}</dt>
            <dd className="break-words">{value}</dd>
          </div>
        ))}
      </dl>
      {order.payments.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-outline-variant/40">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-container text-xs uppercase tracking-wider text-on-surface-variant">
              <tr>
                <th className="px-3 py-2 font-semibold">Record</th>
                <th className="px-3 py-2 font-semibold">Status</th>
                <th className="px-3 py-2 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {order.payments.map((payment) => {
                const isRefund = payment.type === PaymentType.REFUND
                return (
                  <tr
                    key={payment.id}
                    className="border-t border-outline-variant/40"
                  >
                    <td className="px-3 py-2">
                      {isRefund ? 'Refund' : 'Charge'} ·{' '}
                      {PAYMENT_METHOD_LABELS[payment.method]}
                      <span className="block text-xs text-on-surface-variant">
                        {formatOrderDateTime(payment.createdAt)}
                        {payment.failureReason
                          ? ` · ${payment.failureReason}`
                          : ''}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {payment.status.charAt(0) +
                        payment.status.slice(1).toLowerCase()}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {isRefund ? '−' : ''}
                      {formatPrice(payment.amount)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  )
}

function ShipToPanel({ order }: { order: OrderDetail }) {
  return (
    <Panel title="Ship to">
      <div className="flex flex-col gap-1 text-sm">
        <p className="break-words">
          {order.recipientName} · {order.recipientPhone}
        </p>
        <p className="break-words text-on-surface-variant">
          {[
            order.addressLine,
            order.ward,
            order.district,
            order.city,
            order.postalCode,
          ].join(', ')}
        </p>
        {order.note && (
          <p className="break-words text-on-surface-variant">
            Note: {order.note}
          </p>
        )}
      </div>
    </Panel>
  )
}

/** Cancels a PENDING order after a confirm; other statuses get a line of text. */
function CancelPanel({ order }: { order: OrderDetail }) {
  const [confirming, setConfirming] = useState<OrderDetail | null>(null)
  const { mutate, isPending } = useCancelOrder()

  return (
    <Panel title="Cancel order">
      {order.status === OrderStatus.PENDING ? (
        <>
          <p className="text-sm text-on-surface-variant">
            You can cancel while the order is still pending. Its items go back
            into stock.
          </p>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => setConfirming(order)}
          >
            {DIALOG_MESSAGES.ORDER.CANCEL.ACTION}
          </Button>
        </>
      ) : order.status === OrderStatus.CANCELLED ? (
        <p className="text-sm text-on-surface-variant">
          This order has been cancelled.
        </p>
      ) : (
        <p className="text-sm text-on-surface-variant">
          Cannot be cancelled: the order is{' '}
          {getOrderStatusPresentation(order.status).label.toLowerCase()}.
        </p>
      )}
      {/* Stays mounted while open: a 409's refetch can move the order out of PENDING. */}
      <ConfirmActionDialog
        item={confirming}
        onClose={() => setConfirming(null)}
        mutate={mutate}
        isPending={isPending}
        successMessage={SUCCESS_MESSAGES.ORDER_CANCELLED}
        title={DIALOG_MESSAGES.ORDER.CANCEL.TITLE}
        renderDescription={(current) =>
          DIALOG_MESSAGES.ORDER.CANCEL.DESCRIPTION(
            current?.orderNumber ?? order.orderNumber,
          )
        }
        textAction={DIALOG_MESSAGES.ORDER.CANCEL.ACTION}
        textCancel={DIALOG_MESSAGES.ORDER.CANCEL.KEEP}
        actionVariant="destructive"
        formatError={getCancelOrderErrorMessage}
      />
    </Panel>
  )
}

function CustomerPanel({ order }: { order: OrderDetail }) {
  const { firstName, lastName, email } = order.customer
  return (
    <Panel title="Customer">
      <div className="flex flex-col gap-1 text-sm">
        <p className="break-words font-semibold">
          {[firstName, lastName].filter(Boolean).join(' ')}
        </p>
        <p className="break-words text-on-surface-variant">{email}</p>
      </div>
    </Panel>
  )
}

function BackToOrdersLink() {
  return (
    <Link
      href={ROUTES.DASHBOARD_ORDERS}
      className="text-xs font-semibold uppercase tracking-widest text-primary underline-offset-4 hover:underline"
    >
      Back to orders
    </Link>
  )
}

function ProfileLink() {
  return (
    <Link
      href={ROUTES.USER_PROFILE}
      className="text-xs font-semibold uppercase tracking-widest text-primary underline-offset-4 hover:underline"
    >
      Profile
    </Link>
  )
}

export default function OrderDetailPageContent({
  className,
  variant = 'profile',
}: OrderDetailPageContentProps) {
  const { orderNumber = '' } = useParams<{ orderNumber: string }>()
  const { order, isLoading, isError, isNotFound, errorMessage, refetch } =
    useOrderDetail(orderNumber || null)
  const isDashboard = variant === 'dashboard'
  const BackLink = isDashboard ? BackToOrdersLink : ProfileLink

  return (
    <div
      className={cn(
        !isDashboard && 'bg-background text-on-background',
        className,
      )}
    >
      <div
        className={cn(
          !isDashboard && 'mx-auto max-w-7xl px-8 pb-24 pt-16 md:pt-20',
        )}
      >
        {isLoading ? (
          <Loading size="lg" label="Loading order" />
        ) : isNotFound ? (
          <div className="flex flex-col items-start gap-4">
            <BackLink />
            <p className="text-lg text-on-surface">
              {ERROR_MESSAGES.ORDER_NOT_FOUND}
            </p>
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <p className="text-sm text-destructive" role="alert">
              {errorMessage?.trim()
                ? errorMessage
                : API_FALLBACK_ERRORS.ORDER_LOAD}
            </p>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={() => void refetch()}
            >
              Retry
            </Button>
          </div>
        ) : order ? (
          <>
            {isDashboard ? (
              <div className="mb-6 flex flex-col gap-4">
                <PageHeader
                  breadcrumbItems={[
                    { label: 'Dashboard', href: ROUTES.DASHBOARD },
                    { label: 'Orders', href: ROUTES.DASHBOARD_ORDERS },
                    {
                      label: `#${order.orderNumber}`,
                      href: dashboardOrderPath(order.orderNumber),
                    },
                  ]}
                  title={
                    <>
                      Order{' '}
                      <span className="font-mono">{order.orderNumber}</span>
                    </>
                  }
                  description={`Placed ${formatOrderDateTime(order.createdAt)}`}
                />
                <BackToOrdersLink />
              </div>
            ) : (
              <header className="mb-10 flex flex-col gap-2">
                <ProfileLink />
                <h1 className="font-headline text-4xl text-on-surface md:text-5xl">
                  Order <span className="font-mono">{order.orderNumber}</span>
                </h1>
                <p className="text-on-surface-variant">
                  Placed {formatOrderDateTime(order.createdAt)}
                </p>
              </header>
            )}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
              <div className="flex min-w-0 flex-col gap-6">
                <ItemsPanel order={order} />
                <ProgressPanel order={order} />
              </div>
              <div className="flex min-w-0 flex-col gap-6">
                {isDashboard && <CustomerPanel order={order} />}
                <PaymentPanel order={order} />
                <ShipToPanel order={order} />
                {!isDashboard && <CancelPanel order={order} />}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
