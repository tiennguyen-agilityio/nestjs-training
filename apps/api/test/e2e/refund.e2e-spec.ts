import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { MikroORM, RequestContext } from '@mikro-orm/core';
import request from 'supertest';
import { App } from 'supertest/types';
import { getAuth } from '@clerk/express';
import type { Mock } from 'vitest';
import {
  DiscountType,
  ProductStatus,
  ProductUnit,
  RoastLevel,
  ShippingMethodStatus,
  UserRole,
} from '@repo/constants';
import { AppModule } from './../../src/app.module.js';
import { API_BASE_PATH } from './../utils/api-path.util.js';
import { initTestApp } from './../utils/init-test-app.util.js';
import { UserService } from './../../src/modules/user/services/user.service.js';
import { CategoryService } from './../../src/modules/category/services/category.service.js';
import { ProductService } from './../../src/modules/product/services/product.service.js';
import { ShippingMethodService } from './../../src/modules/shipping-method/services/shipping-method.service.js';

vi.mock('@clerk/express', async () => {
  const actual: object = await vi.importActual('@clerk/express');
  return { ...actual, getAuth: vi.fn() };
});

interface OrderBody {
  id: string;
  orderNumber: string;
  totalAmount: number;
}

interface PaymentBody {
  id: string;
  type: string;
  method: string;
  status: string;
  amount: number;
  refundReason?: string | null;
}

interface DetailBody {
  paymentStatus: string;
  refundableAmount?: number;
  payments: PaymentBody[];
}

interface ErrorBody {
  errors: { errCode: string; field: string; description: string }[];
}

interface RefundRow {
  id: string;
  method: string;
  status: string;
  amount: string;
}

describe('Refunds (e2e)', () => {
  let app: INestApplication<App>;
  let orm: MikroORM;
  let userService: UserService;
  let categoryService: CategoryService;
  let productService: ProductService;
  let shippingMethodService: ShippingMethodService;

  const ORDERS = `${API_BASE_PATH}/orders`;
  const PAYMENTS = `${API_BASE_PATH}/payments`;
  const ITEMS = `${API_BASE_PATH}/cart/items`;

  const unique = (base: string): string =>
    `${base} ${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const execute = async <T = unknown>(
    sql: string,
    params: unknown[] = [],
  ): Promise<T> => (await orm.em.getConnection().execute(sql, params)) as T;

  const signIn = (clerkId: string | null): void => {
    (getAuth as Mock).mockReturnValue({ userId: clerkId });
  };

  const createUser = (
    role: UserRole = UserRole.USER,
  ): Promise<{ id: string; clerkId: string }> =>
    RequestContext.create(orm.em, async () => {
      const clerkId = `clerk-refund-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const user = await userService.create({
        clerkId,
        email: `${clerkId}@example.com`,
        firstName: 'Refund',
        lastName: 'Shopper',
        role,
      });
      return { id: user.id, clerkId };
    });

  const createVariant = (): Promise<string> =>
    RequestContext.create(orm.em, async () => {
      const category = await categoryService.create({
        name: unique('Refund E2E Category'),
      });
      const product = await productService.create({
        categoryId: category.id,
        name: unique('Refund E2E Product'),
        status: ProductStatus.ACTIVE,
        roastLevel: RoastLevel.MEDIUM,
        description: 'A balanced coffee.',
        origin: 'Colombia',
        processingMethod: 'Washed',
        images: [
          {
            url: 'https://example.com/hero.jpg',
            isPrimary: true,
            sortOrder: 0,
          },
          { url: 'https://example.com/side.jpg', sortOrder: 1 },
        ],
        variants: [
          {
            sku: unique('SKU-REFUND'),
            size: '250',
            unit: ProductUnit.G,
            price: '10',
            discountType: DiscountType.PERCENT,
            discountValue: '0',
            stockQuantity: 5,
          },
        ],
      });
      return product.variants.getItems()[0].id;
    });

  const createMethod = (): Promise<string> =>
    RequestContext.create(orm.em, async () => {
      const method = await shippingMethodService.create(
        {
          name: unique('Roast Express'),
          description: '1-2 business days',
          price: 12,
          status: ShippingMethodStatus.ACTIVE,
        },
        null,
      );
      return method.id;
    });

  const placeOrder = async (): Promise<OrderBody> => {
    const customer = await createUser();
    const methodId = await createMethod();
    const variantId = await createVariant();
    signIn(customer.clerkId);
    await request(app.getHttpServer())
      .post(ITEMS)
      .set('Idempotency-Key', randomUUID())
      .send({ productVariantId: variantId, quantity: 2 })
      .expect(201);
    const response = await request(app.getHttpServer())
      .post(ORDERS)
      .set('Idempotency-Key', randomUUID())
      .send({
        shippingMethodId: methodId,
        paymentMethod: 'COD',
        recipientName: 'Lan Nguyen',
        recipientPhone: '0901234567',
        addressLine: '12 Le Loi',
        ward: 'Ben Nghe',
        district: 'District 1',
        city: 'Ho Chi Minh City',
        postalCode: '700000',
      })
      .expect(201);
    return (response.body as { data: OrderBody }).data;
  };

  const paidCardOrder = async (shipping = 'PENDING'): Promise<OrderBody> => {
    const order = await placeOrder();
    await execute(
      `update payments set method = 'CARD', status = 'PAID', transaction_id = ?, completed_at = now() where order_id = ? and type = 'CHARGE'`,
      [`pi_${randomUUID()}`, order.id],
    );
    await execute(
      `update orders set status = 'CONFIRMED', shipping_status = ? where id = ?`,
      [shipping, order.id],
    );
    return order;
  };

  const refundsOf = (orderId: string): Promise<RefundRow[]> =>
    execute<RefundRow[]>(
      `select id, method, status, amount from payments where order_id = ? and type = 'REFUND' order by created_at`,
      [orderId],
    );

  /** Units the order's variants still hold for it (0 once released). */
  const reservedOf = async (orderId: string): Promise<number> => {
    const [row] = await execute<{ reserved: number }[]>(
      `select coalesce(sum(v.reserved_quantity), 0)::int as reserved from product_variants v join order_items i on i.product_variant_id = v.id where i.order_id = ?`,
      [orderId],
    );
    return row.reserved;
  };

  const asAdmin = async (): Promise<void> => {
    signIn((await createUser(UserRole.ADMIN)).clerkId);
  };

  const refund = (orderId: string, amount: unknown, reason?: string) =>
    request(app.getHttpServer())
      .post(`${ORDERS}/${encodeURIComponent(orderId)}/refunds`)
      .set('Idempotency-Key', randomUUID())
      .send(reason === undefined ? { amount } : { amount, reason });

  /** A paid card order an admin has cancelled; the admin stays signed in. */
  const cancelledPaidOrder = async (): Promise<OrderBody> => {
    const order = await paidCardOrder();
    await asAdmin();
    await request(app.getHttpServer())
      .patch(`${ORDERS}/${order.id}/status`)
      .send({ status: 'CANCELLED' })
      .expect(200);
    return order;
  };

  const detailOf = async (orderId: string): Promise<DetailBody> =>
    (
      (
        await request(app.getHttpServer())
          .get(`${ORDERS}/${orderId}`)
          .expect(200)
      ).body as { data: DetailBody }
    ).data;

  const insertFailedRefund = async (orderId: string): Promise<string> => {
    const [{ id }] = await execute<{ id: string }[]>(
      `insert into payments (id, order_id, type, method, status, amount, currency, failure_reason, refund_reason, created_at, updated_at)
       values (gen_random_uuid(), ?, 'REFUND', 'CARD', 'FAILED', 12.5, 'USD', 'lost_or_stolen_card', 'Cancellation fee', now(), now()) returning id`,
      [orderId],
    );
    return id;
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = await initTestApp(moduleFixture);
    orm = app.get(MikroORM);
    userService = app.get(UserService);
    categoryService = app.get(CategoryService);
    productService = app.get(ProductService);
    shippingMethodService = app.get(ShippingMethodService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('an admin cancel of a paid order makes no refund (AC2)', async () => {
    const order = await paidCardOrder();
    expect(await reservedOf(order.id)).toBe(2);
    await asAdmin();

    await request(app.getHttpServer())
      .patch(`${ORDERS}/${order.id}/status`)
      .send({ status: 'CANCELLED' })
      .expect(200);

    const [row] = await execute<{ status: string }[]>(
      `select status from orders where id = ?`,
      [order.id],
    );
    expect(row.status).toBe('CANCELLED');
    expect(await reservedOf(order.id)).toBe(0);
    expect(await refundsOf(order.id)).toEqual([]);
  });

  it('RETURNED of a paid PayPal order makes no refund (AC3)', async () => {
    const order = await paidCardOrder('SHIPPING');
    await execute(
      `update payments set method = 'PAYPAL' where order_id = ? and type = 'CHARGE'`,
      [order.id],
    );
    await asAdmin();

    await request(app.getHttpServer())
      .patch(`${ORDERS}/${order.id}/shipping-status`)
      .send({ shippingStatus: 'RETURNED' })
      .expect(200);

    const [row] = await execute<{ status: string; shipping_status: string }[]>(
      `select status, shipping_status from orders where id = ?`,
      [order.id],
    );
    expect(row).toEqual({ status: 'CANCELLED', shipping_status: 'RETURNED' });
    expect(await reservedOf(order.id)).toBe(0);
    expect(await refundsOf(order.id)).toEqual([]);
  });

  it('a shipping change of an order with a refund returns 409 (AC7)', async () => {
    for (const refundStatus of ['PENDING', 'PAID', 'FAILED']) {
      const order = await paidCardOrder();
      await execute(
        `insert into payments (id, order_id, type, method, status, amount, currency, created_at, updated_at) values (?, ?, 'REFUND', 'CARD', ?, 5, 'USD', now(), now())`,
        [randomUUID(), order.id, refundStatus],
      );
      await asAdmin();

      await request(app.getHttpServer())
        .patch(`${ORDERS}/${order.id}/shipping-status`)
        .send({ shippingStatus: 'SHIPPING' })
        .expect(409);

      const [row] = await execute<{ shipping_status: string }[]>(
        `select shipping_status from orders where id = ?`,
        [order.id],
      );
      expect(row.shipping_status).toBe('PENDING');
    }
  });

  it('the admin refunds a cancelled order with a reason (AC4)', async () => {
    const order = await cancelledPaidOrder();
    expect((await detailOf(order.id)).refundableAmount).toBe(order.totalAmount);

    const response = await refund(
      order.orderNumber,
      10,
      'Cancellation fee',
    ).expect(201);

    const created = (response.body as { data: PaymentBody }).data;
    expect(created).toMatchObject({
      type: 'REFUND',
      method: 'CARD',
      amount: 10,
      refundReason: 'Cancellation fee',
    });
    expect(await refundsOf(order.id)).toHaveLength(1);

    await execute(
      `update payments set status = 'PAID', completed_at = now() where id = ?`,
      [created.id],
    );
    const detail = await detailOf(order.id);
    expect(detail.paymentStatus).toBe('PARTIALLY_REFUNDED');
    expect(detail.refundableAmount).toBe(0);
  });

  it('a lower refund without a reason is 400 and above the paid amount is 409 (AC5)', async () => {
    const order = await cancelledPaidOrder();

    const missing = await refund(order.id, 10).expect(400);
    expect((missing.body as ErrorBody).errors[0]).toMatchObject({
      errCode: 'refundReasonRequired',
      field: 'reason',
    });
    await refund(order.id, 10, '   ').expect(400);

    const over = await refund(order.id, order.totalAmount + 10, 'x').expect(
      409,
    );
    expect((over.body as ErrorBody).errors[0]).toMatchObject({
      errCode: 'refundExceedsPaid',
      field: 'amount',
      description: `At most ${order.totalAmount.toFixed(2)} can still be refunded.`,
    });
    expect(await refundsOf(order.id)).toEqual([]);

    await refund(order.id, order.totalAmount).expect(201);
    const second = await refund(order.id, 5, 'again').expect(409);
    expect((second.body as ErrorBody).errors[0]).toMatchObject({
      errCode: 'alreadyRefunded',
    });
    expect(await refundsOf(order.id)).toHaveLength(1);
  });

  it('no refund before the order is cancelled (AC6)', async () => {
    for (const shipping of ['PENDING', 'SHIPPING', 'DELIVERED']) {
      const order = await paidCardOrder(shipping);
      await asAdmin();

      const response = await refund(order.id, order.totalAmount).expect(409);
      expect((response.body as ErrorBody).errors[0]).toMatchObject({
        errCode: 'refundNeedsCancelled',
      });
      expect((await detailOf(order.id)).refundableAmount).toBe(0);
      expect(await refundsOf(order.id)).toEqual([]);
    }
  });

  it('an order with a failed refund only retries it', async () => {
    const order = await cancelledPaidOrder();
    const failedId = await insertFailedRefund(order.id);

    await refund(order.id, order.totalAmount).expect(409);
    expect((await detailOf(order.id)).refundableAmount).toBe(0);

    const response = await request(app.getHttpServer())
      .post(`${PAYMENTS}/${failedId}/retry`)
      .set('Idempotency-Key', randomUUID())
      .expect(201);

    const created = (response.body as { data: PaymentBody }).data;
    expect(created).toMatchObject({
      type: 'REFUND',
      amount: 12.5,
      refundReason: 'Cancellation fee',
    });
    expect(created.id).not.toBe(failedId);
    const refunds = await refundsOf(order.id);
    expect(refunds).toHaveLength(2);
    expect(refunds.find((row) => row.id === failedId)?.status).toBe('FAILED');
  });

  it("the admin detail has refundableAmount; the shopper's order detail has no refundReason", async () => {
    const order = await cancelledPaidOrder();
    await insertFailedRefund(order.id);

    const admin = await detailOf(order.id);
    expect(admin.refundableAmount).toBe(0);
    expect(
      admin.payments.find((payment) => payment.type === 'REFUND')?.refundReason,
    ).toBe('Cancellation fee');

    const [{ clerk_id: clerkId }] = await execute<{ clerk_id: string }[]>(
      `select u.clerk_id from users u join orders o on o.user_id = u.id where o.id = ?`,
      [order.id],
    );
    signIn(clerkId);
    const shopper = await detailOf(order.id);
    expect(shopper).not.toHaveProperty('refundableAmount');
    for (const payment of shopper.payments) {
      expect(payment).not.toHaveProperty('refundReason');
    }
  });

  it('a shopper cancel of a paid card order refunds it in full (AC1)', async () => {
    const order = await paidCardOrder();

    const response = await request(app.getHttpServer())
      .post(`${ORDERS}/${order.id}/cancel`)
      .expect(200);

    expect((response.body as { data: { status: string } }).data.status).toBe(
      'CANCELLED',
    );
    expect(await reservedOf(order.id)).toBe(0);
    const refunds = await refundsOf(order.id);
    expect(refunds).toHaveLength(1);
    expect(refunds[0]).toMatchObject({ method: 'CARD' });
    expect(Number(refunds[0].amount)).toBe(order.totalAmount);
  });

  it('cancelling a COD order creates no refund (AC8)', async () => {
    const order = await placeOrder();
    await asAdmin();

    await request(app.getHttpServer())
      .patch(`${ORDERS}/${order.id}/status`)
      .send({ status: 'CANCELLED' })
      .expect(200);

    expect(await refundsOf(order.id)).toEqual([]);
  });

  it('POST /orders/:id/refunds as a customer returns 403', async () => {
    const order = await paidCardOrder();
    signIn((await createUser()).clerkId);

    await refund(order.id, 5).expect(403);
    expect(await refundsOf(order.id)).toEqual([]);
  });
});
