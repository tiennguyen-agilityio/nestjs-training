export enum OrderStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum ShippingStatus {
  PENDING = 'PENDING',
  SHIPPING = 'SHIPPING',
  DELIVERED = 'DELIVERED',
  RETURNED = 'RETURNED',
}

export enum PaymentMethod {
  COD = 'COD',
  CARD = 'CARD',
  PAYPAL = 'PAYPAL',
}

export enum PaymentType {
  CHARGE = 'CHARGE',
  REFUND = 'REFUND',
}

export enum PaymentStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  FAILED = 'FAILED',
}

export enum OrderPaymentStatus {
  UNPAID = 'UNPAID',
  PENDING = 'PENDING',
  PAID = 'PAID',
  FAILED = 'FAILED',
  PARTIALLY_REFUNDED = 'PARTIALLY_REFUNDED',
  REFUNDED = 'REFUNDED',
}

export enum InventoryMovementType {
  RESERVE = 'RESERVE',
  RELEASE = 'RELEASE',
  SALE = 'SALE',
  RESTOCK = 'RESTOCK',
  ADJUSTMENT = 'ADJUSTMENT',
}

export enum StockLevel {
  OUT = 'OUT',
  LOW = 'LOW',
  OK = 'OK',
}
