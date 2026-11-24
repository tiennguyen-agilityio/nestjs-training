import type {
  OrderPaymentStatus,
  OrderStatus,
  PaymentMethod as OrderPaymentMethod,
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

export interface OrderPayload {
  shippingMethodId: string
  paymentMethod: PaymentMethod
  shippingAddress: AddressSnapshot
  note?: string
  items: OrderItemPayload[]
}

export interface Order extends Omit<OrderPayload, 'shippingAddress'> {
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
  items: OrderItem[]
  user: User
  createdAt: string
  updatedAt: string
  deletedAt: string | null
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
  paymentMethod: OrderPaymentMethod | null
  itemCount: number
  totalAmount: number
  createdAt: string
}

export interface OrderDetailItem {
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

export interface OrderPayment {
  id: string
  orderId: string
  type: PaymentType
  method: OrderPaymentMethod
  status: PaymentStatus
  amount: number
  currency: string
  transactionId: string | null
  completedAt: string | null
  failureReason: string | null
  createdAt: string
  updatedAt: string
}

/** `GET /orders/{idOrOrderNumber}` (ORDER of the API design). */
export interface OrderDetail {
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
  items: OrderDetailItem[]
  payments: OrderPayment[]
  createdAt: string
  updatedAt: string
}
