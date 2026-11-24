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
  OrderPaymentStatus,
  OrderStatus,
  ProductStatus,
  ProductUnit,
  RoastLevel,
  ShippingStatus,
  UserRole,
} from '@repo/constants';
import { AppModule } from './../../src/app.module.js';
import { API_BASE_PATH } from './../utils/api-path.util.js';
import { initTestApp } from './../utils/init-test-app.util.js';
import { UserService } from './../../src/modules/user/services/user.service.js';
import { CategoryService } from './../../src/modules/category/services/category.service.js';
import { ProductService } from './../../src/modules/product/services/product.service.js';
import { ShippingMethodService } from './../../src/modules/shipping-method/services/shipping-method.service.js';
import { OrderRepository } from './../../src/modules/order/repositories/order.repository.js';
import type { OrderFilters } from './../../src/modules/order/dto/order.schema.js';
import type { Order } from './../../src/modules/order/entities/order.entity.js';
import type { PaginatedResult } from './../../src/common/dto/pagination.dto.js';

vi.mock('@clerk/express', async () => {
  const actual: object = await vi.importActual('@clerk/express');
  return { ...actual, getAuth: vi.fn() };
});

interface Placed {
  id: string;
  orderNumber: string;
}

interface Customer {
  id: string;
  clerkId: string;
}

describe('OrderRepository search (e2e)', () => {
  let app: INestApplication<App>;
  let orm: MikroORM;
  let userService: UserService;
  let categoryService: CategoryService;
  let productService: ProductService;
  let shippingMethodService: ShippingMethodService;
  let orders: OrderRepository;
  let methodId: string;

  const ORDERS = `${API_BASE_PATH}/orders`;
  const ITEMS = `${API_BASE_PATH}/cart/items`;
  const PAGE = { page: 1, limit: 50 };

  // Every search carries a per-test token, so rows other specs left in the
  // shared e2e database never match.
  const token = (): string => Math.random().toString(36).slice(2, 8);

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
    firstName: string,
    lastName: string,
    email?: string,
  ): Promise<Customer> =>
    RequestContext.create(orm.em, async () => {
      const clerkId = `clerk-search-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const user = await userService.create({
        clerkId,
        email: email ?? `${clerkId}@example.com`,
        firstName,
        lastName,
        role: UserRole.USER,
      });
      return { id: user.id, clerkId };
    });

  const createVariant = (): Promise<string> =>
    RequestContext.create(orm.em, async () => {
      const category = await categoryService.create({
        name: unique('Search E2E Category'),
      });
      const product = await productService.create({
        categoryId: category.id,
        name: unique('Search E2E Product'),
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
        ],
        variants: [
          {
            sku: unique('SKU-SEARCH'),
            size: '250',
            unit: ProductUnit.G,
            price: '10',
            discountType: DiscountType.PERCENT,
            discountValue: '0',
            stockQuantity: 20,
          },
        ],
      });
      return product.variants.getItems()[0].id;
    });

  /** Places one order of one line for the customer, through the API. */
  const place = async (
    customer: Customer,
    recipientName = 'Search Recipient',
  ): Promise<Placed & { variantId: string }> => {
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
        recipientName,
        recipientPhone: '0901234567',
        addressLine: '12 Le Loi',
        ward: 'Ben Nghe',
        district: 'District 1',
        city: 'Ho Chi Minh City',
        postalCode: '700000',
      })
      .expect(201);
    signIn(null);
    return { ...(response.body as { data: Placed }).data, variantId };
  };

  const filters = (extra: Partial<OrderFilters> = {}): OrderFilters => ({
    sort: 'createdAt',
    order: 'DESC',
    ...extra,
  });

  const findAll = (
    extra: Partial<OrderFilters> = {},
  ): Promise<PaginatedResult<Order>> =>
    RequestContext.create(orm.em, () => orders.findAll(PAGE, filters(extra)));

  const numbersOf = (result: PaginatedResult<Order>): string[] =>
    result.data.map((order) => order.orderNumber);

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
    orders = app.get(OrderRepository);
    methodId = await RequestContext.create(orm.em, async () => {
      const method = await shippingMethodService.create(
        {
          name: unique('Search Express'),
          description: '1-2 business days',
          price: 12,
        },
        null,
      );
      return method.id;
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    signIn(null);
  });

  it('unaccent extension is installed', async () => {
    const rows = await execute<unknown[]>(
      "select 1 from pg_extension where extname = 'unaccent'",
    );

    expect(rows).toHaveLength(1);
  });

  it('findAll matches the order number', async () => {
    const customer = await createUser('Number', 'Match');
    const first = await place(customer);
    await place(customer);

    const result = await findAll({ search: first.orderNumber });

    expect(numbersOf(result)).toEqual([first.orderNumber]);
    expect(result.meta.totalCount).toBe(1);
  });

  it('findAll matches every word against order and customer fields', async () => {
    const tok = token();
    const john = await createUser(
      'John',
      `Smith${tok}`,
      `john.${tok}@example.com`,
    );
    const byAccount = await place(john);
    const other = await createUser('Other', `Buyer${tok}`);
    const byRecipient = await place(other, `Trần Thị Bích${tok}`);

    expect(numbersOf(await findAll({ search: `john smith${tok}` }))).toEqual([
      byAccount.orderNumber,
    ]);
    expect(
      numbersOf(
        await findAll({ search: `smith${tok} john.${tok}@example.com` }),
      ),
    ).toEqual([byAccount.orderNumber]);
    expect(numbersOf(await findAll({ search: `john nobody${tok}` }))).toEqual(
      [],
    );
    expect(numbersOf(await findAll({ search: `thị bích${tok}` }))).toEqual([
      byRecipient.orderNumber,
    ]);
  });

  it('findAll ignores accents', async () => {
    const tok = token();
    const accented = await createUser('Lan', `Nguyễn${tok}`);
    const byLastName = await place(accented);
    const plain = await createUser('Plain', `Buyer${tok}`);
    const byRecipient = await place(plain, `Đức Anh${tok}`);

    const lastName = await findAll({ search: `nguyen${tok}` });
    expect(numbersOf(lastName)).toEqual([byLastName.orderNumber]);
    expect(lastName.meta.totalCount).toBe(1);

    const recipient = await findAll({ search: `duc anh${tok}` });
    expect(numbersOf(recipient)).toEqual([byRecipient.orderNumber]);
    expect(recipient.meta.totalCount).toBe(1);
  });

  it('findAll treats LIKE characters literally and a blank search as none', async () => {
    const tok = token();
    const customer = await createUser('Like', `Chars${tok}`);
    await place(customer, `Fifty${tok}`);

    expect((await findAll({ search: `50%${tok}` })).meta.totalCount).toBe(0);
    expect((await findAll({ search: `fift_${tok}` })).meta.totalCount).toBe(0);

    const everything = await findAll();
    expect((await findAll({ search: '   ' })).meta.totalCount).toBe(
      everything.meta.totalCount,
    );
  });

  it('findAll matches only the first 10 words of the term', async () => {
    const tok = token();
    const customer = await createUser('Capped', `Words${tok}`);
    const placed = await place(customer);
    const tenWords = Array.from({ length: 10 }, () => `words${tok}`).join(' ');

    expect(
      numbersOf(await findAll({ search: `${tenWords} nomatch${tok}` })),
    ).toEqual([placed.orderNumber]);
  });

  it('findAll drops a leading # from the term', async () => {
    const customer = await createUser('Hash', 'Prefix');
    const placed = await place(customer);

    expect(
      numbersOf(await findAll({ search: `#${placed.orderNumber}` })),
    ).toEqual([placed.orderNumber]);
  });

  it('findAll filters by status and shipping status', async () => {
    const tok = token();
    const customer = await createUser('Filter', `Status${tok}`);
    const confirmed = await place(customer);
    const pending = await place(customer);
    await execute(
      "update orders set status = 'CONFIRMED', shipping_status = 'SHIPPING' where id = ?",
      [confirmed.id],
    );
    const search = `status${tok}`;

    expect(
      numbersOf(await findAll({ search, status: OrderStatus.CONFIRMED })),
    ).toEqual([confirmed.orderNumber]);
    expect(
      numbersOf(await findAll({ search, status: OrderStatus.PENDING })),
    ).toEqual([pending.orderNumber]);
    expect(
      numbersOf(
        await findAll({ search, shippingStatus: ShippingStatus.SHIPPING }),
      ),
    ).toEqual([confirmed.orderNumber]);
  });

  it('findAll filters by payment status across users', async () => {
    const tok = token();
    const first = await place(await createUser('Pay', `One${tok}`));
    const second = await place(await createUser('Pay', `Two${tok}`));

    const result = await findAll({
      search: tok,
      paymentStatus: OrderPaymentStatus.UNPAID,
    });

    expect(numbersOf(result).sort()).toEqual(
      [first.orderNumber, second.orderNumber].sort(),
    );
  });

  it('findAll keeps orders of a soft-deleted user', async () => {
    const tok = token();
    const customer = await createUser('Gone', `Away${tok}`);
    const placed = await place(customer);
    await execute('update users set deleted_at = now() where id = ?', [
      customer.id,
    ]);

    const result = await findAll({ search: `away${tok}` });

    expect(numbersOf(result)).toEqual([placed.orderNumber]);
    expect(result.data[0].user.lastName).toBe(`Away${tok}`);
  });

  it('findAnyByIdOrNumber keeps a line whose variant was soft-deleted', async () => {
    const customer = await createUser('Variant', 'Removed');
    const placed = await place(customer);
    await execute(
      'update product_variants set deleted_at = now() where id = ?',
      [placed.variantId],
    );

    const order = await RequestContext.create(orm.em, () =>
      orders.findAnyByIdOrNumber({ orderNumber: placed.orderNumber }),
    );

    expect(order?.id).toBe(placed.id);
    expect(order?.items.getItems()).toHaveLength(1);
    expect(order?.user.firstName).toBe('Variant');
  });

  it("findMine with a search stays inside the user's orders", async () => {
    const owner = await createUser('Owner', 'Mine');
    await place(owner);
    const stranger = await createUser('Stranger', 'Theirs');
    const theirs = await place(stranger);

    const result = await RequestContext.create(orm.em, () =>
      orders.findMine(owner.id, PAGE, filters({ search: theirs.orderNumber })),
    );

    expect(result.data).toEqual([]);
    expect(result.meta.totalCount).toBe(0);
  });
});
