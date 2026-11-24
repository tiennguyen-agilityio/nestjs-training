import { randomUUID } from 'node:crypto';
import { MikroORM } from '@mikro-orm/postgresql';
import { Migrator } from '@mikro-orm/migrations';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { MikroORM as AppOrm, RequestContext } from '@mikro-orm/core';
import mikroOrmConfig from './../../src/configs/mikro-orm.config.js';
import { AppModule } from './../../src/app.module.js';
import { initTestApp } from './../utils/init-test-app.util.js';
import { ProductVariantRepository } from './../../src/modules/product-variant/repositories/product-variant.repository.js';

const PREVIOUS = 'Migration20261124051827';

describe('order tables migration (e2e)', () => {
  let orm: MikroORM;

  const execute = <T = unknown>(sql: string, params: unknown[] = []) =>
    orm.em.getConnection().execute<T>(sql, params);

  const suffix = (): string =>
    `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const seedVariant = async (stock: number): Promise<string> => {
    const categoryId = randomUUID();
    const productId = randomUUID();
    const variantId = randomUUID();
    const tag = suffix();
    await execute(
      `insert into categories (id, name, slug, created_at, updated_at)
       values (?, ?, ?, now(), now())`,
      [categoryId, `Migration Category ${tag}`, `migration-category-${tag}`],
    );
    await execute(
      `insert into products (id, category_id, name, slug, description, origin,
         processing_method, roast_level, status, created_at, updated_at)
       values (?, ?, ?, ?, 'A coffee', 'Kenya', 'Washed', 'LIGHT', 'ACTIVE', now(), now())`,
      [
        productId,
        categoryId,
        `Migration Product ${tag}`,
        `migration-product-${tag}`,
      ],
    );
    await execute(
      `insert into product_variants (id, product_id, sku, size, unit, price,
         stock_quantity, created_at, updated_at)
       values (?, ?, ?, 250, 'G', 10, ?, now(), now())`,
      [variantId, productId, `SKU-MIG-${tag}`, stock],
    );
    return variantId;
  };

  const seedOrder = async (orderNumber = `ORD-${suffix()}`.slice(0, 20)) => {
    const userId = randomUUID();
    const methodId = randomUUID();
    const orderId = randomUUID();
    const tag = suffix();
    await execute(
      `insert into users (id, clerk_id, email, first_name, last_name, created_at, updated_at)
       values (?, ?, ?, 'Order', 'Owner', now(), now())`,
      [userId, `clerk-mig-${tag}`, `mig-${tag}@example.com`],
    );
    await execute(
      `insert into shipping_methods (id, name, description, price, status, created_at, updated_at)
       values (?, ?, 'A method', 12, 'ACTIVE', now(), now())`,
      [methodId, `Migration Method ${tag}`],
    );
    await execute(
      `insert into orders (id, user_id, shipping_method_id, order_number,
         recipient_name, recipient_phone, address_line, ward, district, city,
         postal_code, shipping_method_name, shipping_fee, tax, total_amount,
         created_at, updated_at)
       values (?, ?, ?, ?, 'Lan Nguyen', '0901234567', '12 Le Loi', 'Ben Nghe',
         'District 1', 'Ho Chi Minh City', '700000', 'Roast Express', 12, 2, 34,
         now(), now())`,
      [orderId, userId, methodId, orderNumber],
    );
    return { orderId, orderNumber };
  };

  const insertCharge = (orderId: string, status: string) =>
    execute(
      `insert into payments (id, order_id, type, method, status, amount, created_at, updated_at)
       values (?, ?, 'CHARGE', 'COD', ?, 34, now(), now())`,
      [randomUUID(), orderId, status],
    );

  beforeAll(async () => {
    orm = await MikroORM.init({
      ...mikroOrmConfig,
      preferTs: true,
      entities: [],
      entitiesTs: [],
      extensions: [Migrator],
      debug: false,
    });
    await orm.migrator.up();
  });

  afterAll(async () => {
    await orm.migrator.up();
    await orm.close();
  });

  it('migration adds reserved_quantity 0 to existing variants', async () => {
    await orm.migrator.down({ to: PREVIOUS });
    const variantId = await seedVariant(4);
    await orm.migrator.up();

    const rows = await execute<{ reserved_quantity: number }[]>(
      'select reserved_quantity from product_variants where id = ?',
      [variantId],
    );
    expect(rows).toEqual([{ reserved_quantity: 0 }]);
  });

  it('reserved_quantity cannot exceed stock_quantity', async () => {
    const variantId = await seedVariant(2);

    await expect(
      execute(
        'update product_variants set reserved_quantity = 3 where id = ?',
        [variantId],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      execute(
        'update product_variants set reserved_quantity = -1 where id = ?',
        [variantId],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('payments.checkout_session_id is nullable and unique when set', async () => {
    const insertWithSession = async (sessionId: string | null) => {
      const { orderId } = await seedOrder();
      return execute(
        `insert into payments (id, order_id, type, method, status, amount, checkout_session_id, created_at, updated_at)
         values (?, ?, 'CHARGE', 'CARD', 'PENDING', 34, ?, now(), now())`,
        [randomUUID(), orderId, sessionId],
      );
    };
    const sessionId = `cs_test_dup_${suffix()}`;

    await insertWithSession(null);
    await insertWithSession(null);
    await insertWithSession(sessionId);
    await expect(insertWithSession(sessionId)).rejects.toMatchObject({
      code: '23505',
    });
  });

  it('order_number is unique', async () => {
    const { orderNumber } = await seedOrder();

    await expect(seedOrder(orderNumber)).rejects.toMatchObject({
      code: '23505',
    });
  });

  it('order_items has no timestamp columns', async () => {
    const columns = await execute<{ column_name: string }[]>(
      `select column_name from information_schema.columns
       where table_schema = current_schema() and table_name = 'order_items'
       order by column_name`,
    );

    expect(columns.map((c) => c.column_name)).toEqual([
      'discount_amount',
      'id',
      'order_id',
      'product_image',
      'product_name',
      'product_variant_id',
      'quantity',
      'unit_price',
      'variant_name',
    ]);
  });

  it('a second PENDING CHARGE for one order is rejected', async () => {
    const { orderId } = await seedOrder();
    await insertCharge(orderId, 'PENDING');

    await expect(insertCharge(orderId, 'PENDING')).rejects.toMatchObject({
      code: '23505',
    });
    await expect(insertCharge(orderId, 'FAILED')).resolves.toBeDefined();
  });

  it('deleting a variant row used by an order item is restricted', async () => {
    const variantId = await seedVariant(5);
    const { orderId } = await seedOrder();
    await execute(
      `insert into order_items (id, order_id, product_variant_id, product_name,
         product_image, variant_name, unit_price, discount_amount, quantity)
       values (?, ?, ?, 'Kenya AA', 'https://example.com/a.jpg', '250g', 10, 0, 2)`,
      [randomUUID(), orderId, variantId],
    );

    await expect(
      execute('delete from product_variants where id = ?', [variantId]),
    ).rejects.toMatchObject({ code: '23001' });
  });
});

describe('product variant reserve (e2e)', () => {
  let app: INestApplication;
  let orm: AppOrm;
  let repository: ProductVariantRepository;

  const execute = async <T = unknown>(
    sql: string,
    params: unknown[] = [],
  ): Promise<T> => (await orm.em.getConnection().execute(sql, params)) as T;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = await initTestApp(moduleFixture);
    orm = app.get(AppOrm);
    repository = app.get(ProductVariantRepository);
  });

  afterAll(async () => {
    await app.close();
  });

  it('reserve holds stock only while available', async () => {
    const [{ id: variantId }] = await execute<{ id: string }[]>(
      `update product_variants set stock_quantity = 3, reserved_quantity = 0
       where id = (select id from product_variants order by created_at desc limit 1)
       returning id`,
    );

    const reserve = (quantity: number) =>
      RequestContext.create(orm.em, () =>
        repository.reserve(variantId, quantity, null),
      );

    await expect(reserve(2)).resolves.toBe(true);
    await expect(reserve(2)).resolves.toBe(false);
    await expect(reserve(1)).resolves.toBe(true);

    const rows = await execute<{ reserved_quantity: number }[]>(
      'select reserved_quantity from product_variants where id = ?',
      [variantId],
    );
    expect(rows).toEqual([{ reserved_quantity: 3 }]);
  });

  it('reserve stamps updated_at and updated_by with the actor', async () => {
    const userId = randomUUID();
    const tag = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await execute(
      `insert into users (id, clerk_id, email, first_name, last_name, created_at, updated_at)
       values (?, ?, ?, 'Order', 'Owner', now(), now())`,
      [userId, `clerk-reserve-${tag}`, `reserve-${tag}@example.com`],
    );
    const [{ id: variantId }] = await execute<{ id: string }[]>(
      `update product_variants set stock_quantity = 3, reserved_quantity = 0,
         updated_at = now() - interval '1 day', updated_by = null
       where id = (select id from product_variants order by created_at desc limit 1)
       returning id`,
    );

    await RequestContext.create(orm.em, () =>
      repository.reserve(variantId, 1, userId),
    );

    const [row] = await execute<{ updated_by: string; fresh: boolean }[]>(
      `select updated_by, updated_at > now() - interval '1 minute' as fresh
       from product_variants where id = ?`,
      [variantId],
    );
    expect(row).toEqual({ updated_by: userId, fresh: true });
  });

  it('reload reads the stock committed after the variant was loaded', async () => {
    const [{ id: variantId }] = await execute<{ id: string }[]>(
      `update product_variants set stock_quantity = 5, reserved_quantity = 0
       where id = (select id from product_variants order by created_at desc limit 1)
       returning id`,
    );

    const reserved = await RequestContext.create(orm.em, async () => {
      const variant = await repository.findById(variantId);
      await execute(
        'update product_variants set reserved_quantity = 3 where id = ?',
        [variantId],
      );
      return (await repository.reload(variant!)).reservedQuantity;
    });

    expect(reserved).toBe(3);
  });
});
