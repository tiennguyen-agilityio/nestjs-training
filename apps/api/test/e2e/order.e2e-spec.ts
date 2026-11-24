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
  status: string;
  shippingStatus: string;
  paymentStatus: string;
  shippingFee: number;
  tax: number;
  subTotal: number;
  totalAmount: number;
  items: {
    productVariantId: string;
    unitPrice: number;
    discountAmount: number;
    quantity: number;
  }[];
  payments: { type: string; method: string; status: string; amount: number }[];
}

interface ErrorBody {
  errors: { errCode: string; field: string; message: string }[];
}

interface RowBody {
  id: string;
  orderNumber: string;
  customer: { firstName: string; lastName: string; email: string };
  status: string;
  shippingStatus: string;
  paymentStatus: string;
  paymentMethod: string | null;
  itemCount: number;
  totalAmount: number;
}

interface ListBody {
  data: RowBody[];
  meta: {
    limit: number;
    currentPage: number;
    pageCount: number;
    totalCount: number;
  };
}

describe('OrderController (e2e)', () => {
  let app: INestApplication<App>;
  let orm: MikroORM;
  let userService: UserService;
  let categoryService: CategoryService;
  let productService: ProductService;
  let shippingMethodService: ShippingMethodService;

  const ORDERS = `${API_BASE_PATH}/orders`;
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
    lastName = 'Shopper',
  ): Promise<{ id: string; clerkId: string }> =>
    RequestContext.create(orm.em, async () => {
      const clerkId = `clerk-order-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const user = await userService.create({
        clerkId,
        email: `${clerkId}@example.com`,
        firstName: 'Order',
        lastName,
        role,
      });
      return { id: user.id, clerkId };
    });

  const createProduct = (
    stockQuantity = 5,
  ): Promise<{ productId: string; variantId: string; sku: string }> =>
    RequestContext.create(orm.em, async () => {
      const category = await categoryService.create({
        name: unique('Order E2E Category'),
      });
      const sku = unique('SKU-ORDER');
      const product = await productService.create({
        categoryId: category.id,
        name: unique('Order E2E Product'),
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
            sku,
            size: '250',
            unit: ProductUnit.G,
            price: '10',
            discountType: DiscountType.PERCENT,
            discountValue: '0',
            stockQuantity,
          },
        ],
      });
      return {
        productId: product.id,
        variantId: product.variants.getItems()[0].id,
        sku,
      };
    });

  const createMethod = (
    status: ShippingMethodStatus = ShippingMethodStatus.ACTIVE,
  ): Promise<string> =>
    RequestContext.create(orm.em, async () => {
      const method = await shippingMethodService.create(
        {
          name: unique('Roast Express'),
          description: '1-2 business days',
          price: 12,
          status,
        },
        null,
      );
      return method.id;
    });

  const addToCart = (variantId: string, quantity: number) =>
    request(app.getHttpServer())
      .post(ITEMS)
      .set('Idempotency-Key', randomUUID())
      .send({ productVariantId: variantId, quantity })
      .expect(201);

  const body = (shippingMethodId: string, paymentMethod = 'COD') => ({
    shippingMethodId,
    paymentMethod,
    recipientName: 'Lan Nguyen',
    recipientPhone: '0901234567',
    addressLine: '12 Le Loi',
    ward: 'Ben Nghe',
    district: 'District 1',
    city: 'Ho Chi Minh City',
    postalCode: '700000',
  });

  const place = (shippingMethodId: string, key = randomUUID()) =>
    request(app.getHttpServer())
      .post(ORDERS)
      .set('Idempotency-Key', key)
      .send(body(shippingMethodId));

  const orderOf = (response: { body: unknown }): OrderBody =>
    (response.body as { data: OrderBody }).data;

  const variantRow = async (variantId: string) =>
    (
      await execute<{ stock_quantity: number; reserved_quantity: number }[]>(
        'select stock_quantity, reserved_quantity from product_variants where id = ?',
        [variantId],
      )
    )[0];

  const countRows = async (table: string, userId: string): Promise<number> => {
    const sql =
      table === 'orders'
        ? 'select count(*)::int as n from orders where user_id = ?'
        : `select count(*)::int as n from ${table} t join orders o on o.id = t.order_id where o.user_id = ?`;
    return (await execute<{ n: number }[]>(sql, [userId]))[0].n;
  };

  const cartLines = async (userId: string): Promise<number> =>
    (
      await execute<{ n: number }[]>(
        `select count(*)::int as n from cart_items ci join carts c on c.id = ci.cart_id where c.user_id = ?`,
        [userId],
      )
    )[0].n;

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

  beforeEach(() => {
    signIn(null);
  });

  it('POST /orders places an order from the cart (AC1)', async () => {
    const user = await createUser();
    const variant = await createProduct(5);
    const methodId = await createMethod();
    signIn(user.clerkId);
    await addToCart(variant.variantId, 2);

    const response = await place(methodId).expect(201);

    const order = orderOf(response);
    expect(order).toMatchObject({
      status: 'PENDING',
      shippingStatus: 'PENDING',
      shippingFee: 12,
      tax: 2,
      subTotal: 20,
      totalAmount: 34,
    });
    expect(order.orderNumber).toMatch(/^ORD-[0-9A-Z]+-[0-9A-Z]{4}$/);
    expect(order.items).toEqual([
      expect.objectContaining({
        productVariantId: variant.variantId,
        unitPrice: 10,
        discountAmount: 0,
        quantity: 2,
      }),
    ]);
    expect(await cartLines(user.id)).toBe(0);
  });

  it('POST /orders holds the stock (AC2)', async () => {
    const user = await createUser();
    const variant = await createProduct(5);
    const methodId = await createMethod();
    signIn(user.clerkId);
    await addToCart(variant.variantId, 2);

    const order = orderOf(await place(methodId).expect(201));

    expect(await variantRow(variant.variantId)).toEqual({
      stock_quantity: 5,
      reserved_quantity: 2,
    });
    const movements = await execute<
      { type: string; quantity: number; created_by: string | null }[]
    >(
      'select type, quantity, created_by from inventory_movements where order_id = ? and product_variant_id = ?',
      [order.id, variant.variantId],
    );
    expect(movements).toEqual([
      { type: 'RESERVE', quantity: 2, created_by: null },
    ]);
  });

  it('POST /orders out of stock saves nothing (AC3)', async () => {
    const user = await createUser();
    const variant = await createProduct(2);
    const methodId = await createMethod();
    signIn(user.clerkId);
    await addToCart(variant.variantId, 2);
    await execute(
      'update product_variants set stock_quantity = 1 where id = ?',
      [variant.variantId],
    );

    const response = await place(methodId).expect(400);

    expect((response.body as ErrorBody).errors[0]).toMatchObject({
      errCode: 'outOfStock',
      field: 'items.0.productVariantId',
      message: `Only 1 left for ${variant.sku}`,
    });
    expect(await countRows('orders', user.id)).toBe(0);
    expect(
      (
        await execute<{ n: number }[]>(
          'select count(*)::int as n from inventory_movements where product_variant_id = ?',
          [variant.variantId],
        )
      )[0].n,
    ).toBe(0);
    expect(await variantRow(variant.variantId)).toEqual({
      stock_quantity: 1,
      reserved_quantity: 0,
    });
    expect(await cartLines(user.id)).toBe(1);
  });

  it('order item keeps its price after the variant price changes (AC4)', async () => {
    const user = await createUser();
    const variant = await createProduct(5);
    const methodId = await createMethod();
    signIn(user.clerkId);
    await addToCart(variant.variantId, 1);
    const order = orderOf(await place(methodId).expect(201));

    await RequestContext.create(orm.em, () =>
      productService.update(
        variant.productId,
        { updateVariants: [{ id: variant.variantId, price: 15 }] },
        null,
      ),
    );

    const [item] = await execute<{ unit_price: string }[]>(
      'select unit_price from order_items where order_id = ?',
      [order.id],
    );
    expect(item.unit_price).toBe('10.00');
  });

  it('POST /orders with an INACTIVE method returns 400 (AC5)', async () => {
    const user = await createUser();
    const variant = await createProduct(5);
    const methodId = await createMethod(ShippingMethodStatus.INACTIVE);
    signIn(user.clerkId);
    await addToCart(variant.variantId, 1);

    const response = await place(methodId).expect(400);

    expect((response.body as ErrorBody).errors[0]).toMatchObject({
      errCode: 'shippingMethodUnavailable',
      field: 'shippingMethodId',
    });
    expect(await countRows('orders', user.id)).toBe(0);
  });

  it('POST /orders creates one PENDING COD charge (AC6)', async () => {
    const user = await createUser();
    const variant = await createProduct(5);
    const methodId = await createMethod();
    signIn(user.clerkId);
    await addToCart(variant.variantId, 2);

    const order = orderOf(await place(methodId).expect(201));

    expect(order.paymentStatus).toBe('UNPAID');
    expect(order.payments).toEqual([
      expect.objectContaining({
        type: 'CHARGE',
        method: 'COD',
        status: 'PENDING',
        amount: 34,
      }),
    ]);
    expect(await countRows('payments', user.id)).toBe(1);
  });

  it('two concurrent orders for the last unit: one 201, one 400', async () => {
    const [first, second] = [await createUser(), await createUser()];
    const variant = await createProduct(1);
    const methodId = await createMethod();
    for (const user of [first, second]) {
      signIn(user.clerkId);
      await addToCart(variant.variantId, 1);
    }
    (getAuth as Mock).mockImplementation(
      (req: { headers: Record<string, string> }) => ({
        userId: req.headers['x-test-clerk-id'],
      }),
    );

    const responses = await Promise.all(
      [first, second].map((user) =>
        request(app.getHttpServer())
          .post(ORDERS)
          .set('Idempotency-Key', randomUUID())
          .set('x-test-clerk-id', user.clerkId)
          .send(body(methodId)),
      ),
    );
    (getAuth as Mock).mockReset();

    expect(responses.map((r) => r.status).sort()).toEqual([201, 400]);
    expect(await variantRow(variant.variantId)).toEqual({
      stock_quantity: 1,
      reserved_quantity: 1,
    });
  });

  it('a second order on the same cart returns cartEmpty', async () => {
    const user = await createUser();
    const variant = await createProduct(5);
    const methodId = await createMethod();
    signIn(user.clerkId);
    await addToCart(variant.variantId, 1);
    await place(methodId).expect(201);

    const response = await place(methodId).expect(400);

    expect((response.body as ErrorBody).errors[0]).toMatchObject({
      errCode: 'cartEmpty',
      field: 'cart',
    });
    expect(await countRows('orders', user.id)).toBe(1);
  });

  it('a retry with the same key after a 400 runs again', async () => {
    const user = await createUser();
    const variant = await createProduct(2);
    const methodId = await createMethod();
    signIn(user.clerkId);
    await addToCart(variant.variantId, 2);
    await execute(
      'update product_variants set stock_quantity = 1 where id = ?',
      [variant.variantId],
    );
    const key = randomUUID();
    await place(methodId, key).expect(400);

    const [line] = await execute<{ id: string }[]>(
      `select ci.id from cart_items ci join carts c on c.id = ci.cart_id where c.user_id = ?`,
      [user.id],
    );
    await request(app.getHttpServer())
      .patch(`${ITEMS}/${line.id}`)
      .send({ quantity: 1 })
      .expect(200);

    await place(methodId, key).expect(201);
    expect(await countRows('orders', user.id)).toBe(1);
  });

  it('POST /orders without a session returns 401', async () => {
    const methodId = await createMethod();

    await place(methodId).expect(401);
  });

  describe('GET /orders', () => {
    const list = (query = '') =>
      request(app.getHttpServer()).get(`${ORDERS}${query}`);

    const ids = (response: { body: unknown }): string[] =>
      (response.body as ListBody).data.map((row) => row.id);

    /** Places one COD order for the signed-in user, with `quantity` units. */
    const placeOne = async (
      methodId: string,
      quantity = 1,
    ): Promise<OrderBody> => {
      const { variantId } = await createProduct(10);
      await addToCart(variantId, quantity);
      return orderOf(await place(methodId).expect(201));
    };

    const setCharge = (
      orderId: string,
      method: string,
      status: string,
      minutesAgo = 0,
    ) =>
      execute(
        `update payments set method = ?, status = ?, created_at = now() - (? * interval '1 minute') where order_id = ? and type = 'CHARGE'`,
        [method, status, minutesAgo, orderId],
      );

    const addPayment = (
      orderId: string,
      type: string,
      method: string,
      status: string,
      amount: number,
      checkoutSessionId: string | null = null,
    ) =>
      execute(
        `insert into payments (id, created_at, updated_at, order_id, type, method, status, amount, checkout_session_id) values (gen_random_uuid(), now() + interval '1 minute', now(), ?, ?, ?, ?, ?, ?)`,
        [orderId, type, method, status, amount, checkoutSessionId],
      );

    it("GET /orders lists only the caller's orders, newest first (AC1)", async () => {
      const methodId = await createMethod();
      const u1 = await createUser();
      const u2 = await createUser();

      signIn(u1.clerkId);
      const o1 = await placeOne(methodId, 2);
      const o2 = await placeOne(methodId, 2);
      signIn(u2.clerkId);
      const o3 = await placeOne(methodId);

      signIn(u1.clerkId);
      const response = await list().expect(200);

      expect(ids(response)).toEqual([o2.id, o1.id]);
      expect(ids(response)).not.toContain(o3.id);
      const [row] = (response.body as ListBody).data;
      expect(row).toMatchObject({
        orderNumber: o2.orderNumber,
        customer: {
          firstName: 'Order',
          lastName: 'Shopper',
          email: `${u1.clerkId}@example.com`,
        },
        itemCount: 2,
        paymentMethod: 'COD',
        paymentStatus: 'UNPAID',
        totalAmount: o2.totalAmount,
      });
    });

    it('GET /orders pages with meta', async () => {
      const methodId = await createMethod();
      const user = await createUser();
      signIn(user.clerkId);
      const oldest = await placeOne(methodId);
      await placeOne(methodId);
      await placeOne(methodId);

      const first = await list('?limit=2').expect(200);
      expect((first.body as ListBody).data).toHaveLength(2);
      expect((first.body as ListBody).meta).toEqual({
        limit: 2,
        currentPage: 1,
        pageCount: 2,
        totalCount: 3,
      });

      const second = await list('?limit=2&page=2').expect(200);
      expect(ids(second)).toEqual([oldest.id]);
    });

    it('GET /orders past the last page returns no rows', async () => {
      const methodId = await createMethod();
      const user = await createUser();
      signIn(user.clerkId);
      await placeOne(methodId);

      const response = await list('?page=5').expect(200);

      expect((response.body as ListBody).data).toEqual([]);
      expect((response.body as ListBody).meta.totalCount).toBe(1);
    });

    it('GET /orders sorts by totalAmount ASC', async () => {
      const methodId = await createMethod();
      const user = await createUser();
      signIn(user.clerkId);
      const big = await placeOne(methodId, 3);
      const small = await placeOne(methodId, 1);

      expect(
        ids(await list('?sort=totalAmount&order=ASC').expect(200)),
      ).toEqual([small.id, big.id]);
      expect(ids(await list('?sort=totalAmount').expect(200))).toEqual([
        big.id,
        small.id,
      ]);
    });

    it('GET /orders filters by status, shippingStatus and paymentStatus', async () => {
      const methodId = await createMethod();
      const user = await createUser();
      signIn(user.clerkId);
      const unpaid = await placeOne(methodId);
      const unpaidCard = await placeOne(methodId);
      const pending = await placeOne(methodId);
      const paid = await placeOne(methodId);
      const failed = await placeOne(methodId);
      const refunded = await placeOne(methodId);
      const partial = await placeOne(methodId);

      // A CARD charge whose payment has not started (no Checkout Session) is UNPAID.
      await setCharge(unpaidCard.id, 'CARD', 'PENDING');
      // A FAILED CARD charge, then a newer started CARD charge: the newest wins.
      await setCharge(pending.id, 'CARD', 'FAILED', 5);
      await addPayment(
        pending.id,
        'CHARGE',
        'CARD',
        'PENDING',
        10,
        `cs_test_filter_${pending.id}`,
      );
      await setCharge(paid.id, 'CARD', 'PAID');
      await setCharge(failed.id, 'CARD', 'FAILED');
      await execute(
        `update payments set amount = 10 where order_id in (?, ?)`,
        [refunded.id, partial.id],
      );
      await setCharge(refunded.id, 'CARD', 'PAID');
      await addPayment(refunded.id, 'REFUND', 'CARD', 'PAID', 10);
      await setCharge(partial.id, 'CARD', 'PAID');
      await addPayment(partial.id, 'REFUND', 'CARD', 'PAID', 4);
      await execute(`update orders set status = 'CANCELLED' where id = ?`, [
        failed.id,
      ]);
      await execute(
        `update orders set shipping_status = 'SHIPPING' where id = ?`,
        [paid.id],
      );

      const expected: [string, string[]][] = [
        ['UNPAID', [unpaidCard.id, unpaid.id]],
        ['PENDING', [pending.id]],
        ['PAID', [paid.id]],
        ['FAILED', [failed.id]],
        ['REFUNDED', [refunded.id]],
        ['PARTIALLY_REFUNDED', [partial.id]],
      ];
      for (const [paymentStatus, orderIds] of expected) {
        const response = await list(`?paymentStatus=${paymentStatus}`).expect(
          200,
        );
        expect(ids(response)).toEqual(orderIds);
        for (const order of (response.body as ListBody).data) {
          expect(order.paymentStatus).toBe(paymentStatus);
        }
      }
      expect(ids(await list('?status=CANCELLED').expect(200))).toEqual([
        failed.id,
      ]);
      expect(ids(await list('?shippingStatus=SHIPPING').expect(200))).toEqual([
        paid.id,
      ]);
    });

    it('GET /orders with an invalid status returns 400', async () => {
      const user = await createUser();
      signIn(user.clerkId);

      const response = await list('?status=SHIPPED').expect(400);

      expect((response.body as ErrorBody).errors[0].field).toBe('status');
    });

    it('GET /orders without a session returns 401', async () => {
      await list().expect(401);
    });
  });

  describe('GET /orders/:idOrOrderNumber', () => {
    const read = (value: string) =>
      request(app.getHttpServer()).get(
        `${ORDERS}/${encodeURIComponent(value)}`,
      );

    const placeFor = async (clerkId: string): Promise<OrderBody> => {
      const methodId = await createMethod();
      const { variantId } = await createProduct(10);
      signIn(clerkId);
      await addToCart(variantId, 2);
      return orderOf(await place(methodId).expect(201));
    };

    it('GET /orders/:idOrOrderNumber reads an own order by id and by orderNumber', async () => {
      const u1 = await createUser();
      const o1 = await placeFor(u1.clerkId);

      for (const value of [o1.id, o1.orderNumber]) {
        const response = await read(value).expect(200);
        const data = orderOf(response) as OrderBody & Record<string, unknown>;
        expect(data.id).toBe(o1.id);
        expect(data.items).toHaveLength(1);
        expect(data.payments[0].method).toBe('COD');
        expect(data.paymentStatus).toBe('UNPAID');
        expect(data.customer).toEqual({
          firstName: 'Order',
          lastName: 'Shopper',
          email: `${u1.clerkId}@example.com`,
        });
      }
    });

    it("GET /orders/:idOrOrderNumber of another user's order returns 404 (AC2)", async () => {
      const u1 = await createUser();
      const u2 = await createUser();
      const o1 = await placeFor(u1.clerkId);

      signIn(u2.clerkId);
      for (const value of [o1.id, o1.orderNumber]) {
        const response = await read(value).expect(404);
        expect((response.body as ErrorBody).errors[0]).toMatchObject({
          errCode: 'orderNotFound',
          field: 'idOrOrderNumber',
        });
      }
    });

    it('GET /orders/:idOrOrderNumber of an unknown value returns 404', async () => {
      const user = await createUser();
      signIn(user.clerkId);

      for (const value of [randomUUID(), 'CH-000000-0000']) {
        const response = await read(value).expect(404);
        expect((response.body as ErrorBody).errors[0].errCode).toBe(
          'orderNotFound',
        );
      }
    });

    it('GET /orders/:idOrOrderNumber without a session returns 401', async () => {
      await read(randomUUID()).expect(401);
    });
  });
  describe('admin: every order', () => {
    const list = (query: string) =>
      request(app.getHttpServer()).get(`${ORDERS}${query}`);

    const ids = (response: { body: unknown }): string[] =>
      (response.body as ListBody).data.map((row) => row.id);

    const tag = (): string => `Tag${Math.random().toString(36).slice(2, 8)}`;

    /** Places one COD order for `clerkId` with one line per quantity given. */
    const placeFor = async (
      clerkId: string,
      methodId: string,
      lines: number[] = [1],
    ): Promise<OrderBody> => {
      signIn(clerkId);
      for (const quantity of lines) {
        const { variantId } = await createProduct(10);
        await addToCart(variantId, quantity);
      }
      return orderOf(await place(methodId).expect(201));
    };

    it('GET /orders?all=true as an active admin returns the orders of both users (AC1)', async () => {
      const methodId = await createMethod();
      const admin = await createUser(UserRole.ADMIN);
      const o1 = await placeFor((await createUser()).clerkId, methodId);
      const o2 = await placeFor((await createUser()).clerkId, methodId);

      signIn(admin.clerkId);
      const response = await list('?all=true').expect(200);

      expect(ids(response)).toEqual(expect.arrayContaining([o1.id, o2.id]));
    });

    it('GET /orders?all=true&search=<number> returns only that order (AC2)', async () => {
      const methodId = await createMethod();
      const admin = await createUser(UserRole.ADMIN);
      const o1 = await placeFor((await createUser()).clerkId, methodId);
      await placeFor((await createUser()).clerkId, methodId);

      signIn(admin.clerkId);
      const response = await list(
        `?all=true&search=${encodeURIComponent(o1.orderNumber)}`,
      ).expect(200);

      expect(ids(response)).toEqual([o1.id]);
    });

    it('GET /orders?all=true&status=PENDING returns only the PENDING order (AC3)', async () => {
      const methodId = await createMethod();
      const admin = await createUser(UserRole.ADMIN);
      const lastName = tag();
      const o1 = await placeFor(
        (await createUser(UserRole.USER, lastName)).clerkId,
        methodId,
      );
      const o2 = await placeFor(
        (await createUser(UserRole.USER, lastName)).clerkId,
        methodId,
      );
      await execute("update orders set status = 'CONFIRMED' where id = ?", [
        o2.id,
      ]);

      signIn(admin.clerkId);
      const response = await list(
        `?all=true&status=PENDING&search=${lastName}`,
      ).expect(200);

      expect(ids(response)).toEqual([o1.id]);
    });

    it('GET /orders?all=true as a customer returns 403 (AC4)', async () => {
      const customer = await createUser();
      signIn(customer.clerkId);

      const response = await list('?all=true').expect(403);

      expect(response.body).toMatchObject({
        statusCode: 403,
        errors: [expect.objectContaining({ errCode: 'forbidden' })],
      });
    });

    it('GET /orders?all=true&search=<email> as a customer returns 403', async () => {
      const methodId = await createMethod();
      const other = await createUser();
      await placeFor(other.clerkId, methodId);
      const customer = await createUser();
      signIn(customer.clerkId);

      await list(
        `?all=true&search=${encodeURIComponent(`${other.clerkId}@example.com`)}`,
      ).expect(403);
    });

    it("GET /orders?search=<another user's number> as a customer returns no rows", async () => {
      const methodId = await createMethod();
      const theirs = await placeFor((await createUser()).clerkId, methodId);
      const customer = await createUser();
      await placeFor(customer.clerkId, methodId);

      signIn(customer.clerkId);
      const response = await list(
        `?search=${encodeURIComponent(theirs.orderNumber)}`,
      ).expect(200);

      expect(ids(response)).toEqual([]);
      expect((response.body as ListBody).meta.totalCount).toBe(0);
    });

    it('GET /orders?all=true paginates newest first', async () => {
      const methodId = await createMethod();
      const admin = await createUser(UserRole.ADMIN);
      const lastName = tag();
      const customer = await createUser(UserRole.USER, lastName);
      const placed: OrderBody[] = [];
      for (let i = 0; i < 3; i += 1) {
        placed.push(await placeFor(customer.clerkId, methodId, [1, 2]));
      }

      signIn(admin.clerkId);
      const response = await list(
        `?all=true&search=${lastName}&limit=2`,
      ).expect(200);

      const body = response.body as ListBody;
      expect(ids(response)).toEqual([placed[2].id, placed[1].id]);
      expect(body.data.map((row) => row.itemCount)).toEqual([3, 3]);
      expect(body.meta).toMatchObject({ totalCount: 3, pageCount: 2 });
    });

    it("GET /orders/:idOrOrderNumber as an active admin returns another user's order with items, payments and customer", async () => {
      const methodId = await createMethod();
      const admin = await createUser(UserRole.ADMIN);
      const customer = await createUser();
      const placed = await placeFor(customer.clerkId, methodId);

      signIn(admin.clerkId);
      for (const value of [placed.id, placed.orderNumber]) {
        const response = await request(app.getHttpServer())
          .get(`${ORDERS}/${encodeURIComponent(value)}`)
          .expect(200);
        const data = orderOf(response) as OrderBody & {
          customer: { firstName: string; lastName: string; email: string };
        };
        expect(data.id).toBe(placed.id);
        expect(data.items).toHaveLength(1);
        expect(data.payments[0].method).toBe('COD');
        expect(data.customer).toEqual({
          firstName: 'Order',
          lastName: 'Shopper',
          email: `${customer.clerkId}@example.com`,
        });
      }
    });

    it("GET /orders/:idOrOrderNumber of another customer's order returns 404", async () => {
      const methodId = await createMethod();
      const theirs = await placeFor((await createUser()).clerkId, methodId);
      const customer = await createUser();

      signIn(customer.clerkId);
      const response = await request(app.getHttpServer())
        .get(`${ORDERS}/${encodeURIComponent(theirs.orderNumber)}`)
        .expect(404);

      expect((response.body as ErrorBody).errors[0].errCode).toBe(
        'orderNotFound',
      );
    });

    it('GET /orders?all=true without a session returns 401', async () => {
      await list('?all=true').expect(401);
    });
  });
});
