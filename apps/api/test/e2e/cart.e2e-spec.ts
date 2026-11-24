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
  UserRole,
  UserStatus,
} from '@repo/constants';
import { AppModule } from './../../src/app.module.js';
import { API_BASE_PATH } from './../utils/api-path.util.js';
import { initTestApp } from './../utils/init-test-app.util.js';
import { UserService } from './../../src/modules/user/services/user.service.js';
import { CategoryService } from './../../src/modules/category/services/category.service.js';
import { ProductService } from './../../src/modules/product/services/product.service.js';
import { ERROR_CODES } from './../../src/common/constants/error-code.constant.js';

vi.mock('@clerk/express', async () => {
  const actual: object = await vi.importActual('@clerk/express');
  return { ...actual, getAuth: vi.fn() };
});

interface CartItemBody {
  id: string;
  productVariantId: string;
  quantity: number;
  product: {
    id: string;
    status: ProductStatus;
    primaryImageUrl: string | null;
  };
  variant: { price: number; salePrice: number; availableQuantity: number };
  inStock: boolean;
  isAvailable: boolean;
  lineTotal: number;
}

interface CartBody {
  id: string | null;
  userId: string;
  items: CartItemBody[];
  totalQuantity: number;
  subTotal: number;
}

interface MergedCartBody extends CartBody {
  adjusted: {
    productVariantId: string;
    requestedQuantity: number;
    quantity: number;
  }[];
}

interface ErrorBody {
  errors: { errCode: string; field: string }[];
}

describe('CartController (e2e)', () => {
  let app: INestApplication<App>;
  let orm: MikroORM;
  let userService: UserService;
  let categoryService: CategoryService;
  let productService: ProductService;

  const CART = `${API_BASE_PATH}/cart`;
  const ITEMS = `${CART}/items`;

  const unique = (base: string): string =>
    `${base} ${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const signIn = (clerkId: string | null): void => {
    (getAuth as Mock).mockReturnValue({ userId: clerkId });
  };

  const createUser = (
    status: UserStatus = UserStatus.ACTIVE,
  ): Promise<{ id: string; clerkId: string }> =>
    RequestContext.create(orm.em, async () => {
      const clerkId = `clerk-cart-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      let user = await userService.create({
        clerkId,
        email: `${clerkId}@example.com`,
        firstName: 'Cart',
        lastName: 'Shopper',
        role: UserRole.USER,
      });
      if (status !== UserStatus.ACTIVE) {
        user = await userService.update(user.id, { status });
      }
      return { id: user.id, clerkId };
    });

  const createProduct = (
    options: { status?: ProductStatus; stockQuantity?: number } = {},
  ): Promise<{ productId: string; variantId: string }> =>
    RequestContext.create(orm.em, async () => {
      const category = await categoryService.create({
        name: unique('Cart E2E Category'),
      });
      const product = await productService.create({
        categoryId: category.id,
        name: unique('Cart E2E Product'),
        status: options.status ?? ProductStatus.ACTIVE,
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
            sku: unique('SKU-CART-E2E'),
            size: '250',
            unit: ProductUnit.G,
            price: '10',
            discountType: DiscountType.PERCENT,
            discountValue: '0',
            stockQuantity: options.stockQuantity ?? 3,
          },
        ],
      });
      return {
        productId: product.id,
        variantId: product.variants.getItems()[0].id,
      };
    });

  const updateVariant = (
    productId: string,
    variantId: string,
    changes: { price?: string; stockQuantity?: number },
  ): Promise<unknown> =>
    RequestContext.create(orm.em, () =>
      productService.update(productId, {
        updateVariants: [{ id: variantId, ...changes }],
      }),
    );

  const add = (variantId: string, quantity?: number, key = randomUUID()) =>
    request(app.getHttpServer())
      .post(ITEMS)
      .set('Idempotency-Key', key)
      .send({ productVariantId: variantId, quantity });

  const merge = (items: unknown, key = randomUUID()) =>
    request(app.getHttpServer())
      .post(`${CART}/merge`)
      .set('Idempotency-Key', key)
      .send({ items });

  const mergedOf = (body: unknown): MergedCartBody =>
    (body as { data: MergedCartBody }).data;

  const readCart = async (): Promise<CartBody> => {
    const response = await request(app.getHttpServer()).get(CART).expect(200);
    return (response.body as { data: CartBody }).data;
  };

  const cartRowsOf = async (userId: string): Promise<number> =>
    (
      (await orm.em
        .getConnection()
        .execute(`select id from carts where user_id = ?`, [
          userId,
        ])) as unknown[]
    ).length;

  const errorOf = (body: unknown): ErrorBody['errors'][number] =>
    (body as ErrorBody).errors[0];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = await initTestApp(moduleFixture);
    orm = app.get(MikroORM);
    userService = app.get(UserService);
    categoryService = app.get(CategoryService);
    productService = app.get(ProductService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    signIn(null);
  });

  describe('ticket acceptance criteria', () => {
    it('AC1: a user with no cart adds V × 2 and gets one line V × 2', async () => {
      const user = await createUser();
      const { variantId } = await createProduct();
      signIn(user.clerkId);

      const response = await add(variantId, 2).expect(201);

      const cart = (response.body as { data: CartBody }).data;
      expect(cart.id).toEqual(expect.any(String));
      expect(cart.items).toHaveLength(1);
      expect(cart.items[0]).toMatchObject({
        productVariantId: variantId,
        quantity: 2,
      });
    });

    it('AC2: adding V × 1 again merges into one line V × 3', async () => {
      const user = await createUser();
      const { variantId } = await createProduct();
      signIn(user.clerkId);
      await add(variantId, 2).expect(201);

      const response = await add(variantId, 1).expect(201);

      const cart = (response.body as { data: CartBody }).data;
      expect(cart.items).toHaveLength(1);
      expect(cart.items[0].quantity).toBe(3);
    });

    it('AC3: V has stock 3 and the cart V × 3; adding V again answers 409 and the line stays V × 3', async () => {
      const user = await createUser();
      const { variantId } = await createProduct({ stockQuantity: 3 });
      signIn(user.clerkId);
      await add(variantId, 3).expect(201);

      const response = await add(variantId, 1).expect(409);

      expect(errorOf(response.body)).toMatchObject({
        errCode: ERROR_CODES.CART.OUT_OF_STOCK,
        field: 'quantity',
      });
      expect((await readCart()).items[0].quantity).toBe(3);
    });

    it('AC4: adding a variant of a Draft product answers 404', async () => {
      const user = await createUser();
      const { variantId } = await createProduct({
        status: ProductStatus.DRAFT,
      });
      signIn(user.clerkId);

      const response = await add(variantId, 1).expect(404);

      expect(errorOf(response.body)).toMatchObject({
        errCode: ERROR_CODES.PRODUCT_VARIANT.NOT_FOUND,
        field: 'productVariantId',
      });
    });

    it("AC5: V's price changes from 10 to 12, so the V × 2 line totals 24", async () => {
      const user = await createUser();
      const { productId, variantId } = await createProduct();
      signIn(user.clerkId);
      await add(variantId, 2).expect(201);

      await updateVariant(productId, variantId, { price: '12' });

      const cart = await readCart();
      expect(cart.items[0].variant.price).toBe(12);
      expect(cart.items[0].lineTotal).toBe(24);
      expect(cart.subTotal).toBe(24);
    });
  });

  describe('GET /cart', () => {
    it("GET /cart returns the caller's cart", async () => {
      const user = await createUser();
      const { productId, variantId } = await createProduct();
      signIn(user.clerkId);
      await add(variantId, 2).expect(201);

      const cart = await readCart();

      expect(cart.userId).toBe(user.id);
      expect(cart.totalQuantity).toBe(2);
      expect(cart.subTotal).toBe(20);
      expect(cart.items[0]).toMatchObject({
        product: {
          id: productId,
          status: ProductStatus.ACTIVE,
          primaryImageUrl: 'https://example.com/hero.jpg',
        },
        variant: { price: 10, salePrice: 10, availableQuantity: 3 },
        inStock: true,
        isAvailable: true,
        lineTotal: 20,
      });
    });

    it('returns the empty cart for a user without one', async () => {
      const user = await createUser();
      signIn(user.clerkId);

      const cart = await readCart();

      expect(cart).toMatchObject({
        id: null,
        userId: user.id,
        items: [],
        totalQuantity: 0,
        subTotal: 0,
      });
      expect(await cartRowsOf(user.id)).toBe(0);
    });

    it('GET /cart flags unavailable and short lines', async () => {
      const user = await createUser();
      const short = await createProduct({ stockQuantity: 5 });
      const inactive = await createProduct();
      const removed = await createProduct();
      signIn(user.clerkId);
      await add(short.variantId, 3).expect(201);
      await add(inactive.variantId, 1).expect(201);
      await add(removed.variantId, 1).expect(201);

      await updateVariant(short.productId, short.variantId, {
        stockQuantity: 2,
      });
      await RequestContext.create(orm.em, () =>
        productService.update(inactive.productId, {
          status: ProductStatus.INACTIVE,
        }),
      );
      await RequestContext.create(orm.em, () =>
        productService.remove(removed.productId),
      );

      const cart = await readCart();
      const byVariant = (id: string): CartItemBody | undefined =>
        cart.items.find((item) => item.productVariantId === id);

      expect(byVariant(short.variantId)).toMatchObject({
        inStock: false,
        isAvailable: true,
        variant: { availableQuantity: 2 },
      });
      expect(byVariant(inactive.variantId)).toMatchObject({
        isAvailable: false,
        product: { status: ProductStatus.INACTIVE },
      });
      expect(byVariant(removed.variantId)).toMatchObject({
        isAvailable: false,
        product: { status: ProductStatus.ARCHIVED },
      });
      expect(cart.totalQuantity).toBe(5);
      expect(cart.subTotal).toBe(50);
    });
  });

  describe('auth', () => {
    it('answers 401 without a user', async () => {
      const id = randomUUID();

      await request(app.getHttpServer()).get(CART).expect(401);
      await request(app.getHttpServer()).delete(CART).expect(401);
      await add(randomUUID(), 1).expect(401);
      await request(app.getHttpServer())
        .patch(`${ITEMS}/${id}`)
        .send({ quantity: 1 })
        .expect(401);
      await request(app.getHttpServer()).delete(`${ITEMS}/${id}`).expect(401);
    });

    it('answers 403 for an INACTIVE user', async () => {
      const user = await createUser(UserStatus.INACTIVE);
      signIn(user.clerkId);

      await request(app.getHttpServer()).get(CART).expect(403);
    });
  });

  describe('writes', () => {
    it('answers 404 for a soft-deleted product', async () => {
      const user = await createUser();
      const { productId, variantId } = await createProduct();
      await RequestContext.create(orm.em, () =>
        productService.remove(productId),
      );
      signIn(user.clerkId);

      const response = await add(variantId, 1).expect(404);

      expect(errorOf(response.body).errCode).toBe(
        ERROR_CODES.PRODUCT_VARIANT.NOT_FOUND,
      );
    });

    it('PATCH /cart/items/:id sets the quantity', async () => {
      const user = await createUser();
      const { variantId } = await createProduct();
      signIn(user.clerkId);
      const added = await add(variantId, 1).expect(201);
      const lineId = (added.body as { data: CartBody }).data.items[0].id;

      const response = await request(app.getHttpServer())
        .patch(`${ITEMS}/${lineId}`)
        .send({ quantity: 3 })
        .expect(200);

      expect((response.body as { data: CartBody }).data.items[0].quantity).toBe(
        3,
      );
    });

    it('PATCH above the stock answers 409', async () => {
      const user = await createUser();
      const { variantId } = await createProduct({ stockQuantity: 3 });
      signIn(user.clerkId);
      const added = await add(variantId, 1).expect(201);
      const lineId = (added.body as { data: CartBody }).data.items[0].id;

      const response = await request(app.getHttpServer())
        .patch(`${ITEMS}/${lineId}`)
        .send({ quantity: 4 })
        .expect(409);

      expect(errorOf(response.body)).toMatchObject({
        errCode: ERROR_CODES.CART.OUT_OF_STOCK,
        field: 'quantity',
      });
      expect((await readCart()).items[0].quantity).toBe(1);
    });

    it('DELETE /cart/items/:id removes the line', async () => {
      const user = await createUser();
      const first = await createProduct();
      const second = await createProduct();
      signIn(user.clerkId);
      await add(first.variantId, 1).expect(201);
      const added = await add(second.variantId, 1).expect(201);
      const lineId = (added.body as { data: CartBody }).data.items.find(
        (item) => item.productVariantId === second.variantId,
      )!.id;

      const response = await request(app.getHttpServer())
        .delete(`${ITEMS}/${lineId}`)
        .expect(200);

      const cart = (response.body as { data: CartBody }).data;
      expect(cart.items.map((item) => item.productVariantId)).toEqual([
        first.variantId,
      ]);
    });

    it('DELETE /cart empties the cart', async () => {
      const user = await createUser();
      const { variantId } = await createProduct();
      signIn(user.clerkId);
      await add(variantId, 2).expect(201);

      const response = await request(app.getHttpServer())
        .delete(CART)
        .expect(200);

      const cart = (response.body as { data: CartBody }).data;
      expect(cart.items).toEqual([]);
      expect(cart.totalQuantity).toBe(0);
      expect(await cartRowsOf(user.id)).toBe(1);
    });

    it("a write moves the cart's updatedAt", async () => {
      const user = await createUser();
      const { variantId } = await createProduct();
      signIn(user.clerkId);
      const first = await add(variantId, 1).expect(201);
      const created = (first.body as { data: { updatedAt: string } }).data
        .updatedAt;
      await new Promise((resolve) => setTimeout(resolve, 20));

      const second = await add(variantId, 1).expect(201);

      const updated = (second.body as { data: { updatedAt: string } }).data
        .updatedAt;
      expect(new Date(updated).getTime()).toBeGreaterThan(
        new Date(created).getTime(),
      );
    });

    it("another user's line is not found", async () => {
      const owner = await createUser();
      const other = await createUser();
      const { variantId } = await createProduct();
      signIn(owner.clerkId);
      const added = await add(variantId, 1).expect(201);
      const lineId = (added.body as { data: CartBody }).data.items[0].id;
      signIn(other.clerkId);
      await add((await createProduct()).variantId, 1).expect(201);

      const patched = await request(app.getHttpServer())
        .patch(`${ITEMS}/${lineId}`)
        .send({ quantity: 2 })
        .expect(404);
      const deleted = await request(app.getHttpServer())
        .delete(`${ITEMS}/${lineId}`)
        .expect(404);

      expect(errorOf(patched.body).errCode).toBe(
        ERROR_CODES.CART_ITEM.NOT_FOUND,
      );
      expect(errorOf(deleted.body).errCode).toBe(
        ERROR_CODES.CART_ITEM.NOT_FOUND,
      );
      signIn(owner.clerkId);
      expect((await readCart()).items[0].quantity).toBe(1);
    });

    it('a user without a cart gets 404 on a line', async () => {
      const user = await createUser();
      signIn(user.clerkId);

      const response = await request(app.getHttpServer())
        .patch(`${ITEMS}/${randomUUID()}`)
        .send({ quantity: 1 })
        .expect(404);

      expect(errorOf(response.body).errCode).toBe(
        ERROR_CODES.CART_ITEM.NOT_FOUND,
      );
      expect(await cartRowsOf(user.id)).toBe(0);
    });
  });

  describe('validation and idempotency', () => {
    it('validates the body', async () => {
      const user = await createUser();
      const { variantId } = await createProduct();
      signIn(user.clerkId);

      const zero = await add(variantId, 0).expect(400);
      const notUuid = await request(app.getHttpServer())
        .post(ITEMS)
        .set('Idempotency-Key', randomUUID())
        .send({ productVariantId: 'abc', quantity: 1 })
        .expect(400);
      const badId = await request(app.getHttpServer())
        .patch(`${ITEMS}/abc`)
        .send({ quantity: 1 })
        .expect(400);

      expect(errorOf(zero.body)).toMatchObject({
        errCode: ERROR_CODES.VALIDATION.MIN,
        field: 'quantity',
      });
      expect(errorOf(notUuid.body)).toMatchObject({
        errCode: ERROR_CODES.VALIDATION.IS_UUID,
        field: 'productVariantId',
      });
      expect(errorOf(badId.body)).toMatchObject({
        errCode: ERROR_CODES.VALIDATION.IS_UUID,
        field: 'id',
      });
    });

    it('requires an Idempotency-Key', async () => {
      const user = await createUser();
      const { variantId } = await createProduct();
      signIn(user.clerkId);

      await request(app.getHttpServer())
        .post(ITEMS)
        .send({ productVariantId: variantId, quantity: 1 })
        .expect(400);
    });

    it('a replayed add does not add twice', async () => {
      const user = await createUser();
      const { variantId } = await createProduct();
      signIn(user.clerkId);
      const key = randomUUID();

      await add(variantId, 1, key).expect(201);
      await add(variantId, 1, key).expect(201);

      expect((await readCart()).items[0].quantity).toBe(1);
    });
  });

  describe('concurrent writes', () => {
    it('two concurrent first adds create one cart', async () => {
      const user = await createUser();
      const { variantId } = await createProduct({ stockQuantity: 10 });
      signIn(user.clerkId);

      const responses = await Promise.all([
        add(variantId, 1),
        add(variantId, 2),
      ]);

      expect(responses.map((response) => response.status)).toEqual([201, 201]);
      expect(await cartRowsOf(user.id)).toBe(1);
      expect((await readCart()).items[0].quantity).toBe(3);
    });

    it('two concurrent adds never pass the stock', async () => {
      const user = await createUser();
      const { variantId } = await createProduct({ stockQuantity: 3 });
      signIn(user.clerkId);
      await add(variantId, 1).expect(201);

      const responses = await Promise.all([
        add(variantId, 2),
        add(variantId, 2),
      ]);

      expect(
        responses.map((response) => response.status).sort((a, b) => a - b),
      ).toEqual([201, 409]);
      expect((await readCart()).items[0].quantity).toBe(3);
    });
  });

  describe('POST /cart/merge', () => {
    it("merges the guest lines into the caller's cart", async () => {
      const user = await createUser();
      const { variantId } = await createProduct({ stockQuantity: 5 });
      signIn(user.clerkId);

      const response = await merge([
        { productVariantId: variantId, quantity: 2 },
      ]).expect(200);

      const cart = mergedOf(response.body);
      expect(cart.id).toEqual(expect.any(String));
      expect(cart.items).toHaveLength(1);
      expect(cart.items[0]).toMatchObject({
        productVariantId: variantId,
        quantity: 2,
      });
      expect(cart.adjusted).toEqual([]);
    });

    it('AC1: the cart has V × 1 and V has 5 left; merging V × 2 gives V × 3 and an empty adjusted', async () => {
      const user = await createUser();
      const { variantId } = await createProduct({ stockQuantity: 5 });
      signIn(user.clerkId);
      await add(variantId, 1).expect(201);

      const response = await merge([
        { productVariantId: variantId, quantity: 2 },
      ]).expect(200);

      const cart = mergedOf(response.body);
      expect(cart.items).toHaveLength(1);
      expect(cart.items[0].quantity).toBe(3);
      expect(cart.adjusted).toEqual([]);
    });

    it('AC2: V has 3 left and the cart V × 2; merging V × 4 gives V × 3 and adjusted { V, 4, 1 }', async () => {
      const user = await createUser();
      const { variantId } = await createProduct({ stockQuantity: 3 });
      signIn(user.clerkId);
      await add(variantId, 2).expect(201);

      const response = await merge([
        { productVariantId: variantId, quantity: 4 },
      ]).expect(200);

      const cart = mergedOf(response.body);
      expect(cart.items[0].quantity).toBe(3);
      expect(cart.adjusted).toEqual([
        { productVariantId: variantId, requestedQuantity: 4, quantity: 1 },
      ]);
    });

    it('AC3: merging a variant of an Inactive product skips it with quantity 0', async () => {
      const user = await createUser();
      const { variantId } = await createProduct({
        status: ProductStatus.INACTIVE,
        stockQuantity: 5,
      });
      signIn(user.clerkId);

      const response = await merge([
        { productVariantId: variantId, quantity: 1 },
      ]).expect(200);

      const cart = mergedOf(response.body);
      expect(cart.items).toEqual([]);
      expect(cart.adjusted).toEqual([
        { productVariantId: variantId, requestedQuantity: 1, quantity: 0 },
      ]);
      expect(await cartRowsOf(user.id)).toBe(0);
    });

    it('AC4: items that is not an array answers 400', async () => {
      const user = await createUser();
      signIn(user.clerkId);

      const response = await merge('x').expect(400);

      expect(errorOf(response.body).field).toBe('items');
      expect(await cartRowsOf(user.id)).toBe(0);
    });

    it('a resend with the same Idempotency-Key replays the first response and adds nothing', async () => {
      const user = await createUser();
      const { variantId } = await createProduct({ stockQuantity: 5 });
      signIn(user.clerkId);
      const key = randomUUID();
      const items = [{ productVariantId: variantId, quantity: 2 }];

      const first = await merge(items, key).expect(200);
      const second = await merge(items, key).expect(200);

      expect(second.headers['idempotent-replayed']).toBe('true');
      expect(mergedOf(second.body)).toEqual(mergedOf(first.body));
      expect((await readCart()).items[0].quantity).toBe(2);
    });

    it('a failing line leaves the cart unchanged', async () => {
      const user = await createUser();
      const { variantId } = await createProduct({ stockQuantity: 5 });
      signIn(user.clerkId);
      await add(variantId, 1).expect(201);

      await merge([
        { productVariantId: variantId, quantity: 2 },
        { productVariantId: 'abc', quantity: 1 },
      ]).expect(400);

      const cart = await readCart();
      expect(cart.items).toHaveLength(1);
      expect(cart.items[0].quantity).toBe(1);
    });

    it('answers 401 without a user', async () => {
      await merge([{ productVariantId: randomUUID(), quantity: 1 }]).expect(
        401,
      );
    });
  });
});
