import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { MikroORM } from '@mikro-orm/core';
import mikroOrmConfig from './../../src/configs/mikro-orm.config.js';

// The database enforces the field specifications on its own, for writes that
// skip the API (raw SQL here).
describe('Field specification constraints (e2e)', () => {
  let moduleRef: TestingModule;
  let orm: MikroORM;
  const userIds: string[] = [];
  const categoryIds: string[] = [];
  const productIds: string[] = [];

  const run = (sql: string, params: unknown[] = []) =>
    orm.em.getConnection().execute(sql, params, 'run');
  const all = (
    sql: string,
    params: unknown[] = [],
  ): Promise<Record<string, unknown>[]> =>
    orm.em
      .getConnection()
      .execute<Record<string, unknown>[]>(sql, params, 'all');

  const suffix = (): string =>
    `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const insertUser = async (
    fields: {
      firstName?: string;
      lastName?: string;
      phoneNumber?: string;
    } = {},
  ): Promise<string> => {
    const id = randomUUID();
    const clerkId = `clerk-field-spec-${suffix()}`;
    await run(
      `insert into users (id, created_at, updated_at, clerk_id, email, first_name, last_name, phone_number)
       values (?, now(), now(), ?, ?, ?, ?, ?)`,
      [
        id,
        clerkId,
        `${clerkId}@example.com`,
        fields.firstName ?? 'Jane',
        fields.lastName ?? 'Doe',
        fields.phoneNumber ?? null,
      ],
    );
    userIds.push(id);
    return id;
  };

  const insertCategory = async (name = `Field Spec ${suffix()}`) => {
    const id = randomUUID();
    await run(
      `insert into categories (id, created_at, updated_at, name, slug) values (?, now(), now(), ?, ?)`,
      [id, name, `field-spec-${suffix()}`],
    );
    categoryIds.push(id);
    return id;
  };

  const insertProduct = async (name = `Field Spec Product ${suffix()}`) => {
    const categoryId = await insertCategory();
    const id = randomUUID();
    await run(
      `insert into products (id, created_at, updated_at, category_id, name, slug, description, roast_level, origin, processing_method)
       values (?, now(), now(), ?, ?, ?, 'Desc', 'MEDIUM', 'Ethiopia', 'Washed')`,
      [id, categoryId, name, `field-spec-product-${suffix()}`],
    );
    productIds.push(id);
    return id;
  };

  const insertImage = async (
    productId: string,
    sortOrder: number | null,
    deleted = false,
  ): Promise<string> => {
    const id = randomUUID();
    await run(
      `insert into product_images (id, created_at, updated_at, deleted_at, product_id, url, sort_order)
       values (?, now(), now(), ${deleted ? 'now()' : 'null'}, ?, 'https://example.com/i.jpg', ?)`,
      [id, productId, sortOrder],
    );
    return id;
  };

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [MikroOrmModule.forRoot(mikroOrmConfig)],
    }).compile();
    await moduleRef.init();
    orm = moduleRef.get(MikroORM);
  });

  afterAll(async () => {
    if (productIds.length) {
      await run(`delete from product_images where product_id in (?)`, [
        productIds,
      ]);
      await run(`delete from products where id in (?)`, [productIds]);
    }
    if (categoryIds.length) {
      await run(`delete from categories where id in (?)`, [categoryIds]);
    }
    if (userIds.length) {
      await run(`delete from users where id in (?)`, [userIds]);
    }
    await moduleRef.close();
  });

  it('refuses a 121-character name in each name column', async () => {
    const tooLong = 'a'.repeat(121);
    const tooLongFor120 = /value too long for type character varying\(120\)/;
    const userId = await insertUser();
    const categoryId = await insertCategory();
    const productId = await insertProduct();

    await expect(
      run(`update users set first_name = ? where id = ?`, [tooLong, userId]),
    ).rejects.toThrow(tooLongFor120);
    await expect(
      run(`update users set last_name = ? where id = ?`, [tooLong, userId]),
    ).rejects.toThrow(tooLongFor120);
    await expect(
      run(`update categories set name = ? where id = ?`, [tooLong, categoryId]),
    ).rejects.toThrow(tooLongFor120);
    await expect(
      run(`update products set name = ? where id = ?`, [tooLong, productId]),
    ).rejects.toThrow(tooLongFor120);
    await expect(insertUser({ firstName: tooLong })).rejects.toThrow(
      tooLongFor120,
    );
  });

  it('refuses an 11-character phone number', async () => {
    await expect(insertUser({ phoneNumber: '01234567890' })).rejects.toThrow(
      /value too long for type character varying\(10\)/,
    );
  });

  it('accepts a 120-character name and a 10-character phone number', async () => {
    const name = 'a'.repeat(120);
    const id = await insertUser({ firstName: name, phoneNumber: '0123456789' });

    const [row] = await all(
      `select first_name, phone_number from users where id = ?`,
      [id],
    );
    expect(row).toEqual({ first_name: name, phone_number: '0123456789' });
  });

  it('refuses a second live image of a product at the same sort order', async () => {
    const productId = await insertProduct();
    await insertImage(productId, 0);

    await expect(insertImage(productId, 0)).rejects.toThrow(
      /product_images_product_id_sort_order_unique/,
    );
  });

  it('lets a new image take the position of a soft-deleted one', async () => {
    const productId = await insertProduct();
    await insertImage(productId, null, true);
    await insertImage(productId, 0);

    const rows = await all(
      `select sort_order from product_images where product_id = ? order by sort_order nulls first`,
      [productId],
    );
    expect(rows).toEqual([{ sort_order: null }, { sort_order: 0 }]);
  });

  it('commits a soft-delete and a new image at the same position in one transaction', async () => {
    const productId = await insertProduct();
    const kept = await insertImage(productId, 0);
    const removed = await insertImage(productId, 1);
    const added = randomUUID();
    const connection = orm.em.getConnection();
    await connection.transactional(async (trx) => {
      await connection.execute(
        `update product_images set deleted_at = now(), sort_order = null where id = ?`,
        [removed],
        'run',
        trx,
      );
      await connection.execute(
        `insert into product_images (id, created_at, updated_at, product_id, url, sort_order)
         values (?, now(), now(), ?, 'https://example.com/new.jpg', 1)`,
        [added, productId],
        'run',
        trx,
      );
    });

    const rows = await all(
      `select id, sort_order from product_images where product_id = ? and deleted_at is null order by sort_order`,
      [productId],
    );
    expect(rows).toEqual([
      { id: kept, sort_order: 0 },
      { id: added, sort_order: 1 },
    ]);
  });

  it('declares the image key deferrable initially deferred', async () => {
    const [constraint] = await all(
      `select condeferrable, condeferred from pg_constraint where conname = 'product_images_product_id_sort_order_unique'`,
    );
    expect(constraint).toEqual({ condeferrable: true, condeferred: true });

    const productId = await insertProduct();
    const first = await insertImage(productId, 0);
    const second = await insertImage(productId, 1);
    const connection = orm.em.getConnection();
    await connection.transactional(async (trx) => {
      await connection.execute(
        `update product_images set sort_order = 1 where id = ?`,
        [first],
        'run',
        trx,
      );
      await connection.execute(
        `update product_images set sort_order = 0 where id = ?`,
        [second],
        'run',
        trx,
      );
    });

    const rows = await all(
      `select id, sort_order from product_images where product_id = ? order by sort_order`,
      [productId],
    );
    expect(rows).toEqual([
      { id: second, sort_order: 0 },
      { id: first, sort_order: 1 },
    ]);
  });
});
