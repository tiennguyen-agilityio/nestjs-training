import type {
  OrderPaymentStatus,
  OrderStatus,
  PaymentMethod as ApiPaymentMethod,
  PaymentStatus,
  PaymentType,
  ShippingStatus,
} from '@repo/constants'

import { type AddressSnapshot, type PaymentMethod } from './checkout'
import { type User } from './user'

export enum ORDER_STATUS {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum SHIPPING_STATUS {
  PENDING = 'PENDING',
  SHIPPING = 'SHIPPING',
  DELIVERED = 'DELIVERED',
  RETURNED = 'RETURNED',
}

export interface OrderItemPayload {
  productId: string
  variantId: string
  quantity: number
  unitPrice: number
}
export interface OrderItem extends OrderItemPayload {
  id: string
  productName: string
  productImage: string
  variantName: string
  finalPrice: number
  subTotal: number
  discountAmount: number
}

/** An order in the admin dashboard. */
export interface Order {
  shippingMethodId: string
  paymentMethod: PaymentMethod
  note?: string
  items: OrderItem[]
  id: string
  userId: string
  orderNumber: string
  status: ORDER_STATUS
  shippingStatus: SHIPPING_STATUS
  paymentStatus: ORDER_STATUS
  subTotal: number
  tax: number
  shippingFee: number
  totalAmount: number
  shippingMethodName: string
  addressSnapshot: AddressSnapshot
  user: User
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

/** A line of the API's `ResponseOrderDto` (`POST /orders`). */
export interface PlacedOrderItem {
  id: string
  productVariantId: string
  productName: string
  productImage: string
  variantName: string
  unitPrice: number
  discountAmount: number
  quantity: number
  lineTotal: number
}

/** A payment of the API's `ResponseOrderDto`. */
export interface PlacedOrderPayment {
  id: string
  orderId: string
  type: PaymentType
  method: ApiPaymentMethod
  status: PaymentStatus
  amount: number
  currency: string
  transactionId: string | null
  completedAt: string | null
  failureReason: string | null
  createdAt: string
  updatedAt: string
}

export interface PaymentCheckout {
  paymentId: string
  checkoutUrl: string
  expiresAt: string
}

/** The API's `ResponseOrderDto`: the order `POST /orders` saved. */
export interface PlacedOrder {
  id: string
  orderNumber: string
  userId: string
  shippingMethodId: string
  status: OrderStatus
  shippingStatus: ShippingStatus
  paymentStatus: OrderPaymentStatus
  recipientName: string
  recipientPhone: string
  addressLine: string
  ward: string
  district: string
  city: string
  postalCode: string
  shippingMethodName: string
  shippingFee: number
  tax: number
  subTotal: number
  totalAmount: number
  note: string | null
  expiresAt: string | null
  items: PlacedOrderItem[]
  payments: PlacedOrderPayment[]
  createdAt: string
  updatedAt: string
}

/** One row of `GET /orders` (OROW of the API design). */
export interface OrderSummary {
  id: string
  orderNumber: string
  userId: string
  customer: { firstName: string; lastName: string; email: string }
  status: OrderStatus
  shippingStatus: ShippingStatus
  paymentStatus: OrderPaymentStatus
  paymentMethod: ApiPaymentMethod | null
  itemCount: number
  totalAmount: number
  createdAt: string
}

/**
 * `GET /orders/{idOrOrderNumber}` returns the same `ResponseOrderDto` as
 * `POST /orders`, so the order details reuse its types.
 */
export type OrderDetail = PlacedOrder
export type OrderDetailItem = PlacedOrderItem
export type OrderPayment = PlacedOrderPayment
