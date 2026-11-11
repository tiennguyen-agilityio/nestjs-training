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
  PRODUCT_VARIANT: {
    NOT_FOUND: 'Product variant not found',
    SKU_EXISTS: 'SKU already exists',
    MAX_FIXED_DISCOUNT_VALUE: DISCOUNT_FIXED_MESSAGE,
    MAX_PERCENT_DISCOUNT_VALUE: DISCOUNT_PERCENT_MESSAGE,
    DUPLICATE_IDS: 'Each variant may appear only once in updateVariants',
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
      'Required. A client-generated key (1–255 printable ASCII, e.g. a UUID): a new one for each create, the same one when retrying it. A repeat after success replays the original 201 with `Idempotent-Replayed: true` instead of creating a second record. A missing or malformed key gets 400 `invalidRequest`; the same key while the first request still runs gets 409 `duplicateResource` with `Retry-After`.',
  },
  AUTH_PROVIDER: {
    TIMEOUT:
      'Clerk did not answer in time. The change may still apply; check the user before retrying.',
    UNAVAILABLE:
      'Clerk keeps failing, so calls to it are paused. Retry after the time given in the Retry-After header.',
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
  },
  PRODUCT_IMAGE: {
    NOT_FOUND: 'The image might have been deleted, or the id is incorrect.',
  },
  PAGINATION: {
    PAGE_OUT_OF_RANGE: (pageCount: number) =>
      `The requested page exceeds the available range of ${pageCount} page(s).`,
  },
} as const;
