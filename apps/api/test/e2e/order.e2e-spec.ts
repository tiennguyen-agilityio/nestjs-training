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

  const createUser = (): Promise<{ id: string; clerkId: string }> =>
    RequestContext.create(orm.em, async () => {
      const clerkId = `clerk-order-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const user = await userService.create({
        clerkId,
        email: `${clerkId}@example.com`,
        firstName: 'Order',
        lastName: 'Shopper',
        role: UserRole.USER,
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
});
