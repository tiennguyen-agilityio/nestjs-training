import { VALIDATION_RULES } from '@repo/constants'

export const ERROR_MESSAGES = {
  ORDER_NOT_FOUND: 'Order not found.',
  IDENTIFIER_REQUIRED: 'Enter your email address',
  IDENTIFIER_EMAIL_INVALID: 'Enter a valid email address',
  PASSWORD_REQUIRED: 'Enter your password',
  EMAIL_ADDRESS_REQUIRED: 'Enter your email address',
  EMAIL_ADDRESS_INVALID: 'Enter a valid email address',
  PASSWORD_MIN_LENGTH: 'Password must be at least 8 characters',
  FIRST_NAME_REQUIRED: 'Enter your first name',
  LAST_NAME_REQUIRED: 'Enter your last name',
  SOMETHING_WENT_WRONG: 'Something went wrong',
  SIGN_OUT_FAILED: 'Logout failed. Something went wrong.',
  UNEXPECTED_PROFILE_RESPONSE: 'Unexpected profile response',
  NETWORK_ERROR: 'Network error',
  FIELD_REQUIRED: 'This field is required',
  SHIPPING_METHOD_ID_MISSING: 'Missing shipping method id.',
  IMAGE_UPLOAD_NOT_CONFIGURED: 'Image upload is not configured',
  PRODUCT_AVATAR_REQUIRED: 'Main hero image is required',
  PRODUCT_GALLERY_REQUIRED: 'At least one gallery image is required',
  ADDRESS_REQUIRED: 'Enter your delivery address',
  PHONE_NUMBER_REQUIRED: 'Enter your phone number',
  CITY_REQUIRED: 'Enter your city',
  DISTRICT_REQUIRED: 'Enter your district',
  WARD_REQUIRED: 'Enter your ward',
  POSTAL_CODE_REQUIRED: 'Enter your postal code',
  CARD_NUMBER_REQUIRED: 'Enter your card number',
  CARD_NUMBER_INVALID: 'Enter a valid card number',
  EXPIRY_DATE_REQUIRED: 'Enter your expiry date',
  EXPIRY_DATE_INVALID: 'Enter expiry date as MM/YY',
  CVC_REQUIRED: 'Enter your CVC',
  CVC_INVALID: 'Enter a valid CVC',
  PROFILE_SYNC_DELAYED:
    'Saved, but syncing your profile is taking longer than expected. Refresh in a moment to confirm.',
  CART_MERGE_ADJUSTED: 'Some items changed when your cart was merged: ',
  CART_MERGE_LOWERED: (name: string, quantity: number) =>
    `${name} (only ${quantity} left)`,
  CART_MERGE_SKIPPED: (name: string) => `${name} (out of stock)`,
  CART_LINE_EXCEEDS_STOCK: (left: number, have: number) =>
    `Only ${left} left · you have ${have}`,
  ORDER_LINE_ERROR:
    'This item cannot be ordered. Update your cart and try again.',
  ORDER_OUT_OF_STOCK: (names: string) =>
    `${names} is out of stock in the quantity you chose. Update your cart and try again.`,
  ORDER_ITEM_UNAVAILABLE: (names: string) =>
    `${names} can no longer be bought. Remove it from your cart and try again.`,
  ORDER_ITEMS_CHANGED:
    'Some items in your cart changed. Review your cart and try again.',
  ORDER_CART_EMPTY: 'Your cart is empty. Add an item before checking out.',
  ORDER_SHIPPING_METHOD_UNAVAILABLE:
    'This shipping method is no longer available. Choose another one.',
  PAYMENT_ORDER_EXPIRED: 'The time to pay for this order has passed.',
  PAYMENT_NOT_PAYABLE: 'This order cannot be paid now.',
  PAYMENT_GATEWAY_UNAVAILABLE:
    'The payment provider cannot be reached. Try again in a moment.',
  PAYMENT_GATEWAY_REJECTED: 'The payment provider refused this payment.',
  PAYMENT_METHOD_UNAVAILABLE:
    'Online payment is not available for this method yet.',
} as const

// Form validation copy shown by the web forms, in place of the packages'
// API-style VALIDATION_MESSAGES / DISCOUNT_*_MESSAGE (DTO field names): the
// label is the one the user sees. The rules themselves come from the packages.
export const FORM_MESSAGES = {
  minLength: (label: string, minimum: number) =>
    `${label} must be at least ${minimum} characters`,
  maxLength: (label: string, maximum: number) =>
    `${label} must be at most ${maximum} characters`,
  min: (label: string, minimum: number | string) =>
    `${label} must be at least ${minimum}`,
  max: (label: string, maximum: number | string) =>
    `${label} must be at most ${maximum}`,
  isInt: (label: string) => `${label} must be a whole number`,
  maxDecimals: (label: string, places: number) =>
    `${label} must have at most ${places} decimal places`,
  DISCOUNT_PERCENT: `Discount must be less than ${VALIDATION_RULES.DISCOUNT.PERCENT_MAX}%`,
  DISCOUNT_FIXED: 'Discount must be less than the base price',
} as const

export const API_FALLBACK_ERRORS = {
  CATEGORY_CREATE: 'Could not create category',
  CATEGORY_DELETE: 'Could not delete category',
  CATEGORY_LOAD: 'Could not load category',
  CATEGORY_UPDATE: 'Could not update category',
  CATEGORY_RESTORE: 'Could not restore category. Please try later',
  CATEGORIES_LOAD: 'Could not load categories',
  PRODUCT_CREATE: 'Could not create product',
  PRODUCT_DELETE: 'Could not delete product',
  PRODUCT_LOAD: 'Could not load product',
  PRODUCT_UPDATE: 'Could not update product',
  PRODUCTS_LOAD: 'Could not load products',
  IMAGE_UPLOAD: 'Could not upload image',
  USERS_LOAD: 'Could not load users',
  USER_DELETE: 'Could not delete user',
  USER_UPDATE: 'Could not update user',
  PROFILE_LOAD: 'Could not load profile',
  ORDER_CREATE: 'Could not place order',
  ORDER_DELETE: 'Could not delete order',
  ORDER_STATUS_UPDATE: 'Could not update order status',
  ORDER_SHIPPING_STATUS_UPDATE: 'Could not update shipping status',
  ORDERS_LOAD: 'Could not load orders',
  ORDER_LOAD: 'Could not load order',
  PAYMENT_START: 'Could not start the payment. Try again.',
  SHIPPING_METHODS_LOAD: 'Could not load shipping methods',
  SHIPPING_METHOD_LOAD: 'Could not load shipping method',
  SHIPPING_METHOD_CREATE: 'Could not create shipping method',
  SHIPPING_METHOD_UPDATE: 'Could not update shipping method',
  SHIPPING_METHOD_DELETE: 'Could not delete shipping method',
  CART_LOAD: 'Could not load your cart',
  CART_ADD: 'Could not add to cart',
  CART_UPDATE: 'Could not update the cart',
  CART_REMOVE: 'Could not remove the item',
  CART_MERGE: 'Could not merge your cart',
} as const

export const SUCCESS_MESSAGES = {
  ORDER_PLACED: 'Order placed successfully',
  ORDER_TOTAL: (total: string) => `Order total: ${total}`,
  SIGNED_OUT: 'Signed out successfully',
  CATEGORY_CREATED: 'Category created',
  CATEGORY_UPDATED: 'Category updated',
  CATEGORY_DELETED: 'Category removed',
  CATEGORY_RESTORED: 'Category restored',
  PRODUCT_CREATED: 'Product created',
  PRODUCT_UPDATED: 'Product updated',
  PRODUCT_DELETED: 'Product removed',
  ORDER_DELETED: 'Order removed',
  ORDER_STATUS_UPDATED: 'Order status updated',
  ORDER_SHIPPING_STATUS_UPDATED: 'Shipping status updated',
  USER_ROLE_UPDATED: 'User role updated',
  USER_DELETED: 'User removed',
  PROFILE_UPDATED: 'Profile updated',
  DRAFT_DISCARDED: 'Draft discarded',
  SHIPPING_METHOD_CREATED: 'Shipping method created',
  SHIPPING_METHOD_UPDATED: 'Shipping method updated',
  SHIPPING_METHOD_DELETED: 'Shipping method removed',
  SHIPPING_METHOD_ACTIVATED: 'Shipping method activated',
  SHIPPING_METHOD_DEACTIVATED: 'Shipping method deactivated',
  CART_MERGED: (count: number) =>
    `Your device cart was merged into your account cart (${count} item${count === 1 ? '' : 's'})`,
}

// Notices shown in place of a page's content.
export const NOTICE_MESSAGES = {
  PRODUCT_DELETED: {
    MESSAGE: 'This product has been deleted, so it can no longer be edited.',
    ACTION: 'Back to products',
  },
  SHIPPING_METHODS_EMPTY: {
    MESSAGE: 'No delivery options available right now.',
  },
  SHIPPING_METHOD_DELETED_LOCKED: 'Deleted shipping methods cannot be modified',
  ORDER_PAYMENT: {
    PAID: 'Payment received.',
    CONFIRMING: 'Confirming your payment…',
    STILL_CONFIRMING:
      'We are still confirming your payment. Refresh this page in a moment.',
    NOT_COMPLETED: 'Payment not completed.',
    FAILED: 'Payment failed. Try another card.',
  },
}

export const DIALOG_MESSAGES = {
  CATEGORY: {
    DELETE: {
      ACTION: 'Remove',
      DESCRIPTION: (name: string) => `This will remove ${name}.`,
    },
  },
  PRODUCT: {
    DELETE: {
      ACTION: 'Delete Product',
      DESCRIPTION:
        'Are you sure you want to delete this product? This action cannot be undone.',
    },
  },
  ORDER: {
    DELETE: {
      ACTION: 'Delete order',
      DESCRIPTION: (orderLabel: string) =>
        `Are you sure you want to delete order ${orderLabel}? This action cannot be undone.`,
    },
  },
  SHIPPING_METHOD: {
    DELETE: {
      TITLE: 'Remove this shipping method?',
      ACTION: 'Delete',
    },
  },
  USER: {
    DELETE: {
      ACTION: 'Delete user',
      DESCRIPTION: (userLabel: string) =>
        `Are you sure you want to delete ${userLabel}? This action cannot be undone.`,
    },
  },
}
