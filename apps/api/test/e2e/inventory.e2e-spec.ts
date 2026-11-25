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
  StockLevel,
  UserRole,
  InventoryMovementType,
} from '@repo/constants';
import { AppModule } from './../../src/app.module.js';
import { API_BASE_PATH } from './../utils/api-path.util.js';
import { initTestApp } from './../utils/init-test-app.util.js';
import { UserService } from './../../src/modules/user/services/user.service.js';
import { CategoryService } from './../../src/modules/category/services/category.service.js';
import { ProductService } from './../../src/modules/product/services/product.service.js';
import { ShippingMethodService } from './../../src/modules/shipping-method/services/shipping-method.service.js';
import { ProductVariantRepository } from './../../src/modules/product-variant/repositories/product-variant.repository.js';

vi.mock('@clerk/express', async () => {
  const actual: object = await vi.importActual('@clerk/express');
  return { ...actual, getAuth: vi.fn() };
});

interface InventoryRow {
  id: string;
  sku: string;
  stockQuantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  stockLevel: StockLevel;
  product: {
    id: string;
    name: string;
    status: ProductStatus;
    primaryImageUrl: string | null;
  };
}

interface ListBody {
  data: InventoryRow[];
  meta: { totalCount: number };
}

describe('Inventory (e2e)', () => {
  let app: INestApplication<App>;
  let orm: MikroORM;
  let userService: UserService;
  let categoryService: CategoryService;
  let productService: ProductService;
  let shippingMethodService: ShippingMethodService;

  const INVENTORY = `${API_BASE_PATH}/inventory`;
  const VARIANTS = `${API_BASE_PATH}/product-variants`;

  const token = (): string => Math.random().toString(36).slice(2, 8);

  const execute = async (
    sql: string,
    params: unknown[] = [],
  ): Promise<void> => {
    await orm.em.getConnection().execute(sql, params);
  };

  const signIn = (clerkId: string | null): void => {
    (getAuth as Mock).mockReturnValue({ userId: clerkId });
  };

  const createUser = (
    role: UserRole,
  ): Promise<{ id: string; clerkId: string }> =>
    RequestContext.create(orm.em, async () => {
      const clerkId = `clerk-inv-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const user = await userService.create({
        clerkId,
        email: `${clerkId}@example.com`,
        firstName: 'Inventory',
        lastName: 'Admin',
        role,
      });
      return { id: user.id, clerkId };
    });

  /** One product named `<name>` with one variant per stock; reserved set by SQL. */
  const createProduct = (
    name: string,
    stocks: { stock: number; reserved?: number }[],
    status: ProductStatus = ProductStatus.ACTIVE,
  ): Promise<{ productId: string; variantIds: string[] }> =>
    RequestContext.create(orm.em, async () => {
      const category = await categoryService.create({
        name: `Inventory E2E ${token()}`,
      });
      const product = await productService.create({
        categoryId: category.id,
        name,
        status,
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
        variants: stocks.map(({ stock }, index) => ({
          sku: `SKU-INV-${token()}-${index}`,
          size: String(250 + index),
          unit: ProductUnit.G,
          price: '10',
          discountType: DiscountType.PERCENT,
          discountValue: '0',
          stockQuantity: stock,
        })),
      });
      const variants = product.variants
        .getItems()
        .sort((a, b) => Number(a.size) - Number(b.size));
      for (const [index, { reserved = 0 }] of stocks.entries()) {
        await execute(
          'update product_variants set reserved_quantity = ? where id = ?',
          [reserved, variants[index].id],
        );
      }
      return {
        productId: product.id,
        variantIds: variants.map(({ id }) => id),
      };
    });

  const list = (query: Record<string, string | number>) =>
    request(app.getHttpServer()).get(INVENTORY).query(query);

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

  let admin: { id: string; clerkId: string };

  beforeEach(async () => {
    admin = await createUser(UserRole.ADMIN);
    signIn(admin.clerkId);
  });

  const movementsOf = async (variantId: string) =>
    (await orm.em
      .getConnection()
      .execute(
        'select type, quantity, reason, created_by from inventory_movements where product_variant_id = ? order by created_at',
        [variantId],
      )) as {
      type: string;
      quantity: number;
      reason: string | null;
      created_by: string | null;
    }[];

  const stockOf = async (variantId: string): Promise<number> =>
    (
      (await orm.em
        .getConnection()
        .execute('select stock_quantity from product_variants where id = ?', [
          variantId,
        ])) as { stock_quantity: number }[]
    )[0].stock_quantity;

  const post = (variantId: string, action: string, body: object) =>
    request(app.getHttpServer())
      .post(`${VARIANTS}/${variantId}/${action}`)
      .set('Idempotency-Key', randomUUID())
      .send(body);

  describe('GET /inventory', () => {
    it('GET /inventory lists every variant with stock, reserved, available and its product', async () => {
      const name = `Inventory List ${token()}`;
      const { productId, variantIds } = await createProduct(name, [
        { stock: 9, reserved: 4 },
      ]);

      const response = await list({ search: name }).expect(200);

      const body = response.body as ListBody;
      expect(body.meta.totalCount).toBe(1);
      expect(body.data[0]).toMatchObject({
        id: variantIds[0],
        stockQuantity: 9,
        reservedQuantity: 4,
        availableQuantity: 5,
        stockLevel: StockLevel.LOW,
        product: {
          id: productId,
          name,
          status: ProductStatus.ACTIVE,
          primaryImageUrl: 'https://example.com/hero.jpg',
        },
      });
    });

    it('GET /inventory?lowStock=true returns only LOW and OUT variants', async () => {
      const name = `Inventory Low ${token()}`;
      const { variantIds } = await createProduct(name, [
        { stock: 3, reserved: 3 },
        { stock: 5 },
        { stock: 6 },
      ]);

      const response = await list({ search: name, lowStock: 'true' }).expect(
        200,
      );

      const rows = (response.body as ListBody).data;
      expect(rows.map(({ id }) => id).sort()).toEqual(
        [variantIds[0], variantIds[1]].sort(),
      );
      expect(rows.map(({ stockLevel }) => stockLevel).sort()).toEqual([
        StockLevel.LOW,
        StockLevel.OUT,
      ]);
    });

    it('GET /inventory?sort=availableQuantity orders by available', async () => {
      const name = `Inventory Sort ${token()}`;
      const { variantIds } = await createProduct(name, [
        { stock: 20, reserved: 2 },
        { stock: 8, reserved: 1 },
        { stock: 30, reserved: 29 },
      ]);

      const ascending = await list({ search: name }).expect(200);
      const descending = await list({ search: name, order: 'DESC' }).expect(
        200,
      );

      expect((ascending.body as ListBody).data.map(({ id }) => id)).toEqual([
        variantIds[2],
        variantIds[1],
        variantIds[0],
      ]);
      expect((descending.body as ListBody).data.map(({ id }) => id)).toEqual([
        variantIds[0],
        variantIds[1],
        variantIds[2],
      ]);
    });

    it('GET /inventory?activeOnly=true leaves out DRAFT products', async () => {
      const tag = token();
      await createProduct(`Inventory Active ${tag}`, [{ stock: 1 }]);
      await createProduct(
        `Inventory Draft ${tag}`,
        [{ stock: 1 }],
        ProductStatus.DRAFT,
      );

      const all = await list({ search: tag }).expect(200);
      const active = await list({ search: tag, activeOnly: 'true' }).expect(
        200,
      );

      expect((all.body as ListBody).meta.totalCount).toBe(2);
      expect(
        (active.body as ListBody).data.map(({ product }) => product.status),
      ).toEqual([ProductStatus.ACTIVE]);
    });

    it('GET /inventory hides deleted variants and products', async () => {
      const tag = token();
      const kept = await createProduct(`Inventory Kept ${tag}`, [
        { stock: 1 },
        { stock: 2 },
      ]);
      const gone = await createProduct(`Inventory Gone ${tag}`, [{ stock: 1 }]);
      await execute(
        'update product_variants set deleted_at = now() where id = ?',
        [kept.variantIds[1]],
      );
      await execute('update products set deleted_at = now() where id = ?', [
        gone.productId,
      ]);

      const response = await list({ search: tag }).expect(200);

      expect((response.body as ListBody).data.map(({ id }) => id)).toEqual([
        kept.variantIds[0],
      ]);
    });

    it('GET /inventory as a customer returns 403', async () => {
      signIn((await createUser(UserRole.USER)).clerkId);

      await list({}).expect(403);
    });
  });

  describe('GET /product-variants/:id', () => {
    it('GET /product-variants/:id returns one inventory row', async () => {
      const name = `Inventory One ${token()}`;
      const { variantIds } = await createProduct(name, [
        { stock: 12, reserved: 2 },
      ]);

      const response = await request(app.getHttpServer())
        .get(`${VARIANTS}/${variantIds[0]}`)
        .expect(200);

      expect((response.body as { data: InventoryRow }).data).toMatchObject({
        id: variantIds[0],
        availableQuantity: 10,
        stockLevel: StockLevel.OK,
        product: { name },
      });
    });

    it('GET /product-variants/:id of a deleted variant returns 404', async () => {
      const { variantIds } = await createProduct(
        `Inventory Deleted ${token()}`,
        [{ stock: 1 }],
      );
      await execute(
        'update product_variants set deleted_at = now() where id = ?',
        [variantIds[0]],
      );

      const response = await request(app.getHttpServer())
        .get(`${VARIANTS}/${variantIds[0]}`)
        .expect(404);

      expect(
        (response.body as { errors: { errCode: string }[] }).errors[0].errCode,
      ).toBe('productVariantNotFound');
    });
  });

  describe('restock and adjust', () => {
    it('POST /product-variants/:id/restock adds stock and writes one RESTOCK by the admin', async () => {
      const { variantIds } = await createProduct(`Restock ${token()}`, [
        { stock: 4, reserved: 1 },
      ]);
      const [variantId] = variantIds;

      const response = await post(variantId, 'restock', {
        quantity: 10,
      }).expect(201);

      const { data } = response.body as {
        data: {
          variant: InventoryRow;
          movement: {
            type: string;
            quantity: number;
            reason: string | null;
            createdBy: { id: string; firstName: string } | null;
          };
        };
      };
      expect(data.variant).toMatchObject({
        id: variantId,
        stockQuantity: 14,
        availableQuantity: 13,
      });
      expect(data.movement).toMatchObject({
        type: 'RESTOCK',
        quantity: 10,
        reason: null,
        createdBy: { id: admin.id, firstName: 'Inventory' },
      });
      expect(await movementsOf(variantId)).toEqual([
        { type: 'RESTOCK', quantity: 10, reason: null, created_by: admin.id },
      ]);
    });

    it('POST /product-variants/:id/adjustments with a reason writes one signed ADJUSTMENT', async () => {
      const { variantIds } = await createProduct(`Adjust ${token()}`, [
        { stock: 9 },
      ]);
      const [variantId] = variantIds;

      const response = await post(variantId, 'adjustments', {
        quantity: -2,
        reason: '  Damaged bags ',
      }).expect(201);

      expect(
        (response.body as { data: { variant: InventoryRow } }).data.variant
          .stockQuantity,
      ).toBe(7);
      expect((await movementsOf(variantId)).at(-1)).toEqual({
        type: 'ADJUSTMENT',
        quantity: -2,
        reason: 'Damaged bags',
        created_by: admin.id,
      });
    });

    it('POST …/adjustments below reserved returns 409 and writes nothing', async () => {
      const { variantIds } = await createProduct(`Below ${token()}`, [
        { stock: 5, reserved: 3 },
      ]);
      const [variantId] = variantIds;

      const response = await post(variantId, 'adjustments', {
        quantity: -3,
        reason: 'Count correction',
      }).expect(409);

      expect(
        (
          response.body as {
            errors: { errCode: string; field: string; message: string }[];
          }
        ).errors[0],
      ).toMatchObject({
        errCode: 'stockBelowReserved',
        field: 'quantity',
        message: 'Stock cannot be below the 3 units held for orders',
      });
      expect(await stockOf(variantId)).toBe(5);
      expect(await movementsOf(variantId)).toHaveLength(0);
    });

    it('POST …/restock above the max returns 409 and writes nothing', async () => {
      const { variantIds } = await createProduct(`Max ${token()}`, [
        { stock: 999_995 },
      ]);
      const [variantId] = variantIds;

      const response = await post(variantId, 'restock', {
        quantity: 10,
      }).expect(409);

      expect(
        (response.body as { errors: { errCode: string }[] }).errors[0].errCode,
      ).toBe('stockAboveMax');
      expect(await stockOf(variantId)).toBe(999_995);
      expect(await movementsOf(variantId)).toHaveLength(0);
    });

    it('restock of a deleted variant returns 404', async () => {
      const { variantIds } = await createProduct(`Gone ${token()}`, [
        { stock: 1 },
      ]);
      await execute(
        'update product_variants set deleted_at = now() where id = ?',
        [variantIds[0]],
      );

      await post(variantIds[0], 'restock', { quantity: 1 }).expect(404);
    });

    it('changeStock leaves a variant whose product was deleted after the check, as notFound', async () => {
      const { variantIds } = await createProduct(`Gone Later ${token()}`, [
        { stock: 1 },
      ]);
      const [variantId] = variantIds;
      const repository = app.get(ProductVariantRepository);

      const results = await RequestContext.create(orm.em, async () => {
        const variant = await repository.findActiveWithProduct(variantId);
        await execute(
          'update products set deleted_at = now() where id = (select product_id from product_variants where id = ?)',
          [variantId],
        );
        const change = (quantity: number) =>
          repository.changeStock(
            variant!,
            quantity,
            { type: InventoryMovementType.ADJUSTMENT, reason: 'Count' },
            admin.id,
          );
        // A change the numbers allow, and one they refuse: both are a 404.
        return [await change(2), await change(-5)];
      });

      expect(results).toEqual(['notFound', 'notFound']);
      expect(await stockOf(variantId)).toBe(1);
      expect(await movementsOf(variantId)).toHaveLength(0);
    });

    it('POST …/adjustments without a reason returns 400', async () => {
      const { variantIds } = await createProduct(`No Reason ${token()}`, [
        { stock: 1 },
      ]);

      await post(variantIds[0], 'adjustments', { quantity: 1 }).expect(400);
    });

    it('a customer restocking gets 403', async () => {
      const { variantIds } = await createProduct(`Customer ${token()}`, [
        { stock: 1 },
      ]);
      signIn((await createUser(UserRole.USER)).clerkId);

      await post(variantIds[0], 'restock', { quantity: 1 }).expect(403);
    });
  });

  describe('GET /product-variants/:id/movements', () => {
    interface MovementBody {
      type: string;
      quantity: number;
      reason: string | null;
      orderNumber: string | null;
      createdBy: { id: string; firstName: string } | null;
    }

    /** A customer orders `quantity` units through the API: one RESERVE. */
    const placeOrder = async (variantId: string, quantity: number) => {
      const methodId = await RequestContext.create(orm.em, async () => {
        const method = await shippingMethodService.create(
          {
            name: `Inventory Ship ${token()}`,
            description: '1-2 business days',
            price: 5,
          },
          null,
        );
        return method.id;
      });
      signIn((await createUser(UserRole.USER)).clerkId);
      await request(app.getHttpServer())
        .post(`${API_BASE_PATH}/cart/items`)
        .set('Idempotency-Key', randomUUID())
        .send({ productVariantId: variantId, quantity })
        .expect(201);
      const response = await request(app.getHttpServer())
        .post(`${API_BASE_PATH}/orders`)
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
      signIn(admin.clerkId);
      return (response.body as { data: { orderNumber: string } }).data
        .orderNumber;
    };

    const history = (variantId: string, query: Record<string, string> = {}) =>
      request(app.getHttpServer())
        .get(`${VARIANTS}/${variantId}/movements`)
        .query(query);

    it('GET /product-variants/:id/movements lists every movement newest first with its admin', async () => {
      const { variantIds } = await createProduct(`History ${token()}`, [
        { stock: 10 },
      ]);
      const [variantId] = variantIds;
      await post(variantId, 'restock', { quantity: 3 }).expect(201);
      const orderNumber = await placeOrder(variantId, 2);
      await post(variantId, 'adjustments', {
        quantity: -1,
        reason: 'Torn bag',
      }).expect(201);

      const response = await history(variantId).expect(200);

      const { data, meta } = response.body as {
        data: MovementBody[];
        meta: { totalCount: number };
      };
      expect(meta.totalCount).toBe(3);
      expect(data.map(({ type }) => type)).toEqual([
        'ADJUSTMENT',
        'RESERVE',
        'RESTOCK',
      ]);
      expect(data[0]).toMatchObject({
        quantity: -1,
        reason: 'Torn bag',
        orderNumber: null,
        createdBy: { id: admin.id, firstName: 'Inventory' },
      });
      expect(data[1]).toMatchObject({
        quantity: 2,
        orderNumber,
        createdBy: null,
      });
    });

    it('GET …/movements?type=ADJUSTMENT returns only adjustments', async () => {
      const { variantIds } = await createProduct(`History Type ${token()}`, [
        { stock: 5 },
      ]);
      await post(variantIds[0], 'adjustments', {
        quantity: 2,
        reason: 'Found in the back',
      }).expect(201);

      const response = await history(variantIds[0], {
        type: 'ADJUSTMENT',
      }).expect(200);

      expect(
        (response.body as { data: MovementBody[] }).data.map(
          ({ type }) => type,
        ),
      ).toEqual(['ADJUSTMENT']);
    });

    it('GET …/movements of a deleted variant returns 404', async () => {
      const { variantIds } = await createProduct(`History Gone ${token()}`, [
        { stock: 1 },
      ]);
      await execute(
        'update product_variants set deleted_at = now() where id = ?',
        [variantIds[0]],
      );

      await history(variantIds[0]).expect(404);
    });
  });
});
