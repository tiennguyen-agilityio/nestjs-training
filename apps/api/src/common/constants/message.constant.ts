import {
  DISCOUNT_FIXED_MESSAGE,
  DISCOUNT_PERCENT_MESSAGE,
} from '@repo/schemas';

export const ERROR_MESSAGES = {
  IDEMPOTENCY: {
    // Sent by @nestjs/idempotency itself; kept here for the Swagger docs.
    KEY_REQUIRED: 'An idempotency key is required for this operation.',
    KEY_REUSED:
      'This idempotency key was already used for a different request.',
  },
  USER: {
    EMAIL_EXISTS: 'Email already exists',
    CLERK_ID_EXISTS: 'Clerk id already exists',
    NOT_FOUND: 'User not found',
  },
  PAGINATION: {
    PAGE_OUT_OF_RANGE: 'Requested page exceeds the available range',
  },
  WEBHOOK: {
    INVALID_SIGNATURE: 'Invalid webhook signature',
  },
  AUTH_PROVIDER: {
    TIMEOUT: 'Auth provider did not respond in time',
    UNAVAILABLE: 'Auth provider is temporarily unavailable',
  },
  HEALTH: {
    SERVICE_UNAVAILABLE: 'A required dependency is unavailable',
    SHUTTING_DOWN: 'The service is shutting down',
  },
  AUTH: {
    UNAUTHENTICATED: 'Authentication required',
    INACTIVE_ACCOUNT: 'Account is inactive',
    FORBIDDEN: 'You do not have permission to perform this action',
  },
  CATEGORY: {
    NOT_FOUND: 'Category not found',
    NAME_EXISTS: 'Category name already exists',
    HAS_PRODUCTS: 'Category still has products',
    NOT_DELETED: 'Category is not deleted',
  },
  PRODUCT_IMAGE: {
    NOT_FOUND: 'Product image not found',
  },
  CART: {
    OUT_OF_STOCK: (stock: number) => `Only ${stock} left for this variant`,
  },
  CART_ITEM: {
    NOT_FOUND: 'Cart item not found',
  },
  ORDER: {
    NOT_FOUND: 'Order not found',
    CART_EMPTY: 'Cart is empty',
    SHIPPING_METHOD_UNAVAILABLE: 'Shipping method is not available',
    ITEM_UNAVAILABLE: 'This item can no longer be bought',
    OUT_OF_STOCK: (available: number, sku: string) =>
      `Only ${available} left for ${sku}`,
    NOT_CANCELLABLE: (state: string) =>
      `Order cannot be cancelled: it is ${state}`,
  },
  PAYMENT: {
    METHOD_NOT_ONLINE: 'This order is paid on delivery, not online',
    METHOD_UNAVAILABLE: 'Online payment is not available for this method yet',
    NOT_PAYABLE: 'This order cannot be paid now',
    ORDER_EXPIRED: 'The time to pay for this order has passed',
    GATEWAY_UNAVAILABLE: 'The payment provider cannot be reached',
    GATEWAY_REJECTED: 'The payment provider refused this payment',
    INVALID_SIGNATURE: 'Webhook signature is invalid',
  },
  SHIPPING_METHOD: {
    NOT_FOUND: 'Shipping method not found',
    NAME_EXISTS: 'Shipping method name already exists',
    IN_USE: 'Shipping method is used by orders',
  },
  PRODUCT_VARIANT: {
    NOT_FOUND: 'Product variant not found',
    SKU_EXISTS: 'SKU already exists',
    MAX_FIXED_DISCOUNT_VALUE: DISCOUNT_FIXED_MESSAGE,
    MAX_PERCENT_DISCOUNT_VALUE: DISCOUNT_PERCENT_MESSAGE,
    DUPLICATE_IDS: 'Each variant may appear only once in updateVariants',
    STOCK_BELOW_RESERVED: (reserved: number) =>
      `Stock cannot be below the ${reserved} units held for orders`,
    STOCK_ABOVE_MAX: (max: number) => `Stock cannot be above ${max} units`,
  },
  PRODUCT: {
    NOT_FOUND: 'Product not found',
    NAME_EXISTS: 'Product name already exists',
    INVALID_IMAGE_IDS: 'One or more images do not belong to this product',
    TOO_MANY_IMAGES: (max: number) =>
      `A product can have at most ${max} images`,
    MULTIPLE_PRIMARY_IMAGES: 'A product can have only one primary image',
    INVALID_PRICE_RANGE: 'MinPrice must not be greater than MaxPrice',
    PRIMARY_IMAGE_REQUIRED: 'Exactly one image must be marked as primary',
    DUPLICATE_SORT_ORDERS: 'Images must have unique sortOrder values',
    TOO_FEW_IMAGES: (min: number) => `A product needs at least ${min} images`,
  },
  EXCEPTION: {
    BAD_REQUEST: 'Bad request',
    UNAUTHORIZED: 'Unauthorized',
    FORBIDDEN: 'Forbidden',
    ITEM_NOT_FOUND: 'Item not found',
    CONFLICT: 'Conflict',
    VALIDATION_FAILED: 'Validation failed',
    SYSTEM_ERROR: 'System error',
    GATEWAY_TIMEOUT: 'Gateway timeout',
    SERVICE_UNAVAILABLE: 'Service unavailable',
    INTERNAL_ERROR: 'An unexpected error occurred. Please try again later.',
  },
} as const;

export const ERROR_DESCRIPTIONS = {
  IDEMPOTENCY: {
    HEADER:
      'A new UUID for each create; reuse it only to retry the same request (the retry returns the first 201). Same key while the first request runs: 409.',
  },
  AUTH_PROVIDER: {
    TIMEOUT:
      'Clerk did not answer in time. The change may still apply; check the user before retrying.',
    UNAVAILABLE:
      'Clerk keeps failing, so calls to it are paused. Retry after the time given in the Retry-After header.',
  },
  HEALTH: {
    SERVICE_UNAVAILABLE:
      'A health check failed, so this instance should not receive traffic. Retry later.',
    SHUTTING_DOWN:
      'This instance received a termination signal and is draining. Send traffic to another instance.',
  },
  CATEGORY: {
    NAME_EXISTS: 'A category with this name already exists.',
    NOT_FOUND: 'The category might have been deleted, or the id is incorrect.',
    HAS_PRODUCTS:
      'Move or delete the products in this category before deleting it.',
    NOT_DELETED: 'Only a deleted category can be restored.',
  },
  USER: {
    EMAIL_EXISTS: 'An account with this email already exists.',
    CLERK_ID_EXISTS: 'An account linked to this Clerk id already exists.',
    NOT_FOUND_BY_ID:
      'The user might have been deleted, or the id is incorrect.',
    NOT_FOUND_BY_CLERK_ID:
      'The user might have been deleted, or the clerk id is incorrect.',
  },
  PRODUCT: {
    NAME_EXISTS: 'A product with this name already exists.',
    NOT_FOUND: 'The product might have been deleted, or the id is incorrect.',
    TOO_FEW_IMAGES: 'Keep at least 2 images: add one before removing another.',
  },
  PRODUCT_VARIANT: {
    SKU_EXISTS:
      'A variant with this SKU already exists. Please choose a different SKU.',
    NOT_FOUND: 'The variant might have been deleted, or the id is incorrect.',
    MAX_FIXED_DISCOUNT_VALUE:
      'A fixed discount must leave a selling price above 0. Lower the discount or raise the price.',
    MAX_PERCENT_DISCOUNT_VALUE:
      'A percent discount must be below 100. Lower the discount value.',
    DUPLICATE_IDS:
      'The same variant id is listed more than once. Send each variant once.',
    STOCK_BELOW_RESERVED:
      'Placed orders hold part of this stock. Set the stock to at least the held amount.',
    STOCK_ABOVE_MAX: 'Stock has an upper limit. Lower the quantity.',
  },
  PRODUCT_IMAGE: {
    NOT_FOUND: 'The image might have been deleted, or the id is incorrect.',
  },
  CART: {
    ADD_UP_TO: (remaining: number) => `You can add ${remaining} more.`,
    NO_MORE_TO_ADD: 'No more of this variant can be added.',
    LOWER_TO: (stock: number) => `Lower the quantity to ${stock} or less.`,
    OUT_OF_STOCK_REMOVE:
      'This variant is out of stock; remove it from the cart.',
  },
  CART_ITEM: {
    NOT_FOUND: 'The item might have been removed, or the id is incorrect.',
  },
  ORDER: {
    NOT_FOUND:
      'The order might not exist, or the id or order number is incorrect.',
    CART_EMPTY: 'Add an item before checking out.',
    SHIPPING_METHOD_UNAVAILABLE:
      'The method does not exist or is not ACTIVE. Pick another method.',
    ITEM_UNAVAILABLE: 'Remove it from the cart and try again.',
    OUT_OF_STOCK: 'Update your cart and try again.',
    NOT_CANCELLABLE:
      'Only a pending order can be cancelled. Contact the shop to cancel a confirmed order.',
    NOT_CANCELLABLE_PAID:
      'The order is already paid. Contact the shop to cancel it.',
  },
  PAYMENT: {
    METHOD_NOT_ONLINE: 'Only CARD and PAYPAL orders are paid online.',
    METHOD_UNAVAILABLE: 'Pick another payment method for new orders.',
    NOT_PAYABLE:
      'The order is already paid, no longer pending, or its payment session has closed.',
    ORDER_EXPIRED: 'Place a new order.',
    GATEWAY_UNAVAILABLE: 'Try again in a moment.',
    GATEWAY_REJECTED: 'Check the order total: Stripe charges at least $0.50.',
    INVALID_SIGNATURE: 'The request was not signed with the endpoint secret.',
  },
  SHIPPING_METHOD: {
    NOT_FOUND:
      'The shipping method might have been deleted, or the id is incorrect.',
    NAME_EXISTS: 'A shipping method with this name already exists.',
    IN_USE: 'Set its status to INACTIVE instead.',
  },
  PAGINATION: {
    PAGE_OUT_OF_RANGE: (pageCount: number) =>
      `The requested page exceeds the available range of ${pageCount} page(s).`,
  },
} as const;
