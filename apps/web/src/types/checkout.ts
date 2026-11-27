export enum PAYMENT_METHOD {
  STRIPE = 'STRIPE',
  PAYPAL = 'PAYPAL',
  COD = 'COD',
}

export type PaymentMethod = PAYMENT_METHOD

export interface AddressSnapshot {
  firstName: string
  lastName: string
  phoneNumber: string
  addressLine: string
  city: string
  district: string
  ward: string
  postalCode: string
}

export interface CheckoutCardFormValues {
  cardNumber: string
  expiryDate: string
  cvc: string
}

export interface CheckoutFormValues
  extends AddressSnapshot, CheckoutCardFormValues {
  paymentMethod: PaymentMethod
}
