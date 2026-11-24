import { VALIDATION_RULES } from '@repo/constants'

export const ERROR_MESSAGES = {
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
  SHIPPING_METHODS_LOAD: 'Could not load delivery options',
} as const

export const SUCCESS_MESSAGES = {
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
  USER: {
    DELETE: {
      ACTION: 'Delete user',
      DESCRIPTION: (userLabel: string) =>
        `Are you sure you want to delete ${userLabel}? This action cannot be undone.`,
    },
  },
}
