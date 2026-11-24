const MAX_DECIMAL = 99999999.99;

export const VALIDATION_RULES = {
  NAME: {
    MIN_LENGTH: 2,
    MAX_LENGTH: 120,
  },
  SKU: {
    MIN_LENGTH: 1,
    MAX_LENGTH: 255,
  },
  IMAGE: {
    MIN_COUNT: 2,
    MAX_COUNT: 6,
    MIN_SORT_ORDER: 0,
    MAX_SORT_ORDER: 5,
  },
  VARIANT: {
    MIN_COUNT: 1,
  },
  STOCK_QUANTITY: {
    MIN: 0,
  },
  CART_QUANTITY: {
    MIN: 1,
  },
  PRICE: {
    MIN: 1,
    MAX: MAX_DECIMAL,
  },
  SIZE: {
    MIN: 1,
    MAX: MAX_DECIMAL,
  },
  DISCOUNT: {
    MIN: 0,
    MAX: MAX_DECIMAL,
    PERCENT_MAX: 100,
  },
  // A shipping fee may be 0 (free delivery); stored as numeric(10,2).
  SHIPPING_PRICE: {
    MIN: 0,
    MAX: MAX_DECIMAL,
    STEP: 0.01,
  },
  PAGINATION: {
    MIN_PAGE: 1,
    DEFAULT_PAGE: 1,
    MIN_LIMIT: 1,
    DEFAULT_LIMIT: 10,
    MAX_LIMIT: 100,
  },
  PHONE: {
    REGEX: /^\d{10}$/,
  },
  CLERK_ID: {
    // Clerk's own id shape for a User resource, e.g. "user_2abc123XYZ...".
    REGEX: /^user_[a-zA-Z0-9]+$/,
  },
} as const;
