import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { MikroORM, RequestContext } from '@mikro-orm/core';
import { App } from 'supertest/types';
import {
  DiscountType,
  ProductStatus,
  ProductUnit,
  RoastLevel,
  UserRole,
} from '@repo/constants';
import { AppModule } from './../../src/app.module.js';
import { initTestApp } from './../utils/init-test-app.util.js';
import { UserService } from './../../src/modules/user/services/user.service.js';
import { CategoryService } from './../../src/modules/category/services/category.service.js';
import { ProductService } from './../../src/modules/product/services/product.service.js';
import { CartRepository } from './../../src/modules/cart/repositories/cart.repository.js';
import { CartItemRepository } from './../../src/modules/cart/repositories/cart-item.repository.js';

// The database rules of the carts and cart_items tables (design › Data), and
// the cart repositories' locking and deletes, against the real database.
describe('carts and cart_items (e2e)', () => {
  let app: INestApplication<App>;
  let orm: MikroORM;
  let userService: UserService;
  let categoryService: CategoryService;
  let productService: ProductService;
  let cartRepository: CartRepository;
  let cartItemRepository: CartItemRepository;

  const unique = (base: string): string =>
    `${base} ${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const execute = (sql: string, params: unknown[] = []): Promise<unknown[]> =>
    orm.em.getConnection().execute(sql, params);

  const createUser = (): Promise<string> =>
    RequestContext.create(orm.em, async () => {
      const clerkId = `clerk-cart-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const user = await userService.create({
        clerkId,
        email: `${clerkId}@example.com`,
        firstName: 'Cart',
        lastName: 'Test',
        role: UserRole.USER,
      });
      return user.id;
    });

  const createVariant = (): Promise<string> =>
    RequestContext.create(orm.em, async () => {
      const category = await categoryService.create({
        name: unique('Cart Category'),
      });
      const product = await productService.create({
        categoryId: category.id,
        name: unique('Cart Product'),
        status: ProductStatus.ACTIVE,
        roastLevel: RoastLevel.MEDIUM,
        description: 'A balanced coffee.',
        origin: 'Ethiopia',
        processingMethod: 'Washed',
        images: [],
        variants: [
          {
            sku: unique('SKU-CART'),
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

  const insertCart = (userId: string): Promise<unknown[]> =>
    execute(
      `insert into carts (id, user_id, created_at, updated_at) values (?, ?, now(), now())`,
      [randomUUID(), userId],
    );

  const insertLine = (
    cartId: string,
    variantId: string,
    quantity: number,
  ): Promise<unknown[]> =>
    execute(
      `insert into cart_items (id, cart_id, product_variant_id, quantity, created_at, updated_at)
       values (?, ?, ?, ?, now(), now())`,
      [randomUUID(), cartId, variantId, quantity],
    );

  const cartIdOf = async (userId: string): Promise<string> => {
    const rows = (await execute(`select id from carts where user_id = ?`, [
      userId,
    ])) as { id: string }[];
    return rows[0].id;
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
    cartRepository = app.get(CartRepository);
    cartItemRepository = app.get(CartItemRepository);
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects a second cart for the same user', async () => {
    const userId = await createUser();
    await insertCart(userId);

    await expect(insertCart(userId)).rejects.toThrow(/unique/i);
  });

  it('rejects a second line for the same variant in one cart', async () => {
    const userId = await createUser();
    const variantId = await createVariant();
    await insertCart(userId);
    const cartId = await cartIdOf(userId);
    await insertLine(cartId, variantId, 1);

    await expect(insertLine(cartId, variantId, 2)).rejects.toThrow(/unique/i);
  });

  it('rejects a quantity of 0', async () => {
    const userId = await createUser();
    const variantId = await createVariant();
    await insertCart(userId);

    await expect(
      insertLine(await cartIdOf(userId), variantId, 0),
    ).rejects.toThrow(/check/i);
  });

  it('lockOrCreateForUser twice returns the same cart', async () => {
    const userId = await createUser();

    const lock = (): Promise<string> =>
      RequestContext.create(orm.em, () =>
        cartRepository.transactional(async () => {
          const cart = await cartRepository.lockOrCreateForUser(userId);
          return cart.id;
        }),
      );
    const first = await lock();
    const second = await lock();

    expect(second).toBe(first);
    const rows = await execute(`select id from carts where user_id = ?`, [
      userId,
    ]);
    expect(rows).toHaveLength(1);
  });

  it('lockByUser returns null for a user without a cart and creates nothing', async () => {
    const userId = await createUser();

    const cart = await RequestContext.create(orm.em, () =>
      cartRepository.transactional(() => cartRepository.lockByUser(userId)),
    );

    expect(cart).toBeNull();
    const rows = await execute(`select id from carts where user_id = ?`, [
      userId,
    ]);
    expect(rows).toHaveLength(0);
  });

  it('deleteByCart removes the lines and keeps the cart', async () => {
    const userId = await createUser();
    const [first, second] = [await createVariant(), await createVariant()];
    await insertCart(userId);
    const cartId = await cartIdOf(userId);
    await insertLine(cartId, first, 1);
    await insertLine(cartId, second, 2);

    const deleted = await RequestContext.create(orm.em, () =>
      cartItemRepository.deleteByCart(cartId),
    );

    expect(deleted).toBe(2);
    expect(
      await execute(`select id from cart_items where cart_id = ?`, [cartId]),
    ).toHaveLength(0);
    expect(
      await execute(`select id from carts where id = ?`, [cartId]),
    ).toHaveLength(1);
  });
});
