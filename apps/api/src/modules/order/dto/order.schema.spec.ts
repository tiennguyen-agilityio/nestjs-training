import { orderQuerySchema } from './order.schema.js';

describe('orderQuerySchema', () => {
  it('defaults to page 1, limit 10, sort createdAt, order DESC', () => {
    expect(orderQuerySchema.parse({})).toEqual({
      page: 1,
      limit: 10,
      sort: 'createdAt',
      order: 'DESC',
      all: false,
    });
  });

  it('takes status, shippingStatus and paymentStatus values', () => {
    const query = {
      status: 'PENDING',
      shippingStatus: 'SHIPPING',
      paymentStatus: 'PARTIALLY_REFUNDED',
      sort: 'totalAmount',
      order: 'ASC',
    };

    expect(orderQuerySchema.parse(query)).toEqual({
      ...query,
      page: 1,
      limit: 10,
      all: false,
    });
  });

  it.each([
    [{ status: 'SHIPPED' }, 'status'],
    [{ sort: 'id' }, 'sort'],
    [{ order: 'down' }, 'order'],
  ])('rejects an unknown status, sort or order (%o)', (query, field) => {
    const result = orderQuerySchema.safeParse(query);

    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual([field]);
  });

  it('keeps search', () => {
    expect(orderQuerySchema.parse({ search: 'lan' })).toMatchObject({
      search: 'lan',
    });
  });

  it('parses all "true"/"false", defaults it to false and rejects "1"', () => {
    expect(orderQuerySchema.parse({ all: 'true' }).all).toBe(true);
    expect(orderQuerySchema.parse({ all: 'false' }).all).toBe(false);
    expect(orderQuerySchema.parse({}).all).toBe(false);

    const result = orderQuerySchema.safeParse({ all: '1' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(['all']);
  });
});
