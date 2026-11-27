import { OrderStatus, ShippingStatus } from '@repo/constants';
import {
  createRefundSchema,
  placeOrderSchema,
  updateOrderShippingStatusSchema,
  updateOrderStatusSchema,
} from './order.js';

const body = {
  shippingMethodId: '3f1c2a5e-8b4d-4e6f-9a7b-1c2d3e4f5a6b',
  paymentMethod: 'COD',
  recipientName: 'Lan Nguyen',
  recipientPhone: '0901234567',
  addressLine: '12 Le Loi',
  ward: 'Ben Nghe',
  district: 'District 1',
  city: 'Ho Chi Minh City',
  postalCode: '700000',
};

const issueOf = (input: unknown) =>
  placeOrderSchema.safeParse(input).error?.issues[0];

describe('placeOrderSchema', () => {
  it('placeOrderSchema accepts the ERD body and strips items', () => {
    expect(
      placeOrderSchema.parse({
        ...body,
        note: 'Ring twice',
        items: [{ variantId: 'x', quantity: 1, unitPrice: 1 }],
      }),
    ).toEqual({ ...body, note: 'Ring twice' });
  });

  it('placeOrderSchema rejects a phone that is not 10 digits', () => {
    expect(issueOf({ ...body, recipientPhone: '12345' })).toMatchObject({
      path: ['recipientPhone'],
    });
  });

  it('placeOrderSchema rejects an unknown payment method', () => {
    expect(issueOf({ ...body, paymentMethod: 'STRIPE' })).toMatchObject({
      path: ['paymentMethod'],
    });
  });

  it('placeOrderSchema requires the address fields', () => {
    const withoutCity: Record<string, unknown> = { ...body };
    delete withoutCity.city;
    expect(issueOf(withoutCity)).toMatchObject({
      code: 'invalid_type',
      path: ['city'],
    });
  });

  it('placeOrderSchema rejects a blank address line', () => {
    expect(issueOf({ ...body, addressLine: '   ' })).toMatchObject({
      path: ['addressLine'],
    });
  });

  it('placeOrderSchema rejects a non-UUID shippingMethodId', () => {
    expect(issueOf({ ...body, shippingMethodId: 'abc' })).toMatchObject({
      code: 'invalid_format',
      path: ['shippingMethodId'],
    });
  });
});

describe('updateOrderStatusSchema', () => {
  it.each(Object.values(OrderStatus))(
    'updateOrderStatusSchema accepts every OrderStatus value (%s)',
    (status) => {
      expect(updateOrderStatusSchema.parse({ status })).toEqual({ status });
    },
  );

  it('updateOrderStatusSchema rejects an unknown status', () => {
    expect(
      updateOrderStatusSchema.safeParse({ status: 'SHIPPED' }).error?.issues[0],
    ).toMatchObject({ path: ['status'] });
  });
});

describe('updateOrderShippingStatusSchema', () => {
  it.each(Object.values(ShippingStatus))(
    'updateOrderShippingStatusSchema accepts every ShippingStatus value (%s)',
    (shippingStatus) => {
      expect(updateOrderShippingStatusSchema.parse({ shippingStatus })).toEqual(
        { shippingStatus },
      );
    },
  );

  it('updateOrderShippingStatusSchema rejects an unknown shipping status', () => {
    expect(
      updateOrderShippingStatusSchema.safeParse({ shippingStatus: 'LOST' })
        .error?.issues[0],
    ).toMatchObject({ path: ['shippingStatus'] });
  });
});

describe('createRefundSchema', () => {
  it('createRefundSchema accepts a trimmed reason up to 500 characters', () => {
    expect(
      createRefundSchema.parse({ amount: 40, reason: '  Cancellation fee ' }),
    ).toEqual({ amount: 40, reason: 'Cancellation fee' });
    expect(
      createRefundSchema.safeParse({ amount: 40, reason: 'a'.repeat(500) })
        .success,
    ).toBe(true);
    expect(
      createRefundSchema.safeParse({ amount: 40, reason: 'a'.repeat(501) })
        .success,
    ).toBe(false);
    expect(createRefundSchema.parse({ amount: 40 }).reason).toBeUndefined();
  });

  it('createRefundSchema accepts 10.5 and 0.01', () => {
    expect(createRefundSchema.safeParse({ amount: 10.5 }).success).toBe(true);
    expect(createRefundSchema.safeParse({ amount: 0.01 }).success).toBe(true);
  });

  it('createRefundSchema refuses 0, -1 and a string', () => {
    for (const amount of [0, -1, '10']) {
      expect(createRefundSchema.safeParse({ amount }).success).toBe(false);
    }
  });

  it('createRefundSchema refuses more than 2 decimals', () => {
    expect(createRefundSchema.safeParse({ amount: 10.555 }).success).toBe(
      false,
    );
  });
});
