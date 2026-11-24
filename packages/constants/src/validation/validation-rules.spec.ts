import { VALIDATION_RULES } from './validation-rules.js';

describe('VALIDATION_RULES', () => {
  it('matches the API rules', () => {
    expect(VALIDATION_RULES).toEqual({
      NAME: { MIN_LENGTH: 2, MAX_LENGTH: 120 },
      SKU: { MIN_LENGTH: 1, MAX_LENGTH: 255 },
      IMAGE: {
        MIN_COUNT: 2,
        MAX_COUNT: 6,
        MIN_SORT_ORDER: 0,
        MAX_SORT_ORDER: 5,
      },
      VARIANT: { MIN_COUNT: 1 },
      STOCK_QUANTITY: { MIN: 0 },
      CART_QUANTITY: { MIN: 1 },
      CART_MERGE: { MAX_ITEMS: 50 },
      PRICE: { MIN: 1, MAX: 99999999.99 },
      SIZE: { MIN: 1, MAX: 99999999.99 },
      DISCOUNT: { MIN: 0, MAX: 99999999.99, PERCENT_MAX: 100 },
      SHIPPING_PRICE: { MIN: 0, MAX: 99999999.99, STEP: 0.01 },
      PAGINATION: {
        MIN_PAGE: 1,
        DEFAULT_PAGE: 1,
        MIN_LIMIT: 1,
        DEFAULT_LIMIT: 10,
        MAX_LIMIT: 100,
      },
      PHONE: { REGEX: /^\d{10}$/ },
      CLERK_ID: { REGEX: /^user_[a-zA-Z0-9]+$/ },
      ORDER: {
        TAX_PERCENT: 10,
        PAYMENT_EXPIRY_MINUTES: 30,
        ADDRESS_MAX_LENGTH: 255,
        POSTAL_CODE_MAX_LENGTH: 20,
        NOTE_MAX_LENGTH: 1000,
        NUMBER_MAX_LENGTH: 20,
      },
    });
  });

  it('SIZE and STOCK_QUANTITY bounds', () => {
    expect(VALIDATION_RULES).toMatchObject({
      STOCK_QUANTITY: { MIN: 0 },
      SIZE: { MIN: 1, MAX: 99999999.99 },
    });
    expect(VALIDATION_RULES).not.toHaveProperty('WEIGHT');
    expect(VALIDATION_RULES).not.toHaveProperty('QUANTITY');
  });

  it('CART_QUANTITY.MIN is 1', () => {
    expect(VALIDATION_RULES.CART_QUANTITY.MIN).toBe(1);
  });

  it('SHIPPING_PRICE allows 0 up to MAX_DECIMAL in cents', () => {
    expect(VALIDATION_RULES.SHIPPING_PRICE).toEqual({
      MIN: 0,
      MAX: 99999999.99,
      STEP: 0.01,
    });
  });
});
