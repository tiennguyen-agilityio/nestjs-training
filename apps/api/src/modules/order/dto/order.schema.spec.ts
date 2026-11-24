import { orderQuerySchema } from './order.schema.js';

describe('orderQuerySchema', () => {
  it('defaults to page 1, limit 10, sort createdAt, order DESC', () => {
    expect(orderQuerySchema.parse({})).toEqual({
      page: 1,
      limit: 10,
      sort: 'createdAt',
      order: 'DESC',
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

  it('drops search', () => {
    expect(orderQuerySchema.parse({ search: 'x' })).not.toHaveProperty(
      'search',
    );
  });
});
