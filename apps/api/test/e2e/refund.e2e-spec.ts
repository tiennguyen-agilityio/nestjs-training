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

  const asAdmin = async (): Promise<void> => {
    signIn((await createUser(UserRole.ADMIN)).clerkId);
  };

  const refund = (orderId: string, amount: unknown) =>
    request(app.getHttpServer())
      .post(`${ORDERS}/${encodeURIComponent(orderId)}/refunds`)
      .set('Idempotency-Key', randomUUID())
      .send({ amount });

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

  it('cancelling a paid card order creates a PENDING refund (AC1)', async () => {
    const order = await paidCardOrder();
    await asAdmin();

    await request(app.getHttpServer())
      .patch(`${ORDERS}/${order.id}/status`)
      .send({ status: 'CANCELLED' })
      .expect(200);

    const refunds = await refundsOf(order.id);
    expect(refunds).toHaveLength(1);
    expect(refunds[0]).toMatchObject({ method: 'CARD' });
    expect(Number(refunds[0].amount)).toBe(order.totalAmount);
    expect(refunds[0].status).not.toBe('PAID');
  });

  it('RETURNED of a paid order creates a PENDING refund (AC3)', async () => {
    const order = await paidCardOrder('SHIPPING');
    await asAdmin();

    await request(app.getHttpServer())
      .patch(`${ORDERS}/${order.id}/shipping-status`)
      .send({ shippingStatus: 'RETURNED' })
      .expect(200);

    const refunds = await refundsOf(order.id);
    expect(refunds).toHaveLength(1);
    expect(Number(refunds[0].amount)).toBe(order.totalAmount);
  });

  it('POST /orders/:id/refunds creates a partial refund (AC4)', async () => {
    const order = await paidCardOrder();
    await asAdmin();

    const response = await refund(order.orderNumber, 10).expect(201);

    const created = (response.body as { data: PaymentBody }).data;
    expect(created).toMatchObject({
      type: 'REFUND',
      method: 'CARD',
      amount: 10,
    });
    expect(await refundsOf(order.id)).toHaveLength(1);
  });

  it('POST /orders/:id/refunds over the charge or a second time returns 409 (AC5)', async () => {
    const order = await paidCardOrder();
    await asAdmin();

    const over = await refund(order.id, order.totalAmount + 1).expect(409);
    expect((over.body as ErrorBody).errors[0]).toMatchObject({
      errCode: 'refundExceedsPaid',
      field: 'amount',
      description: `At most ${order.totalAmount.toFixed(2)} can still be refunded.`,
    });

    await refund(order.id, 10).expect(201);
    const second = await refund(order.id, 5).expect(409);
    expect((second.body as ErrorBody).errors[0]).toMatchObject({
      errCode: 'alreadyRefunded',
      field: 'amount',
    });
    expect(await refundsOf(order.id)).toHaveLength(1);
  });

  it('POST /payments/:id/retry retries a FAILED refund (AC6)', async () => {
    const order = await paidCardOrder();
    const [{ id: failedId }] = await execute<{ id: string }[]>(
      `insert into payments (id, order_id, type, method, status, amount, currency, failure_reason, created_at, updated_at)
       values (gen_random_uuid(), ?, 'REFUND', 'CARD', 'FAILED', 12.5, 'USD', 'lost_or_stolen_card', now(), now()) returning id`,
      [order.id],
    );
    await asAdmin();

    const response = await request(app.getHttpServer())
      .post(`${PAYMENTS}/${failedId}/retry`)
      .set('Idempotency-Key', randomUUID())
      .expect(201);

    const created = (response.body as { data: PaymentBody }).data;
    expect(created).toMatchObject({ type: 'REFUND', amount: 12.5 });
    expect(created.id).not.toBe(failedId);
    const refunds = await refundsOf(order.id);
    expect(refunds).toHaveLength(2);
    expect(refunds.find((row) => row.id === failedId)?.status).toBe('FAILED');
  });

  it('POST /orders/:id/cancel of a CONFIRMED paid card order cancels it and creates a PENDING refund (AC1)', async () => {
    const order = await paidCardOrder();

    const response = await request(app.getHttpServer())
      .post(`${ORDERS}/${order.id}/cancel`)
      .expect(200);

    expect((response.body as { data: { status: string } }).data.status).toBe(
      'CANCELLED',
    );
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
