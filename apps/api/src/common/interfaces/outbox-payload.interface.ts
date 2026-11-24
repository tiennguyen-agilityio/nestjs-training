import type { PaymentMethod } from '@repo/constants';

/**
 * `user.role-sync`: push this user's role to the auth provider. Only the id:
 * the handler reads the role the user has when the message is delivered.
 */
export interface UserRoleSyncPayload {
  clerkId: string;
}

/**
 * `payment.checkout-expire`: close the gateway's checkout session of a charge
 * whose order was cancelled, so it can no longer be paid.
 */
export interface PaymentCheckoutExpirePayload {
  paymentId: string;
  method: PaymentMethod;
  checkoutSessionId: string;
}
